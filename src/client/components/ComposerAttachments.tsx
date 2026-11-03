/**
 * 输入框附件栏：还原宿主的图片缩略图、文件卡片与拖放遮罩，并为 OFD 卡片提供预览入口。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type {
  ComposerAttachment,
  ComposerFileAttachment,
  ComposerImageAttachment,
  DraftFileUpload,
  DropLimits,
  Translate,
} from '../contracts.js'
import { extensionOf, formatSize, isOfdName } from '../utils.js'

/** 附件栏属性。 */
export interface ComposerAttachmentsProps {
  /** 当前草稿附件 */
  attachments: readonly ComposerAttachment[]
  /** 是否允许拖入文件 */
  canAcceptDrop: boolean
  /**
   * 添加文件（走宿主校验路径）。
   * @param files 文件列表
   * @returns 无返回值
   */
  onAddFiles?: (files: readonly File[]) => void
  /**
   * 移除附件。
   * @param id 附件标识
   * @returns 无返回值
   */
  onRemoveAttachment?: (id: string) => void
  /** 各附件上传状态 */
  uploads: Readonly<Record<string, DraftFileUpload>>
  /**
   * 重试上传。
   * @param id 附件标识
   * @returns 无返回值
   */
  onRetryFile?: (id: string) => void
  /** 图片拖入限制 */
  dropLimits?: DropLimits
  /** 翻译函数 */
  t: Translate
  /**
   * 用 OFD 面板打开草稿文件。
   * @param file 浏览器文件
   * @returns 无返回值
   */
  openOfd: (file: File) => void
}

/**
 * 把上传状态归一成展示态。
 *
 * @param upload 上传状态
 * @returns uploading / ready / error
 */
function stateOf(upload: DraftFileUpload | undefined): 'uploading' | 'ready' | 'error' {
  if (upload === undefined || upload.status === 'uploading') return 'uploading'
  return upload.status
}

/**
 * 输入框附件栏。
 *
 * @param props 组件属性
 * @returns 图片缩略图、文件卡片轨道、拖放遮罩与原图灯箱
 */
export function ComposerAttachments({
  attachments,
  canAcceptDrop,
  onAddFiles,
  onRemoveAttachment,
  uploads,
  onRetryFile,
  dropLimits,
  t,
  openOfd,
}: ComposerAttachmentsProps): ReactNode {
  const { Fragment, useCallback, useEffect, useRef, useState } = requireModule<typeof import('react')>('react')
  const { createPortal } = requireModule<typeof import('react-dom')>('react-dom')
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)
  /** 正在查看原图的图片附件；null 表示未打开灯箱 */
  const [preview, setPreview] = useState<ComposerImageAttachment | null>(null)

  // 附件被移除后同步关闭灯箱
  useEffect(() => {
    if (preview !== null && !attachments.some((attachment) => attachment.id === preview.id)) setPreview(null)
  }, [attachments, preview])

  useEffect(() => {
    if (!canAcceptDrop || onAddFiles === undefined) return undefined
    const addFiles = onAddFiles
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') === true
    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      dragDepth.current += 1
      setDragActive(true)
    }
    const onDragLeave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragActive(false)
    }
    const onDragOver = (event: DragEvent): void => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent): void => {
      dragDepth.current = 0
      setDragActive(false)
      const files = event.dataTransfer?.files
      if (files === undefined || files.length === 0) return
      event.preventDefault()
      addFiles([...files])
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      dragDepth.current = 0
      setDragActive(false)
    }
  }, [canAcceptDrop, onAddFiles])

  const closePreview = useCallback(() => setPreview(null), [])

  // 灯箱打开时响应 Esc 关闭
  useEffect(() => {
    if (preview === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [preview])

  if (attachments.length === 0 && !dragActive) return null

  const dropText = (): string => {
    if (!canAcceptDrop) return t('drop.disabled')
    if (dropLimits === undefined) return t('drop.title')
    return t('drop.limits', { count: dropLimits.count, size: dropLimits.size })
  }

  /**
   * 渲染单个图片缩略图；点击打开原图灯箱。
   *
   * @param attachment 图片附件
   * @returns 缩略图与悬停移除按钮
   */
  function renderImageTile(attachment: ComposerImageAttachment): ReactNode {
    return (
      <div className="ofd-pv-image" key={attachment.id}>
        <button
          type="button"
          className="ofd-pv-thumb"
          title={t('image.openOriginal')}
          onClick={() => setPreview(attachment)}
        >
          <img src={attachment.previewUrl} alt={attachment.file.name || t('image.pending')} />
        </button>
        <button
          type="button"
          className="ofd-pv-image-remove"
          aria-label={t('image.remove', { name: attachment.file.name })}
          onClick={() => onRemoveAttachment?.(attachment.id)}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <Fragment>
      {dragActive && (
        <div className="ofd-pv-drop" data-disabled={!canAcceptDrop}>
          {dropText()}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="ofd-pv-rail">
          {attachments.map((attachment) =>
            attachment.kind === 'image' ? renderImageTile(attachment) : renderFileCard(attachment),
          )}
        </div>
      )}
      {preview !== null &&
        createPortal(
          <div
            className="ofd-pv-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t('image.original')}
            onClick={closePreview}
          >
            <img
              className="ofd-pv-lightbox-img"
              src={preview.previewUrl}
              alt={preview.file.name || t('image.original')}
            />
            <button type="button" className="ofd-pv-lightbox-close" aria-label={t('image.close')} onClick={closePreview}>
              ✕
            </button>
          </div>,
          document.body,
        )}
    </Fragment>
  )

  /**
   * 渲染单个文件卡片；OFD 卡片额外提供「查看」入口。
   *
   * @param attachment 文件附件
   * @returns 文件卡片
   */
  function renderFileCard(attachment: ComposerFileAttachment): ReactNode {
    const state = stateOf(uploads[attachment.id])
    const ofd = isOfdName(attachment.file.name)
    const extension = extensionOf(attachment.file.name).toUpperCase().slice(0, 8)
    // 图片之外的附件一律按文件卡片呈现，宿主不会给出图片的对象 URL
    const meta =
      state === 'uploading'
        ? t('action.uploading')
        : state === 'error'
          ? t('action.failed')
          : [ofd ? 'OFD' : extension, formatSize(attachment.file.size)].filter(Boolean).join(' ')
    return (
      <div className="ofd-pv-card" key={attachment.id} title={attachment.file.name} data-state={state}>
        <span className="ofd-pv-card-icon" data-kind={ofd ? 'ofd' : 'other'} aria-hidden="true">
          {ofd ? 'OFD' : extension.slice(0, 3) || 'FIL'}
        </span>
        <span className="ofd-pv-card-body">
          <span className="ofd-pv-card-name">{attachment.file.name || t('file.label')}</span>
          <span className="ofd-pv-card-meta" data-failed={state === 'error'}>
            {meta}
          </span>
        </span>
        {ofd && (
          <button
            type="button"
            className="ofd-pv-card-open"
            disabled={state !== 'ready'}
            title={t('action.openAria', { name: attachment.file.name })}
            aria-label={t('action.openAria', { name: attachment.file.name })}
            onClick={() => openOfd(attachment.file)}
          >
            {t('action.open')}
          </button>
        )}
        {state === 'error' && (
          <button
            type="button"
            className="ofd-pv-card-open"
            title={t('action.retry')}
            aria-label={t('action.retry')}
            onClick={() => onRetryFile?.(attachment.id)}
          >
            ↻
          </button>
        )}
        <button
          type="button"
          className="ofd-pv-card-remove"
          aria-label={t('action.remove', { name: attachment.file.name })}
          onClick={() => onRemoveAttachment?.(attachment.id)}
        >
          ✕
        </button>
      </div>
    )
  }
}
