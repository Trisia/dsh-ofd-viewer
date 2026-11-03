/**
 * 阅读器面板的统一工具栏。
 *
 * 阅读器自带的工具栏与面板头曾同时出现，形成两条重复的栏；现在只保留这一条：
 * 左侧是文档信息、内嵌与关闭，右侧是阅读器命令。命令直接调用官方实例方法，
 * 读数订阅官方事件，因此不需要访问私有外壳。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { ViewerInstance } from './ViewerSurface.js'

/** 缩放模式。 */
type ZoomMode = 'auto' | 'page-actual' | 'page-fit' | 'page-width'

/** 阅读器状态快照中本工具栏读取的字段。 */
interface ViewerState {
  /** 视图状态 */
  readonly view?: {
    /** 当前页，1-based，单位 页 */
    readonly pageNumber?: number
    /** 缩放模式 */
    readonly zoomMode?: string
    /** 实际缩放倍率 */
    readonly scale?: number
    /** 侧栏视图；null 表示收起 */
    readonly sidebarView?: string | null
    /** 是否处于全屏 */
    readonly fullscreen?: boolean
  }
  /** 文档状态 */
  readonly document?: {
    /** 总页数，单位 页 */
    readonly pageCount?: number
    /** 文档状态；`opened` 表示已打开 */
    readonly status?: string
  }
}

/** 工具栏所需的阅读器能力（官方 OFDViewer 公开方法的子集）。 */
export interface ToolbarViewer extends ViewerInstance {
  /** 最新状态快照 */
  getState(): ViewerState
  /** 跳转到指定页 */
  goToPage(pageNumber: number): unknown
  /** 下一页 */
  nextPage(): unknown
  /** 上一页 */
  previousPage(): unknown
  /** 放大一级 */
  zoomIn(): unknown
  /** 缩小一级 */
  zoomOut(): unknown
  /** 设置缩放模式 */
  setZoomMode(mode: ZoomMode): unknown
  /** 顺时针旋转 90° */
  rotateClockwise(): unknown
  /** 打开指定侧栏 */
  openSidebar(view: string): unknown
  /** 收起侧栏 */
  closeSidebar(): unknown
  /** 执行查找 */
  find(query: string): unknown
  /** 打印 */
  print(): unknown
  /** 导出原 OFD */
  exportOfd(): Promise<{ readonly blob: Blob; readonly fileName?: string }>
  /** 订阅事件 */
  on(event: string, handler: () => void): () => void
  /** 合并功能开关 */
  setFeatures(patch: Record<string, boolean>): void
}

/** 工具栏属性。 */
export interface ViewerToolbarProps {
  /** 文档名，用作工具栏的无障碍名称 */
  name: string
  /** 阅读器实例；尚未就绪时为 null */
  viewer: ToolbarViewer | null
  /**
   * 失败文案。
   * @param message 错误信息
   * @returns 展示文案
   */
  failureText: (message: string) => string
  /** 内嵌版面是否开启；为 undefined 时不显示内嵌按钮 */
  inline?: boolean
  /**
   * 切换内嵌版面。
   * @returns 无返回值
   */
  onToggleInline?: () => void
  /** 关闭面板 */
  close: () => void
  /** 文案 */
  labels: ViewerToolbarLabels
}

/** 工具栏文案。 */
export interface ViewerToolbarLabels {
  /** 文档侧栏（缩略图、目录、签章） */
  sidebar: string
  /** 上一页 */
  previousPage: string
  /** 下一页 */
  nextPage: string
  /** 页码输入 */
  pageNumber: string
  /** 缩小 */
  zoomOut: string
  /** 放大 */
  zoomIn: string
  /** 缩放模式 */
  zoomMode: string
  /** 旋转 */
  rotate: string
  /** 查找 */
  find: string
  /** 打印 */
  print: string
  /** 下载 */
  download: string
  /** 全屏 */
  fullscreen: string
  /** 退出全屏 */
  exitFullscreen: string
  /** 内嵌 */
  inline: string
  /** 关闭 */
  close: string
  /** 关闭 OFD 预览 */
  closeAria: string
}

/** 缩放下拉的固定选项（与官方工具栏一致）。 */
const ZOOM_MODES: readonly (readonly [ZoomMode, string])[] = [
  ['auto', '自动'],
  ['page-actual', '实际大小'],
  ['page-fit', '适合页面'],
  ['page-width', '适合宽度'],
]

/** 会改变工具栏读数的阅读器事件。 */
const STATE_EVENTS = ['statechange', 'featureschange'] as const

/**
 * 工具栏。
 *
 * @param props 组件属性
 * @returns 工具栏
 */
export function ViewerToolbar(props: ViewerToolbarProps): ReactNode {
  const { createElement, useEffect, useRef, useState } = requireModule<typeof import('react')>('react')
  const { viewer, labels } = props
  const [open, setOpen] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoomMode, setZoomMode] = useState('auto')
  const [scale, setScale] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const pageInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (viewer === null) return undefined
    // 面板自己提供工具栏：关闭阅读器内置工具栏，避免两条并排
    viewer.setFeatures({ toolbar: false })
    /**
     * 把官方状态映射到工具栏读数。
     * @returns 无返回值
     */
    const sync = (): void => {
      const state = viewer.getState()
      const count = state.document?.pageCount ?? 0
      setOpen(state.document?.status === 'opened' && count > 0)
      setPageCount(count)
      setPageNumber(state.view?.pageNumber ?? 1)
      setZoomMode(state.view?.zoomMode ?? 'auto')
      setScale(state.view?.scale ?? 1)
      setSidebarOpen((state.view?.sidebarView ?? null) !== null)
      setFullscreen(state.view?.fullscreen === true)
      // 读数变化时回填页码输入框，避免停留旧的半截输入
      if (pageInput.current !== null) pageInput.current.value = String(state.view?.pageNumber ?? 1)
    }
    sync()
    const offs = STATE_EVENTS.map((event) => viewer.on(event, sync))
    return () => {
      for (const off of offs) off()
    }
  }, [viewer])

  /**
   * 提交页码；非法值回填当前页。
   * @returns 无返回值
   */
  const commitPage = (): void => {
    const input = pageInput.current
    if (viewer === null || input === null) return
    const parsed = Number.parseInt(input.value, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > pageCount) {
      input.value = String(pageNumber)
      return
    }
    void viewer.goToPage(parsed)
  }

  /**
   * 下载原始 OFD 文件。
   * @returns 无返回值
   */
  const download = async (): Promise<void> => {
    if (viewer === null) return
    try {
      const result = await viewer.exportOfd()
      const url = URL.createObjectURL(result.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.fileName !== undefined && result.fileName !== '' ? result.fileName : props.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      console.error('[ofd-viewer] export failed', cause)
      window.alert(props.failureText(cause instanceof Error ? cause.message : String(cause)))
    }
  }

  /**
   * 切换浏览器全屏。
   * @returns 无返回值
   */
  const toggleFullscreen = async (): Promise<void> => {
    if (viewer === null) return
    try {
      if (document.fullscreenElement === null) await viewer.getRoot().requestFullscreen()
      else await document.exitFullscreen()
    } catch (cause) {
      console.warn('[ofd-viewer] fullscreen failed', cause)
    }
  }

  /**
   * 切换官方侧栏（缩略图、目录、签章等）。
   * @returns 无返回值
   */
  const toggleSidebar = (): void => {
    if (viewer === null) return
    void (sidebarOpen ? viewer.closeSidebar() : viewer.openSidebar('thumbnails'))
  }

  const total = pageCount > 0 ? pageCount : 0
  const current = open ? Math.min(Math.max(pageNumber, 1), Math.max(total, 1)) : 1

  return (
    <div className="ofd-pv-head">
      <div className="ofd-pv-actions" role="toolbar" aria-label={props.name}>
        <button type="button" className="ofd-pv-tool" aria-label={labels.sidebar} title={labels.sidebar} aria-expanded={sidebarOpen} disabled={!open} onClick={toggleSidebar}>
          ☰
        </button>
        <button type="button" className="ofd-pv-tool" aria-label={labels.previousPage} title={labels.previousPage} disabled={!open || current <= 1} onClick={() => void viewer?.previousPage()}>
          ‹
        </button>
        <span className="ofd-pv-page">
          <input
            ref={pageInput}
            className="ofd-pv-page-input"
            type="number"
            min="1"
            max={Math.max(total, 1)}
            step="1"
            inputMode="numeric"
            defaultValue={current}
            aria-label={labels.pageNumber}
            disabled={!open}
            onBlur={commitPage}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          <span className="ofd-pv-page-total">/ {total > 0 ? total : '—'}</span>
        </span>
        <button type="button" className="ofd-pv-tool" aria-label={labels.nextPage} title={labels.nextPage} disabled={!open || current >= Math.max(total, 1)} onClick={() => void viewer?.nextPage()}>
          ›
        </button>
        <span className="ofd-pv-sep" aria-hidden="true" />
        <button type="button" className="ofd-pv-tool" aria-label={labels.zoomOut} title={labels.zoomOut} disabled={!open} onClick={() => void viewer?.zoomOut()}>
          −
        </button>
        <button type="button" className="ofd-pv-tool" aria-label={labels.zoomIn} title={labels.zoomIn} disabled={!open} onClick={() => void viewer?.zoomIn()}>
          ＋
        </button>
        <select
          className="ofd-pv-select"
          aria-label={labels.zoomMode}
          title={labels.zoomMode}
          disabled={!open}
          value={zoomMode}
          onChange={(event) => void viewer?.setZoomMode(event.target.value as ZoomMode)}
        >
          {ZOOM_MODES.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
          {!ZOOM_MODES.some(([value]) => value === zoomMode) && <option value={zoomMode}>{`${Math.round(scale * 100)}%`}</option>}
        </select>
        <button type="button" className="ofd-pv-tool" aria-label={labels.rotate} title={labels.rotate} disabled={!open} onClick={() => void viewer?.rotateClockwise()}>
          ↻
        </button>
        <button type="button" className="ofd-pv-tool" aria-label={labels.find} title={labels.find} disabled={!open} onClick={() => void viewer?.find('')}>
          ⌕
        </button>
        <button type="button" className="ofd-pv-tool" aria-label={labels.print} title={labels.print} disabled={!open} onClick={() => void viewer?.print()}>
          ⎙
        </button>
        <button type="button" className="ofd-pv-tool" aria-label={labels.download} title={labels.download} disabled={!open} onClick={() => void download()}>
          ↓
        </button>
        <button
          type="button"
          className="ofd-pv-tool"
          aria-label={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          title={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          aria-pressed={fullscreen}
          disabled={!open}
          onClick={() => void toggleFullscreen()}
        >
          ⛶
        </button>
      </div>
      {props.inline !== undefined && (
        <button type="button" className="ofd-pv-chip" aria-pressed={props.inline} onClick={props.onToggleInline}>
          {labels.inline}
        </button>
      )}
      <button type="button" className="ofd-pv-close" aria-label={labels.closeAria} title={labels.close} onClick={props.close}>
        ✕
      </button>
    </div>
  )
}
