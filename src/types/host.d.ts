/**
 * 宿主运行时包的最小声明：插件安装后无法解析宿主包，
 * 这里只声明本插件调用到的服务成员，避免类型检查依赖 dsh 安装位置。
 */
declare module '@deepseek-ai/cordis' {
  /** 文件系统目标（不透明句柄） */
  export interface FsTarget {
    readonly id: string
  }

  /** 文件系统元数据 */
  export interface FsInfo {
    /** 目标类型 */
    readonly type: 'file' | 'directory' | 'other'
    /** 字节数（单位 byte） */
    readonly size?: number
  }

  /** 会话标识 */
  export type SessionId = string

  /** agent 的最小形态：只需要会话身份 */
  export interface Agent {
    readonly id: SessionId
  }

  /** 工具执行上下文的最小形态 */
  export interface ToolRunContext {
    /** 调用方 agent */
    readonly agent?: Agent
    /** 取消信号 */
    readonly signal: AbortSignal
  }

  /** 连接服务：用于拒绝非授权来源的请求 */
  export interface ConnectionService {
    /**
     * 判断是否拒绝该请求。
     * @param request 入站请求
     * @returns 拒绝状态码，放行返回 undefined
     */
    requestRejection(request: unknown): number | undefined
  }

  /** HTTP 路由注册表 */
  export interface WebServerService {
    /**
     * 注册一条路由。
     * @param route 路由定义
     * @returns 注销函数
     */
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (req: any, res: any) => void | Promise<void>
    }): () => void
  }

  /** 文件系统服务 */
  export interface FsService {
    /**
     * 解析文件系统目标。
     * @param path 路径
     * @param options 解析选项
     * @returns 目标句柄
     */
    resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
    /**
     * 读取目标元数据。
     * @param target 目标
     * @param signal 取消信号
     * @returns 元数据或 undefined
     */
    stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
    /**
     * 把目标转换为可展示的宿主路径。
     * @param target 目标
     * @returns 路径文本
     */
    processPath(target: FsTarget): string
    /**
     * 读取完整字节。
     * @param target 目标
     * @param signal 取消信号
     * @param maxBytes 上限（单位 byte）
     * @returns 字节
     */
    readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  }

  /** 工作目录服务 */
  export interface WorkingDirectoryService {
    /**
     * 确保并返回当前会话的工作目录。
     * @param agent 会话 agent
     * @param signal 取消信号
     * @returns 绝对路径
     */
    ensure(agent: Agent, signal?: AbortSignal): Promise<string>
  }

  /** 工具注册表 */
  export interface ToolsService {
    /**
     * 注册工具。
     * @param definition 工具定义
     * @returns 注销函数
     */
    register(definition: unknown): () => void
  }

  /** Cordis 上下文（只列本插件使用的成员） */
  export interface Context {
    /**
     * 读取服务。
     * @param name 服务名
     * @returns 服务实例
     */
    get(name: string): any
    /** 注册随插件卸载一起释放的效果 */
    effect(callback: () => (() => void) | undefined, label?: string): any
    /** 插件根上下文 */
    readonly root: Context
    /** HTTP 路由服务 */
    readonly webServer: WebServerService
    /** 工具注册表 */
    readonly tools: ToolsService
    /** 文件系统服务 */
    readonly fs: FsService
    /** 工作目录服务 */
    readonly workingDirectory: WorkingDirectoryService
  }
}

declare module '@deepseek-ai/dsh-fs' {
  /** 文件系统错误码 */
  export type FsErrorCode = 'FS_NOT_FOUND' | 'FS_IO_ERROR'

  /** 文件系统错误 */
  export class FsError extends Error {
    /**
     * @param message 人可读信息
     * @param code 错误码
     */
    constructor(message: string, code: FsErrorCode)
  }
}

declare module '@deepseek-ai/dsh-tools' {
  /** 参数标量类型 */
  export type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'json'

  /** 工具参数 / 输出 schema 节点 */
  export interface SchemaSpec {
    /** 节点类型 */
    type?: JsonSchemaType | undefined
    /** 是否必填（仅参数属性可用） */
    required?: true | undefined
    /** 说明文本 */
    description?: string | undefined
    /** 对象属性 */
    properties?: Record<string, SchemaSpec> | undefined
    /** 对象是否允许额外键 */
    additionalProperties?: boolean | undefined
    /** 数组元素 */
    items?: SchemaSpec | undefined
  }

  /** 工具定义 */
  export interface ToolDefinitionOptions {
    /** 工具名 */
    name: string
    /** 工具说明 */
    description: string
    /** 参数 schema */
    parameters: Record<string, SchemaSpec>
    /** 输出声明 */
    output: {
      /** 输出 schema */
      schema: SchemaSpec
      /**
       * 把规范值渲染成内容块。
       * @param args 调用参数
       * @param value 规范值
       * @returns 内容块
       */
      render(args: any, value: any): Array<{ type: 'text'; text: string }>
    }
    /**
     * 执行体。
     * @param args 已校验参数
     * @param exec 执行上下文
     * @returns 规范值
     */
    execute(args: any, exec: any): Promise<unknown>
  }

  /**
   * 声明一个类型化工具。
   * @param options 工具定义
   * @returns 可供 ctx.tools.register 的定义
   */
  export function defineTool(options: ToolDefinitionOptions): unknown
}
