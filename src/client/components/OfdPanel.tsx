/**
 * OFD 全屏面板：打开草稿或交付的 OFD，提供铺满/内嵌两种版面。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { Translate } from '../contracts.js'
import { formatSize } from '../utils.js'
import { ViewerSurface } from './ViewerSurface.js'

/** 面板属性。 */
export interface OfdPanelProps {
  /** 待预览文件 */
  file: File
  /** 翻译函数 */
  t: Translate
  /** 关闭面板 */
  close: () => void
}

/**
 * 把文件读成字节。
 *
 * @param file 浏览器文件
 * @returns OFD 字节
 */
async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * OFD 全屏面板。
 *
 * @param props 组件属性
 * @returns 面板内容
 */
export function OfdPanel({ file, t, close }: OfdPanelProps): ReactNode {
  const { useState } = requireModule<typeof import('react')>('react')
  const [inline, setInline] = useState(false)
  const failureText = (message: string): string => t('panel.openFailed', { message })
  const surface = { t, failureText, load: () => readFileBytes(file) }
  return (
    <div className="ofd-pv-panel">
      <div className="ofd-pv-head">
        <div className="ofd-pv-head-main">
          <span className="ofd-pv-badge">OFD</span>
          <span className="ofd-pv-name" title={file.name}>
            {file.name}
          </span>
          <span className="ofd-pv-meta">{formatSize(file.size)}</span>
          <button type="button" className="ofd-pv-chip" aria-pressed={inline} onClick={() => setInline((value) => !value)}>
            {t('view.inline')}
          </button>
        </div>
        <button type="button" className="ofd-pv-close" onClick={close} aria-label={t('panel.closeAria')} title={t('panel.close')}>
          ✕
        </button>
      </div>
      <div className="ofd-pv-body">
        {inline ? (
          <div className="ofd-pv-body-inline">
            <ViewerSurface {...surface} className="ofd-pv-container ofd-pv-inline" />
          </div>
        ) : (
          <ViewerSurface {...surface} />
        )}
      </div>
    </div>
  )
}
