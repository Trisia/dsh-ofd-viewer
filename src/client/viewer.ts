/**
 * 官方 @ofdrw/ofdrw-viewer-ui 的按需加载与实例生命周期。
 * 阅读器与样式都是动态 import 的独立静态文件，首次使用时才下载。
 */
import type { OFDViewer, OFDViewerOptions } from '@ofdrw/ofdrw-viewer-ui'
import { mountViewerStyles } from './styles.js'

/** 字体路由前缀，与宿主半（src/host/index.ts）保持一致。 */
export const FONT_PREFIX = '/ofd-viewer-plugin/fonts'

/** 阅读器实例中本插件用到的成员。 */
export interface OfdViewerInstance {
  /** 首屏就绪 */
  readonly ready: Promise<unknown>
  /** 销毁实例并释放渲染资源 */
  destroy(): void
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
 * @returns 清理函数：销毁实例并移除本次注入的样式
 */
export function mountViewer(container: HTMLElement, source: Uint8Array): () => void {
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
      viewer = new module.OFDViewer(viewerOptions(container, source))
      viewer.ready.catch((error: unknown) => console.error('[ofd-viewer] open failed', error))
    })
    .catch((error: unknown) => console.error('[ofd-viewer] module load failed', error))
  return () => {
    disposed = true
    try {
      viewer?.destroy()
    } catch (error) {
      console.warn('[ofd-viewer] destroy failed', error)
    }
    unmountStyles?.()
    container.replaceChildren()
  }
}
