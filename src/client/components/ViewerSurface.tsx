/**
 * 阅读器表面：加载字节后挂载官方阅读器，卸载时释放画布与事件。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { Translate } from '../contracts.js'
import { mountViewer } from '../viewer.js'

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
  /** 外层类名，缺省铺满容器 */
  className?: string
}

/**
 * 阅读器表面。
 *
 * @param props 组件属性
 * @returns 阅读器容器与错误提示
 */
export function ViewerSurface({ load, t, failureText, className }: ViewerSurfaceProps): ReactNode {
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
        destroy = mountViewer(container, bytes)
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
