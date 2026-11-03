/**
 * 插件入口：声明 .ofd 预览、注册 OFD 面板与输入框附件预览。
 */
import type {
  ClientContext,
  ClientModule,
  DocumentPreviewsService,
  Translate,
  WorkspaceFilesRemote,
} from './contracts.js'
import { en, zh } from './locale.js'
import { mountPluginStyles } from './styles.js'
import { ComposerAttachments } from './components/ComposerAttachments.js'
import { DocumentBody } from './components/DocumentBody.js'
import { createPanelStore, MainPanel } from './components/MainPanel.js'
import { extensionOf, formatSize, isOfdName, parseFileAddress } from './utils.js'

/** 文案命名空间。 */
const NS = 'ofdViewer'

/** 侧栏文档预览实现 id，同时是渲染体插槽 key。 */
const RENDERER_ID = '@cliven/dsh-ofd-viewer/ofd'

/** 主面板 key。 */
const PANEL_KEY = 'ofd-viewer'

/** 接管预览的文件后缀（小写、不含点）。 */
const OFD_EXTENSIONS = ['ofd']

/** 宿主注册的 `workspaceFiles` Remote 命名空间服务名（服务名本身含点）。 */
const WORKSPACE_FILES_SERVICE = 'remote.workspaceFiles'

/** documentPreviews 服务的重试上限（单位 次）。 */
const PREVIEW_SERVICE_ATTEMPTS = 120

/** 两次重试的间隔（单位 毫秒）。 */
const PREVIEW_SERVICE_INTERVAL_MS = 50

/**
 * 读取 `remote.workspaceFiles` 命名空间服务。
 *
 * 宿主把它注册成独立服务，服务名里带点，无法写成 `ctx.remote.workspaceFiles`：
 * `remote` 只是命名空间前缀、不是已提供的服务，点号写法会一直报
 * cannot get property，因此按服务名取值。
 *
 * @param ctx 客户端上下文
 * @returns 命名空间服务；尚未挂载时返回 undefined
 */
function workspaceFilesOf(ctx: ClientContext): WorkspaceFilesRemote | undefined {
  const service = ctx.get(WORKSPACE_FILES_SERVICE)
  if (typeof service !== 'object' || service === null) return undefined
  return service as WorkspaceFilesRemote
}

/**
 * 等侧栏文档预览服务可用后登记渲染器。
 *
 * documentPreviews 由 @deepseek-ai/dsh-client-ui-sidebar-documentpreview 在自己的 apply 中提供，
 * 而启动图按 URL 长度把插件切成若干并行加载的批次，`dsh.client.inject` 只能保证同一批次内的先后。
 * 两个包可能落在不同批次，下载完成顺序也不固定，因此这里不能只在 apply 时查一次：
 * 拿不到服务就继续等，服务出现后再登记，超时仍缺失则明确报错，便于定位。
 *
 * @param ctx 客户端上下文
 * @param use 服务可用后的登记回调
 * @returns 无返回值
 */
function watchDocumentPreviews(ctx: ClientContext, use: (previews: DocumentPreviewsService) => void): void {
  let disposed = false
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /**
   * 检查一次服务是否可用。
   * @returns 无返回值
   */
  const check = (): void => {
    if (disposed) return
    const previews = ctx.get('documentPreviews') as DocumentPreviewsService | undefined
    if (previews !== undefined) {
      use(previews)
      return
    }
    attempts += 1
    if (attempts >= PREVIEW_SERVICE_ATTEMPTS) {
      console.error('[ofd-viewer] documentPreviews service never became available; the Sidebar OFD preview stays disabled')
      return
    }
    timer = setTimeout(check, PREVIEW_SERVICE_INTERVAL_MS)
  }
  ctx.effect(() => {
    check()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, 'ofd-viewer: preview service')
}

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
  watchDocumentPreviews(ctx, (previews) => {
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
            const workspaceFiles = workspaceFilesOf(ctx)
            if (workspaceFiles === undefined || typeof props.resourceAddress !== 'string') return null
            return DocumentBody({
              resourceAddress: props.resourceAddress,
              content: props.content,
              workspaceFiles,
              t,
              scrollportRef: props.scrollportRef,
            })
          }),
        ),
      'ofd-viewer: preview body',
    )
  })

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
            dropLimits: props.dropLimits,
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
  name: '@cliven/dsh-ofd-viewer',
  // 布局服务用于切换主面板；声明为必需依赖，Cordis 会在提供后激活本插件。
  // Remote 命名空间按服务名解析，同样需要声明，否则 ctx.get 取不到。
  inject: ['slots', 'locale', 'layout', WORKSPACE_FILES_SERVICE],
  apply,
  internal: { isOfdName, extensionOf, formatSize, parseFileAddress },
}

export default module
export { apply }
