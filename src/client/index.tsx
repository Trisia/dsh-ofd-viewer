/**
 * 插件入口：声明 .ofd 预览、注册 OFD 面板与输入框附件预览。
 */
import type { ClientContext, ClientModule, ClientRemote, Translate } from './contracts.js'
import { en, zh } from './locale.js'
import { mountPluginStyles } from './styles.js'
import { ComposerAttachments } from './components/ComposerAttachments.js'
import { DocumentBody } from './components/DocumentBody.js'
import { createPanelStore, MainPanel } from './components/MainPanel.js'
import { extensionOf, formatSize, isOfdName, parseFileAddress } from './utils.js'

/** 文案命名空间。 */
const NS = 'ofdViewer'

/** 侧栏文档预览实现 id，同时是渲染体插槽 key。 */
const RENDERER_ID = 'dsh-ofd-viewer/ofd'

/** 主面板 key。 */
const PANEL_KEY = 'ofd-viewer'

/** 接管预览的文件后缀（小写、不含点）。 */
const OFD_EXTENSIONS = ['ofd']

/**
 * 插件入口。
 *
 * @param ctx 客户端上下文
 * @returns 无返回值
 */
function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ofd-viewer: dictionaries')
  const t: Translate = ctx.locale.bind(NS)
  const store = createPanelStore()
  ctx.effect(() => mountPluginStyles(), 'ofd-viewer: styles')

  /**
   * 切换主面板。
   * @param key 面板 key；null 回到对话
   * @returns 无返回值
   */
  const selectPanel = (key: string | null): void => {
    ctx.layout.selectPanel(key)
  }

  // 主面板：展示待预览 OFD；插件自身即可选择文件预览（不依赖面板图标入口）
  ctx.effect(() => {
    try {
      return ctx.slots.register({ name: 'main', key: PANEL_KEY, locale: NS }, (props) =>
        MainPanel({ t, store, useSession: props.useSession ?? (() => undefined), close: () => selectPanel(null) }),
      )
    } catch (error) {
      console.error('[ofd-viewer] main panel registration failed', error)
      return () => {}
    }
  }, 'ofd-viewer: main panel')

  // 侧栏文档预览：声明 .ofd 渲染器并注册渲染体
  const previews = ctx.get('documentPreviews') as { register(definition: unknown): () => void } | undefined
  if (previews !== undefined) {
    ctx.effect(
      () =>
        previews.register({
          id: RENDERER_ID,
          extensions: OFD_EXTENSIONS,
          binaryExtensions: OFD_EXTENSIONS,
          priority: 'extension',
          title: () => t('renderer.title'),
          loading: 'renderer',
        }),
      'ofd-viewer: preview definition',
    )
    ctx.effect(
      () =>
        ctx.slots.inject('sidebar.right.tab.document', () =>
          ctx.slots.register({ name: 'sidebar.right.tab.document', key: RENDERER_ID, locale: NS }, (props) => {
            const remote = ctx.get('remote') as ClientRemote | undefined
            if (remote === undefined || typeof props.resourceAddress !== 'string') return null
            return DocumentBody({ resourceAddress: props.resourceAddress, content: props.content, remote, t, scrollportRef: props.scrollportRef })
          }),
        ),
      'ofd-viewer: preview body',
    )
  }

  // 输入框附件栏：接管草稿附件呈现，给 OFD 卡片加「查看」入口
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.input.attachments', () =>
        // 单值附件栏：覆盖宿主实现需显式给更低的 priority（单值插槽数值最低者渲染）
        ctx.slots.register({ name: 'conversation.input.attachments', priority: -100, locale: NS }, (props) =>
          ComposerAttachments({
            attachments: props.attachments ?? [],
            canAcceptDrop: props.canAcceptDrop === true,
            onAddFiles: props.onAddFiles,
            onRemoveAttachment: props.onRemoveAttachment,
            uploads: props.uploads ?? {},
            onRetryFile: props.onRetryFile,
            t,
            openOfd: (file) => {
              // 附件栏的 sessionId 是当前会话；面板按同一标识读取待预览文件
              const sessionId = props.sessionId as unknown
              if (typeof sessionId === 'string' && sessionId !== '') store.show(sessionId, file)
              selectPanel(PANEL_KEY)
            },
          }),
        ),
      ),
    'ofd-viewer: composer attachments',
  )
}

/** 浏览器模块表登记的模块面。 */
const module: ClientModule = {
  name: 'dsh-ofd-viewer',
  // 布局服务用于切换主面板；声明为必需依赖，Cordis 会在提供后激活本插件
  inject: ['slots', 'locale', 'layout'],
  apply,
  internal: { isOfdName, extensionOf, formatSize, parseFileAddress },
}

export default module
export { apply }
