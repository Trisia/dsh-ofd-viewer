/**
 * 阅读器表面：加载字节后挂载官方阅读器，卸载时释放画布与事件。
 * 阅读器自带的工具栏由面板统一提供（见 ViewerToolbar），这里关闭内置工具栏。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { Translate } from '../contracts.js'
import { mountViewer, type OfdViewerInstance } from '../viewer.js'

/** 阅读器实例（面板通过它驱动翻页、缩放等命令）。 */
export type ViewerInstance = OfdViewerInstance

/** 组件属性。 */
interface ViewerSurfaceProps {
  /**
   * 读取字节。
   * @param signal 取消信号
   * @returns OFD 字节
   */
  load: (signal: AbortSignal) => Promise<Uint8Array>
  /** 翻译函数 */
  t: Translate
  /**
   * 失败文案。
   * @param message 错误信息
   * @returns 展示文案
   */
  failureText: (message: string) => string
  /**
   * 阅读器就绪回调：拿到实例后由面板接管工具栏；卸载或失败时为 null。
   * @param viewer 阅读器实例
   * @returns 无返回值
   */
  onViewer?: (viewer: ViewerInstance | null) => void
  /** 外层类名，缺省铺满容器 */
  className?: string
}

/**
 * 阅读器表面。
 *
 * @param props 组件属性
 * @returns 阅读器容器与错误提示
 */
export function ViewerSurface({ load, t, failureText, onViewer, className }: ViewerSurfaceProps): ReactNode {
  const { useEffect, useRef, useState } = requireModule<typeof import('react')>('react')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [failure, setFailure] = useState('')
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return undefined
    const controller = new AbortController()
    let destroy: (() => void) | null = null
    let disposed = false
    setFailure('')
    load(controller.signal)
      .then((bytes) => {
        if (disposed) return
        destroy = mountViewer(container, bytes, (viewer) => onViewer?.(viewer))
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return
        console.error('[ofd-viewer] read failed', error)
        setFailure(error instanceof Error ? error.message : String(error))
      })
    return () => {
      disposed = true
      controller.abort()
      destroy?.()
    }
  }, [])
  return (
    <div className={className ?? 'ofd-pv-container'}>
      <div className="ofd-pv-host" ref={containerRef} aria-label={t('panel.previewAria')} />
      {failure !== '' && (
        <div className="ofd-pv-status ofd-pv-status-error" role="alert">
          {failureText(failure)}
        </div>
      )}
    </div>
  )
}
