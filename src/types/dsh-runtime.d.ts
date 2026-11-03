/**
 * DSH 宿主包的本地类型声明。
 *
 * 这些包由 DSH 运行时（profile 作用域）提供，本仓库不把它们列为依赖：
 * 一旦列为依赖，pnpm 会把本地的 rc 版本装进 profile 的 node_modules，
 * 盖住宿主自带的同版本包，触发插件兼容性门禁。
 * 因此这里只声明本插件实际用到的面，类型检查以 DSH 0.2.1 的公开 API 为准。
 */

declare module '@deepseek-ai/cordis' {
  /** 宿主侧插件上下文（只声明本插件用到的成员）。 */
  export interface Context {
    /** 子插件上下文：绑定生命周期，随插件卸载。 */
    readonly root: Context
    /** 读取服务；不存在时返回 undefined。 */
    get(name: string): unknown
    /**
     * 注册带生命周期的子插件。
     * @param factory 子插件入口
     * @returns 无返回值
     */
    plugin(factory: (ctx: Context) => void): void
  }
}

declare module '@deepseek-ai/dsh-tools' {
  /** 工具定义（defineTool 原样返回）。 */
  export interface ToolDefinition<Args = Record<string, unknown>, Value = unknown> {
    /** 工具名 */
    name: string
    /** 工具说明 */
    description: string
    /** 参数 schema */
    parameters: Record<string, unknown>
    /** 输出 schema 与渲染方式 */
    output?: { schema?: Record<string, unknown>; render?: (args: Args, value: Value) => unknown }
    /**
     * 执行工具。
     * @param args 调用参数
     * @param exec 执行上下文（含会话与取消信号）
     * @returns 规范返回值
     */
    execute(args: Args, exec: { agent?: unknown; signal?: AbortSignal }): Promise<Value>
  }

  /**
   * 声明一个工具，返回同一份定义。
   * @param definition 工具定义
   * @returns 同一份定义
   */
  export function defineTool<Args, Value>(definition: ToolDefinition<Args, Value>): ToolDefinition<Args, Value>
}

declare module '@deepseek-ai/dsh-fs' {
  /** 文件系统访问失败。 */
  export class FsError extends Error {
    /** 稳定错误码 */
    readonly code: string
    /**
     * @param message 错误说明
     * @param code 稳定错误码
     */
    constructor(message: string, code: string)
  }
}
