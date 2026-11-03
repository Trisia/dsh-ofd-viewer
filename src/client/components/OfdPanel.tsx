/**
 * OFD 全屏面板：打开草稿或交付的 OFD，提供铺满/内嵌两种版面。
 */
import type { ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'
import type { Translate } from '../contracts.js'
import { ViewerSurface, type ViewerInstance } from './ViewerSurface.js'
import { ViewerToolbar, type ToolbarViewer, type ViewerToolbarLabels } from './ViewerToolbar.js'

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
 * 组装工具栏文案。
 *
 * @param t 翻译函数
 * @returns 工具栏文案
 */
export function toolbarLabels(t: Translate): ViewerToolbarLabels {
  return {
    sidebar: t('toolbar.sidebar'),
    previousPage: t('toolbar.previousPage'),
    nextPage: t('toolbar.nextPage'),
    pageNumber: t('toolbar.pageNumber'),
    zoomOut: t('toolbar.zoomOut'),
    zoomIn: t('toolbar.zoomIn'),
    zoomMode: t('toolbar.zoomMode'),
    rotate: t('toolbar.rotate'),
    find: t('toolbar.find'),
    localFonts: t('toolbar.localFonts'),
    'localFonts.hint': t('toolbar.localFontsHint'),
    'localFonts.enabled': t('toolbar.localFontsEnabled'),
    'localFonts.prompt': t('toolbar.localFontsPrompt'),
    'localFonts.denied': t('toolbar.localFontsDenied'),
    'localFonts.unsupported': t('toolbar.localFontsUnsupported'),
    'localFonts.loading': t('toolbar.localFontsLoading'),
    print: t('toolbar.print'),
    download: t('toolbar.download'),
    fullscreen: t('toolbar.fullscreen'),
    exitFullscreen: t('toolbar.exitFullscreen'),
    inline: t('view.inline'),
    close: t('panel.close'),
    closeAria: t('panel.closeAria'),
  }
}

/**
 * OFD 全屏面板。
 *
 * @param props 组件属性
 * @returns 面板内容
 */
export function OfdPanel({ file, t, close }: OfdPanelProps): ReactNode {
  const { createElement, useState } = requireModule<typeof import('react')>('react')
  const [inline, setInline] = useState(false)
  const [viewer, setViewer] = useState<ToolbarViewer | null>(null)
  const failureText = (message: string): string => t('panel.openFailed', { message })
  return (
    <div className="ofd-pv-panel">
      {/* 面板只有这一条工具栏：阅读器内置工具栏已在挂载时关闭 */}
      <ViewerToolbar
        name={file.name}
        viewer={viewer}
        failureText={failureText}
        inline={inline}
        onToggleInline={() => setInline((value) => !value)}
        close={close}
        labels={toolbarLabels(t)}
      />
      <div className="ofd-pv-body">
        <ViewerSurface
          className={inline ? 'ofd-pv-container ofd-pv-inline' : 'ofd-pv-container'}
          load={() => readFileBytes(file)}
          t={t}
          failureText={failureText}
          onViewer={(instance: ViewerInstance | null) => setViewer(instance as ToolbarViewer | null)}
        />
      </div>
    </div>
  )
}
