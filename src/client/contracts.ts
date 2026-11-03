/**
 * dsh-ofd-viewer 客户端契约：只描述本插件用到的 Harness 客户端接口。
 * 客户端模块不允许引用宿主包，因此这里自持最小类型。
 */
import type { ComponentType, ReactNode } from 'react'

/** 当前活动会话标识。 */
export type SessionId = string

/** 本地化词典：键 → 文案模板。 */
export type LocaleDict = Record<string, string>

/** 带占位参数的翻译函数。 */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/** 插槽注册选项（只列本插件使用的字段）。 */
export interface SlotRegisterOptions {
  /** 插槽名 */
  name: string
  /** 键控插槽的 key / 单值插槽的 id */
  key?: string
  /** 列表插槽的 id */
  id?: string
  /** 列表排序 */
  order?: number
  /** 同名占用者优先级，数值大者替换 */
  priority?: number
  /** 文案命名空间 */
  locale?: string
  /** 列表项显示文案 */
  label?: () => string
  /** 单值插槽的 scope（session 表示按会话隔离） */
  scope?: 'root' | 'session' | 'session-maybe'
}

/** 插槽组件可用的 prop（只列本插件使用的部分）。 */
export interface SlotProps {
  /**
   * 会话快照选择器。
   * @param selector 从快照取值
   * @returns 选中值
   */
  useSession?: (selector: (snapshot: { sessionId?: string } | undefined) => unknown) => unknown
  /** 当前会话标识 */
  sessionId?: string
  /**
   * 面板信息选择器（用于判断主面板是否已注册）。
   * @param selector 从面板状态取值
   * @returns 选中值
   */
  usePanelInfo?: (selector: (snapshot: unknown) => unknown) => unknown
  /** 文档内容与加载请求 */
  content?: RendererContent
  /** 文件资源地址 */
  resourceAddress?: string
  /**
   * 报告渲染体自己的滚动容器。
   * @param node 容器
   * @returns 无返回值
   */
  scrollportRef?: (node: HTMLElement | null) => void
  /** 草稿附件 */
  attachments?: readonly ComposerAttachment[]
  /** 是否允许拖入文件 */
  canAcceptDrop?: boolean
  /**
   * 添加文件（走宿主校验路径）。
   * @param files 文件列表
   * @returns 无返回值
   */
  onAddFiles?: (files: readonly File[]) => void
  /**
   * 移除草稿附件。
   * @param id 附件标识
   * @returns 无返回值
   */
  onRemoveAttachment?: (id: string) => void
  /** 各附件的上传状态 */
  uploads?: Readonly<Record<string, DraftFileUpload>>
  /**
   * 重试上传。
   * @param id 附件标识
   * @returns 无返回值
   */
  onRetryFile?: (id: string) => void
}

/** 浏览器草稿附件。 */
export interface ComposerAttachment {
  /** 种类 */
  readonly kind: 'file' | 'image'
  /** 草稿内标识 */
  readonly id: string
  /** 浏览器文件 */
  readonly file: File
}

/** 单个附件的上传状态。 */
export type DraftFileUpload =
  | { readonly status: 'uploading'; readonly loaded: number; readonly total?: number }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string }

/** 客户端本地化服务。 */
export interface LocaleService {
  /**
   * 注册词典。
   * @param ns 命名空间
   * @param dicts 内置语言词典
   * @returns 注销函数
   */
  register(ns: string, dicts: Record<string, LocaleDict>): () => void
  /**
   * 绑定命名空间。
   * @param ns 命名空间
   * @returns 翻译函数
   */
  bind(ns: string): Translate
}

/** 客户端插槽服务。 */
export interface SlotsService {
  /**
   * 注册渲染器。
   * @param options 注册选项
   * @param component 组件
   * @returns 注销函数
   */
  register(options: SlotRegisterOptions, component: ComponentType<SlotProps>): () => void
  /**
   * 等插槽被声明后再注册。
   * @param key 插槽名
   * @param callback 执行注册
   * @returns 注销函数
   */
  inject(key: string, callback: () => () => void): () => void
}

/** 布局服务。 */
export interface LayoutService {
  /**
   * 切换主面板。
   * @param key 面板 key；null 回到对话
   * @returns 无返回值
   */
  selectPanel(key: string | null): void
}

/** 文档预览声明。 */
export interface DocumentPreviewDefinition {
  /** 实现 id，同时是渲染体插槽 key */
  readonly id: string
  /** 接管的文件后缀（小写、不含点） */
  readonly extensions: readonly string[]
  /** 其中不能按文本读取的后缀 */
  readonly binaryExtensions?: readonly string[]
  /** 优先级：extension 高于 builtin */
  readonly priority?: 'builtin' | 'extension'
  /** 下拉显示名 */
  readonly title: () => string
  /** 内容交付方式 */
  readonly loading: 'text-pages' | 'bytes-complete' | 'renderer'
  /** 是否消费换行偏好 */
  readonly wrap?: boolean
}

/** 文档预览注册表。 */
export interface DocumentPreviewsService {
  /**
   * 注册渲染实现。
   * @param definition 声明
   * @returns 注销函数
   */
  register(definition: DocumentPreviewDefinition): () => void
}

/** `renderer` 模式交给渲染体的加载请求。 */
export interface RendererContent {
  /** 加载模式 */
  readonly kind?: string
  /** 版本号，reload 后变化 */
  readonly revision?: number
  /**
   * 报告已显示的源版本。
   * @param version 文件版本
   */
  loaded?: (version: string) => void
  /** 报告失败，允许后续重试 */
  failed?: () => void
  /** 请求重载 */
  reload?: () => void
}

/** Remote 失败结构。 */
export interface RemoteFailure {
  readonly code?: string
  readonly message?: string
}

/** Remote 调用结果。 */
export type RemoteResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RemoteFailure }

/** 客户端 Remote 的 `workspaceFiles` 命名空间中本插件用到的部分。 */
export interface WorkspaceFilesRemote {
  /**
   * 读取完整文件字节。
   * @param sessionId 会话标识
   * @param path 工作区路径
   * @param options 读取选项
   * @param signal 取消信号
   * @returns 字节或失败
   */
  readBytes(
    sessionId: SessionId,
    path: string,
    options: Record<string, never>,
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ readonly data: Uint8Array; readonly version: string }>>
}

/** 客户端根上下文（只列本插件使用的成员）。 */
export interface ClientContext {
  /**
   * 读取可选服务。
   *
   * 含点号的服务名（如 `remote.workspaceFiles`）由宿主按命名空间独立注册，
   * 也只能这样按名字取；`ctx.remote.workspaceFiles` 会被当作未注入的服务而报错。
   *
   * @param name 服务名
   * @returns 服务实例或 undefined
   */
  get(name: string): unknown
  /** 本地化服务 */
  readonly locale: LocaleService
  /** 插槽服务 */
  readonly slots: SlotsService
  /** 布局服务（必需依赖） */
  readonly layout: LayoutService
  /**
   * 注册随插件卸载释放的资源。
   * @param callback 返回清理函数
   * @param label 诊断标签
   * @returns 无返回值
   */
  effect(callback: () => (() => void) | undefined, label?: string): void
}

/** 插件模块面（浏览器模块表登记的工厂返回值）。 */
export interface ClientModule {
  /** 插件标识 */
  readonly name: string
  /** 必需服务 */
  readonly inject: readonly string[]
  /** 入口 */
  apply(ctx: ClientContext): void
  /** 纯函数，供单元测试使用 */
  readonly internal: {
    isOfdName(name: string): boolean
    extensionOf(name: string): string
    formatSize(bytes: number): string
    parseFileAddress(address: string): { sessionId: string; path: string }
  }
}

/** 宿主模块加载器登记的行结构。 */
export interface ModuleRow {
  id: string
  factory(require: (specifier: string) => unknown): unknown
}

declare global {
  interface Window {
    /** Harness 浏览器插件模块加载器 */
    __ModuleLoader__: { load(row: ModuleRow): void }
  }
}

export type { ComponentType, ReactNode }
