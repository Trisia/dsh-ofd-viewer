/**
 * 纯函数工具：文件名判断、大小格式化与资源地址解析。
 */

/** 会话级文件资源地址前缀。 */
const FILE_ADDRESS_PREFIX = 'dsh-resource://file/session/'

/**
 * 判断文件名是否为 OFD。
 *
 * @param name 文件名或路径
 * @returns 扩展名为 .ofd（忽略大小写）时返回 true
 */
export function isOfdName(name: string): boolean {
  return typeof name === 'string' && /\.ofd$/i.test(name)
}

/**
 * 取小写扩展名（不含点）。
 *
 * @param name 文件名
 * @returns 扩展名；无扩展名时返回空串
 */
export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index < 0 ? '' : name.slice(index + 1).toLowerCase()
}

/**
 * 把字节数格式化为人类可读文本。
 *
 * @param bytes 字节数（单位 byte）
 * @returns 形如 "225.5 KB"
 */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 解析会话级文件资源地址 `dsh-resource://file/session/<sessionId>/<path>`。
 *
 * @param address 资源地址
 * @returns 会话标识与工作区路径
 * @throws {Error} 地址不是会话级文件地址时抛出
 */
export function parseFileAddress(address: string): { sessionId: string; path: string } {
  if (!address.startsWith(FILE_ADDRESS_PREFIX)) throw new Error(`not a session file address: ${address}`)
  const raw = address.slice(FILE_ADDRESS_PREFIX.length)
  const separator = raw.indexOf('/')
  if (separator <= 0) throw new Error(`missing file path in address: ${address}`)
  return {
    sessionId: decodeURIComponent(raw.slice(0, separator)),
    path: decodeURIComponent(raw.slice(separator + 1)),
  }
}
