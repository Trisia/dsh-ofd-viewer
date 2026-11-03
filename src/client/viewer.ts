/**
 * 官方 @ofdrw/ofdrw-viewer-ui 的按需加载与实例生命周期。
 * 阅读器与样式都是动态 import 的独立静态文件，首次使用时才下载。
 */
import type { LocalFontsStatus, OFDViewer, OFDViewerOptions } from '@ofdrw/ofdrw-viewer-ui'
import { mountViewerStyles } from './styles.js'

/** 字体路由前缀，与宿主半（src/host/index.ts）保持一致。 */
export const FONT_PREFIX = '/ofd-viewer-plugin/fonts'

/** 阅读器实例中本插件用到的成员。 */
export interface OfdViewerInstance {
  /** 首屏就绪 */
  readonly ready: Promise<unknown>
  /** 销毁实例并释放渲染资源 */
  destroy(): void
  /** 阅读器根节点（带 `.ofd-viewer` 类） */
  getRoot(): HTMLElement
  /** 读取本机字体状态；纯查询，不申请浏览器授权 */
  getLocalFontsStatus(): LocalFontsStatus
  /** 设置「使用本机字体」开关；开启方向会申请浏览器授权并重开文档 */
  setLocalFontsEnabled(enabled: boolean): Promise<void>
  /** 订阅本机字体状态变化，返回退订函数 */
  onLocalFontsStatusChange(handler: (status: LocalFontsStatus) => void): () => void
}

/** 官方阅读器模块中本插件用到的部分（其余导出不使用）。 */
interface OfdViewerModule {
  /** 阅读器类 */
  OFDViewer: typeof OFDViewer
}

/** 官方阅读器模块缓存。 */
let viewerModulePromise: Promise<OfdViewerModule> | undefined
/** 官方阅读器样式文本缓存。 */
let viewerCssPromise: Promise<string> | undefined

/**
 * 按需加载官方阅读器模块（依赖声明在 package.json，构建时打包为独立分块懒加载）。
 *
 * @returns 模块
 */
function loadViewerModule(): Promise<OfdViewerModule> {
  viewerModulePromise ??= import('@ofdrw/ofdrw-viewer-ui').catch((error: unknown) => {
    viewerModulePromise = undefined
    throw error
  })
  return viewerModulePromise
}

/**
 * 读取官方阅读器样式；由构建脚本从依赖包抽取为字符串模块。
 *
 * @returns 样式文本
 */
function loadViewerCss(): Promise<string> {
  viewerCssPromise ??= import('../styles/ofdrw-viewer.css.js').then((module) => String(module.default))
  return viewerCssPromise
}

/**
 * 构造阅读器选项：功能全开，字体走宿主路由，缺字回退到内置思源宋体/黑体。
 * 本机字体能力开启且默认启用：授权后按文档声明优先使用本机已安装的同名字体。
 *
 * @param container 挂载点
 * @param source OFD 字节
 * @returns 构造选项
 */
function viewerOptions(container: HTMLElement, source: Uint8Array): OFDViewerOptions {
  return {
    container,
    // 复制成同源的普通 Uint8Array，避免被引擎当作其他 realm 的视图
    source: new Uint8Array(source),
    locale: 'zh-CN',
    // 阅读器保持浅色文档底色：白色纸张与工具栏文字在任何宿主主题下都清晰
    theme: 'light',
    supersample: 'high',
    fonts: {
      default: [{ url: `${FONT_PREFIX}/source-han-serif-sc.woff2`, family: '宋体' }],
      supplementary: [{ url: `${FONT_PREFIX}/source-han-sans-sc.woff2` }],
      aliases: [
        ['宋体', 'simsun', 'nsimsun', 'notoserifcjksc', 'sourcehanserifsc', 'stsong'],
        ['黑体', 'simhei', 'microsoftyahei', '微软雅黑', 'notosanscjksc', 'sourcehansanssc'],
      ],
      localFonts: {
        // 启用本机字体能力（浏览器 Local Font Access API），开关才能显示
        enabled: true,
        // 首次使用时默认尝试启用；浏览器授权失败时自动回到内置字体
        defaultEnabled: true,
        // 用户的手动选择记在 localStorage，下次打开时沿用
        remember: true,
      },
    },
    onError: (info: { code?: string; message?: string }) => console.warn('[ofd-viewer] error', info.code, info.message),
    debug: { console: false },
  }
}

/**
 * 在容器里创建阅读器。
 *
 * @param container 挂载点（需具备确定高度）
 * @param source OFD 字节
 * @param onViewer 实例创建后的回调；卸载或创建失败时以 null 回调
 * @returns 清理函数：销毁实例并移除本次注入的样式
 */
export function mountViewer(container: HTMLElement, source: Uint8Array, onViewer?: (viewer: OfdViewerInstance | null) => void): () => void {
  let viewer: OfdViewerInstance | undefined
  let unmountStyles: (() => void) | undefined
  let disposed = false
  void loadViewerCss()
    .then((css) => {
      if (disposed) return
      unmountStyles = mountViewerStyles(css)
    })
    .catch((error: unknown) => console.warn('[ofd-viewer] style load failed', error))
  void loadViewerModule()
    .then((module) => {
      if (disposed) return
      container.replaceChildren()
      viewer = new module.OFDViewer(viewerOptions(container, source)) as unknown as OfdViewerInstance
      onViewer?.(viewer)
      viewer.ready.catch((error: unknown) => console.error('[ofd-viewer] open failed', error))
    })
    .catch((error: unknown) => console.error('[ofd-viewer] module load failed', error))
  return () => {
    disposed = true
    onViewer?.(null)
    try {
      viewer?.destroy()
    } catch (error) {
      console.warn('[ofd-viewer] destroy failed', error)
    }
    unmountStyles?.()
    container.replaceChildren()
  }
}
