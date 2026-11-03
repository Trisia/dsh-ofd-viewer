/**
 * 全局 OFD 面板：按当前会话读取「待预览 OFD」并展示，附文件选择入口与侧栏入口。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { Translate } from '../contracts.js'
import { createErrorBoundary } from './ErrorBoundary.js'
import { OfdPanel } from './OfdPanel.js'

/** 待预览文件登记表。 */
export interface PanelStore {
  /**
   * 登记某会话的待预览文件。
   * @param sessionId 会话标识
   * @param file 待预览文件
   * @returns 无返回值
   */
  show(sessionId: string, file: File): void
  /**
   * 读取某会话的待预览文件。
   * @param sessionId 会话标识
   * @returns 登记项或 undefined
   */
  read(sessionId: string): { file: File } | undefined
  /**
   * 读取最近一次登记的文件（面板未绑定会话时使用）。
   * @returns 最近登记项或 undefined
   */
  readLatest(): { file: File } | undefined
  /**
   * 订阅登记变化。
   * @param listener 变化回调
   * @returns 取消订阅
   */
  subscribe(listener: () => void): () => void
}

/**
 * 创建面板登记表。
 *
 * @returns 登记表
 */
export function createPanelStore(): PanelStore {
  const bySession = new Map<string, { file: File }>()
  const listeners = new Set<() => void>()
  let latest: { file: File } | undefined
  return {
    show(sessionId, file) {
      latest = { file }
      bySession.set(sessionId, { file })
      for (const listener of [...listeners]) listener()
    },
    read(sessionId) {
      return bySession.get(sessionId)
    },
    readLatest() {
      return latest
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** 面板属性。 */
export interface MainPanelProps {
  /** 翻译函数 */
  t: Translate
  /** 待预览登记表 */
  store: PanelStore
  /**
   * 会话快照选择器。
   * @param selector 从快照取值
   * @returns 选中值
   */
  useSession: (selector: (snapshot: { sessionId?: string } | undefined) => unknown) => unknown
  /** 关闭面板 */
  close: () => void
}

/**
 * 全局 OFD 面板。
 *
 * @param props 组件属性
 * @returns 面板内容
 */
export function MainPanel({ t, store, useSession, close }: MainPanelProps): ReactNode {
  const { createElement, useEffect, useRef, useState } = requireModule<typeof import('react')>('react')
  const sessionId = useSession((snapshot) => snapshot?.sessionId) as string | undefined
  const [file, setFile] = useState<File | undefined>(undefined)
  const pickerRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    // 面板无会话绑定时仍要展示「本面板最近一次选择/打开的 OFD」
    const read = (): File | undefined => (typeof sessionId === 'string' ? store.read(sessionId)?.file : store.readLatest()?.file)
    setFile(read())
    return store.subscribe(() => setFile(read()))
  }, [sessionId])
  const failureText = (message: string): string => t('panel.openFailed', { message })
  const browse = (picked: File | undefined): void => {
    if (picked === undefined) return
    if (sessionId !== undefined) store.show(sessionId, picked)
    setFile(picked)
  }
  return (
    <div className="ofd-pv-panel">
      {file === undefined ? (
        <>
          <div className="ofd-pv-head">
            <div className="ofd-pv-head-main">
              <span className="ofd-pv-badge">OFD</span>
              <span className="ofd-pv-name">{t('title')}</span>
            </div>
            <button type="button" className="ofd-pv-close" onClick={() => pickerRef.current?.click()} aria-label={t('file.open')} title={t('file.open')}>
              ＋
            </button>
            <button type="button" className="ofd-pv-close" onClick={close} aria-label={t('panel.closeAria')} title={t('panel.close')}>
              ✕
            </button>
          </div>
          <div className="ofd-pv-empty">
            <div className="ofd-pv-empty-title">{t('panel.empty')}</div>
            <div>{t('panel.hint')}</div>
            <button type="button" className="ofd-pv-chip" onClick={() => pickerRef.current?.click()}>
              {t('file.open')}
            </button>
          </div>
        </>
      ) : (
        // 有文件时不再额外渲染面板头：OfdPanel 的工具栏是唯一一条栏
        createElement(createErrorBoundary(), { failureText }, createElement(OfdPanel, { key: `${file.name}-${file.size}-${file.lastModified}`, file, t, close }))
      )}
      <input
        ref={pickerRef}
        type="file"
        accept=".ofd,application/ofd"
        hidden
        onChange={(event) => {
          browse(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}
