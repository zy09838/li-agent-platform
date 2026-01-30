/**
 * 统一错误处理工具
 * 使用简单的alert替代toast，无需额外依赖
 */

export interface APIError {
  success: false;
  error: string;
  code?: number;
  details?: any;
}

export interface APISuccess<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export type APIResponse<T = any> = APISuccess<T> | APIError;

export class ErrorHandler {
  /**
   * 处理API错误
   */
  static handleAPIError(error: any): void {
    let message = '操作失败，请稍后重试';

    if (error.response?.data?.error) {
      message = error.response.data.error;
    } else if (error.message) {
      message = error.message;
    }

    // 使用alert显示错误（简单方案，无需额外依赖）
    alert(`❌ 错误: ${message}`);
    console.error('[API Error]', error);
  }

  /**
   * 处理成功消息
   */
  static handleSuccess(message: string): void {
    alert(`✅ 成功: ${message}`);
    console.log('[Success]', message);
  }

  /**
   * 处理警告消息
   */
  static handleWarning(message: string): void {
    alert(`⚠️ 警告: ${message}`);
    console.warn('[Warning]', message);
  }

  /**
   * 处理信息消息
   */
  static handleInfo(message: string): void {
    alert(`ℹ️ 信息: ${message}`);
    console.info('[Info]', message);
  }

  /**
   * 通用错误处理包装器
   */
  static async handleAsync<T>(
    promise: Promise<T>,
    errorMessage?: string
  ): Promise<T | null> {
    try {
      return await promise;
    } catch (error) {
      if (errorMessage) {
        alert(`❌ ${errorMessage}: ${error}`);
      } else {
        ErrorHandler.handleAPIError(error);
      }
      return null;
    }
  }
}

/**
 * 统一API调用函数
 */
export async function apiCall<T>(
  url: string,
  options?: RequestInit
): Promise<APIResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        code: response.status,
      };
    }

    return {
      success: true,
      data: data.data || data,
      message: data.message,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '网络请求失败',
      code: 0,
    };
  }
}
