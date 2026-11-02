/**
 * dsh-ofd-viewer 宿主半：提供内置字体静态路由与 ofd_read 摘要工具。
 * 阅读器渲染由客户端半（src/client）负责。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { summarizeOfd, type OfdPageText } from './ofd-read.js'

/** 字体路由前缀；客户端半按 `${FONT_PATH_PREFIX}/<文件名>` 取内置字体。 */
export const FONT_PATH_PREFIX = '/ofd-viewer-plugin/fonts'

/** 内置字体：路由文件名 → 构建产物中的相对路径（lib/host → lib/client/assets/fonts）。 */
const FONT_FILES: Readonly<Record<string, string>> = {
  'source-han-serif-sc.woff2': '../client/assets/fonts/source-han-serif-sc.woff2',
  'source-han-sans-sc.woff2': '../client/assets/fonts/source-han-sans-sc.woff2',
}

/** ofd_read 默认返回的正文页数（单位 页）。 */
const DEFAULT_MAX_PAGES = 30

/** ofd_read 单页文本上限（单位 字符）。 */
const MAX_CHARS_PER_PAGE = 4000

/** 宿主插件依赖的服务；缺任意一个时插件保持不激活。 */
export const inject = ['webServer', 'tools', 'fs', 'workingDirectory']


/** 连接服务的可选面：用于拒绝未经授权来源的请求。 */
interface ConnectionFace {
  /** @param req 入站请求 @returns 拒绝时返回状态码，放行返回 undefined */
  requestRejection?(req: IncomingMessage): number | undefined
}

/** ofd_read 的调用参数（由 defineTool 依据 schema 校验后传入）。 */
interface ReadToolArgs {
  /** OFD 文件路径，相对路径以会话工作目录为基准 */
  path: string
  /** 1 起始的页码选择，如 "3"、"1-5"、"1,3,7-9" */
  pages?: string
  /** 最多返回页数（单位 页） */
  maxPages?: number
  /** 是否返回正文；false 时只返回元数据 */
  includeText?: boolean
}

/** ofd_read 的规范返回值。 */
interface ReadToolValue {
  /** 解析后的主机文件系统路径 */
  path: string
  /** 文件字节数（单位 byte） */
  bytes: number
  /** OFD 版本号 */
  version?: string
  /** 文档信息 */
  docInfo: Record<string, string>
  /** 文档页数（单位 页） */
  pageCount: number
  /** 本次返回的页码列表（单位 页） */
  returnedPages: number[]
  /** 返回的页文本 */
  pages: OfdPageText[]
  /** 解压失败的条目 */
  skippedEntries?: string[]
}

/**
 * 解析包内资源路径。
 *
 * @param relative 相对本文件所在目录的路径
 * @returns 绝对文件系统路径
 */
function assetPath(relative: string): string {
  // 构建产物位于 lib/host/index.js；源码运行时也按 lib/host 的层级解析
  return fileURLToPath(new URL(relative, import.meta.url))
}

/**
 * 注册内置字体静态路由；非本机来源按连接服务给出的拒绝状态应答。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
function registerFontRoutes(ctx: Context): void {
  // 改用根上下文注册：插件自身上下文会在 apply 结束且无持有的 fiber 时被卸载，路由随之注销
  const connection = ctx.get('connection') as ConnectionFace | undefined
  const target = ctx.root
  target.effect(
    () =>
      target.webServer.register({
        kind: 'prefix',
        path: FONT_PATH_PREFIX,
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          const rejection = connection?.requestRejection?.(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405
            res.setHeader('allow', 'GET, HEAD')
            res.end()
            return
          }
          const name = new URL(req.url ?? '/', 'http://localhost').pathname.slice(FONT_PATH_PREFIX.length + 1)
          const relative = Object.hasOwn(FONT_FILES, name) ? FONT_FILES[name] : undefined
          if (relative === undefined) {
            res.statusCode = 404
            res.end()
            return
          }
          let bytes: Buffer
          try {
            bytes = await readFile(assetPath(relative))
          } catch {
            res.statusCode = 404
            res.end()
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'font/woff2')
          res.setHeader('content-length', String(bytes.byteLength))
          res.setHeader('cache-control', 'private, max-age=86400')
          res.end(req.method === 'HEAD' ? undefined : bytes)
        },
      }),
    `ofd-viewer: GET ${FONT_PATH_PREFIX}/<font>`,
  )
}

/**
 * 把页码选择串解析为升序页码列表。
 *
 * @param spec 形如 "1-5"、"3"、"1,3,7-9"；缺省时取前若干页
 * @param pageCount 文档总页数（单位 页）
 * @param maxPages 最多返回页数（单位 页）
 * @returns 升序且去重的页码数组（单位 页）
 * @throws {Error} 选择串非法时抛出
 */
function selectPages(spec: string | undefined, pageCount: number, maxPages: number): number[] {
  if (pageCount === 0) return []
  const limit = Math.max(1, Math.floor(maxPages))
  if (spec === undefined || spec.trim() === '') {
    return Array.from({ length: Math.min(pageCount, limit) }, (_all, index) => index + 1)
  }
  const wanted = new Set<number>()
  for (const part of spec.split(',')) {
    const text = part.trim()
    if (text === '') continue
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(text)
    if (range !== null) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start < 1 || end < start) throw new Error(`Invalid page range "${text}"`)
      for (let page = start; page <= Math.min(end, pageCount); page += 1) wanted.add(page)
      continue
    }
    if (!/^\d+$/.test(text)) throw new Error(`Invalid page selection "${text}"`)
    const page = Number(text)
    if (page < 1) throw new Error(`Invalid page number "${text}"`)
    if (page <= pageCount) wanted.add(page)
  }
  return [...wanted].sort((a, b) => a - b).slice(0, limit)
}

/**
 * 读取选定页文本，并按单页上限截断。
 *
 * @param bytes 完整 OFD 字节
 * @param selected 需要的页码数组（单位 页）
 * @returns 页文本列表
 */
function readSelectedPages(bytes: Uint8Array, selected: number[]): OfdPageText[] {
  if (selected.length === 0) return []
  // 只解压到需要的最后一页，避免整本解压
  const full = summarizeOfd(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    includeText: true,
    maxPages: selected[selected.length - 1],
  })
  return selected.map((page) => {
    const text = full.pages.find((item) => item.page === page)?.text ?? ''
    if (text.length <= MAX_CHARS_PER_PAGE) return { page, text }
    return { page, text: text.slice(0, MAX_CHARS_PER_PAGE), truncatedChars: text.length - MAX_CHARS_PER_PAGE }
  })
}

/**
 * 注册 ofd_read 工具：读取会话文件系统中的 OFD，返回元数据与每页文本。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
function registerReadTool(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: 'ofd_read',
      description:
        'Read an OFD (GB/T 33190) document and return its metadata plus extracted page text. Use it to answer questions about an OFD invoice, e-invoice, contract or archive without rendering it; the OFD Viewer plugin renders it in the Web UI.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Path of an OFD file. Relative paths use the Session working directory.',
        },
        pages: {
          type: 'string',
          description: '1-based page selection such as "2", "1-5" or "1,3,7-9". Omit for the first pages.',
        },
        maxPages: {
          type: 'integer',
          description: `Maximum pages of text to return, in pages (default ${DEFAULT_MAX_PAGES}).`,
        },
        includeText: {
          type: 'boolean',
          description: 'Set false to return metadata only, without page text (default true).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            version: { type: 'string' },
            docInfo: { type: 'object', additionalProperties: true, required: true },
            pageCount: { type: 'integer', required: true },
            returnedPages: { type: 'array', required: true, items: { type: 'integer' } },
            pages: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  page: { type: 'integer', required: true },
                  text: { type: 'string', required: true },
                  truncatedChars: { type: 'integer' },
                },
              },
            },
            skippedEntries: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args: ReadToolArgs, value: ReadToolValue) => [
          {
            type: 'text',
            text: [
              `${value.path} · ${value.pageCount} 页 · ${value.bytes} 字节`,
              ...value.pages.map((page) =>
                `【第 ${page.page} 页】\n${page.text}${
                  page.truncatedChars === undefined ? '' : `\n…（本页截断 ${page.truncatedChars} 字符）`
                }`,
              ),
            ].join('\n\n'),
          },
        ],
      },
      async execute(args: ReadToolArgs, exec): Promise<ReadToolValue> {
        if (exec.agent === undefined) throw new Error('ofd_read requires an agent Session')
        const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
        const target = await ctx.fs.resolve(args.path, { cwd, signal: exec.signal })
        const info = await ctx.fs.stat(target, exec.signal)
        if (info === undefined || info.type !== 'file') {
          throw new FsError(`Cannot read ${args.path}: not a regular file.`, 'FS_NOT_FOUND')
        }
        const hostPath = ctx.fs.processPath(target)
        const bytes = await ctx.fs.readBytes(target, exec.signal, Number.MAX_SAFE_INTEGER)
        const summary = summarizeOfd(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { includeText: false })
        const selected =
          args.includeText === false ? [] : selectPages(args.pages, summary.pageCount, args.maxPages ?? DEFAULT_MAX_PAGES)
        const pages = readSelectedPages(bytes, selected)
        return {
          path: hostPath,
          bytes: bytes.byteLength,
          ...(summary.version === undefined ? {} : { version: summary.version }),
          docInfo: summary.docInfo,
          pageCount: summary.pageCount,
          returnedPages: pages.map((page) => page.page),
          pages,
          ...(summary.skipped.length === 0 ? {} : { skippedEntries: summary.skipped }),
        }
      },
    }),
  )
}

/**
 * 插件入口。
 *
 * @param ctx 宿主上下文
 * @returns 无返回值
 */
export function apply(ctx: Context): void {
  registerFontRoutes(ctx)
  registerReadTool(ctx)
}
