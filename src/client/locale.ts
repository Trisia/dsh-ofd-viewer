/**
 * 文案：界面可见文字统一走客户端本地化服务。
 */
import type { LocaleDict } from './contracts.js'

/** 中文文案。 */
export const zh: LocaleDict = {
  title: 'OFD 预览',
  'action.uploading': '上传中',
  'action.failed': '上传失败',
  'action.open': '查看',
  'action.openAria': '在侧栏打开 {name}',
  'action.retry': '重试上传',
  'action.remove': '移除 {name}',
  'view.inline': '内嵌',
  'panel.empty': '没有待预览的 OFD 文件',
  'panel.hint': '在右侧栏文件树、交付卡片或输入框附件中点击 OFD 文件即可预览',
  'panel.close': '关闭',
  'panel.closeAria': '关闭 OFD 预览',
  'panel.previewAria': 'OFD 文档预览',
  'panel.openFailed': '无法打开该 OFD：{message}',
  'renderer.title': 'OFD 阅读器',
  'renderer.failed': '无法打开该 OFD：{message}',
  'drop.title': '松手即可添加文件',
  'file.open': '选择 OFD 文件',
}

/** 英文文案。 */
export const en: LocaleDict = {
  title: 'OFD Viewer',
  'action.uploading': 'Uploading',
  'action.failed': 'Upload failed',
  'action.open': 'View',
  'action.openAria': 'Open {name} in the Sidebar',
  'action.retry': 'Retry upload',
  'action.remove': 'Remove {name}',
  'view.inline': 'Inline',
  'panel.empty': 'No OFD file to preview',
  'panel.hint': 'Open an OFD from the Sidebar file tree, a delivery card or a composer attachment',
  'panel.close': 'Close',
  'panel.closeAria': 'Close the OFD preview',
  'panel.previewAria': 'OFD document preview',
  'panel.openFailed': 'This OFD cannot be opened: {message}',
  'renderer.title': 'OFD reader',
  'renderer.failed': 'This OFD cannot be opened: {message}',
  'drop.title': 'Drop to attach files',
  'file.open': 'Choose an OFD file',
}
