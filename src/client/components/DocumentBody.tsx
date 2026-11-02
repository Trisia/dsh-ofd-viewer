/**
 * 侧栏文档预览渲染体：读取 .ofd 字节并渲染阅读器。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { ClientRemote, RendererContent, Translate } from '../contracts.js'
import { parseFileAddress } from '../utils.js'
import { mountViewer } from '../viewer.js'

/** 渲染体属性（宿主 owner props 的子集）。 */
export interface DocumentBodyProps {
  /** 文件资源地址 */
  resourceAddress: string
  /** `renderer` 模式的加载请求 */
  content?: RendererContent
  /** 客户端 Remote 面 */
  remote: ClientRemote
  /** 翻译函数 */
  t: Translate
  /**
   * 报告渲染体自己的滚动容器。
   * @param node 容器
   * @returns 无返回值
   */
  scrollportRef?: (node: HTMLElement | null) => void
}

/**
 * 侧栏文档预览渲染体。
 *
 * @param props 组件属性
 * @returns 渲染体
 */
export function DocumentBody({ resourceAddress, content, remote, t, scrollportRef }: DocumentBodyProps): ReactNode {
  const { useEffect, useLayoutEffect, useRef, useState } = requireModule<typeof import('react')>('react')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [failure, setFailure] = useState('')
  useLayoutEffect(() => {
    if (containerRef.current !== null) scrollportRef?.(containerRef.current)
  }, [])
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return undefined
    const controller = new AbortController()
    let destroy: (() => void) | null = null
    let disposed = false
    setFailure('')
    void (async () => {
      const file = parseFileAddress(resourceAddress)
      const result = await remote.workspaceFiles.readBytes(file.sessionId, file.path, {}, controller.signal)
      if (disposed) return
      if (!result.ok) {
        setFailure(result.error.message ?? result.error.code ?? 'read failed')
        content?.failed?.()
        return
      }
      destroy = mountViewer(container, new Uint8Array(result.value.data))
      content?.loaded?.(String(result.value.version))
    })().catch((error: unknown) => {
      if (disposed || controller.signal.aborted) return
      console.error('[ofd-viewer] preview read failed', error)
      setFailure(error instanceof Error ? error.message : String(error))
      content?.failed?.()
    })
    return () => {
      disposed = true
      controller.abort()
      destroy?.()
    }
  }, [resourceAddress, content?.revision])
  return (
    <div className="ofd-pv-doc">
      <div className="ofd-pv-container" ref={containerRef} aria-label={t('panel.previewAria')} />
      {failure !== '' && (
        <div className="ofd-pv-status ofd-pv-status-error" role="alert">
          {t('renderer.failed', { message: failure })}
        </div>
      )}
    </div>
  )
}
