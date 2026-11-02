/**
 * 渲染错误边界：把子树异常显示为一行提示，而不是让槽位空白。
 */
import type { ComponentClass, ReactNode } from 'react'
import { requireModule } from '../../commonjs.js'

/** 错误边界属性。 */
export interface ErrorBoundaryProps {
  /**
   * 失败文案。
   * @param message 错误信息
   * @returns 展示文案
   */
  failureText: (message: string) => string
  /** 子节点 */
  children?: ReactNode
}

/** 错误边界状态。 */
interface ErrorBoundaryState {
  /** 捕获到的异常 */
  error?: unknown
}

/**
 * 创建错误边界组件：必须在 React 可用时（运行时）调用。
 *
 * @returns 错误边界组件类
 */
export function createErrorBoundary(): ComponentClass<ErrorBoundaryProps> {
  const React = requireModule<typeof import('react')>('react')
  return class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    /** 捕获子树异常 */
    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
      return { error }
    }

    /** 捕获到的异常 */
    override state: ErrorBoundaryState = {}

    /**
     * 渲染失败提示或原始子节点。
     * @returns 失败提示或原始子节点
     */
    override render(): ReactNode {
      const { error } = this.state
      if (error !== undefined) {
        return (
          <div className="ofd-pv-status ofd-pv-status-error" role="alert">
            {this.props.failureText(error instanceof Error ? error.message : String(error))}
          </div>
        )
      }
      return this.props.children
    }
  }
}
