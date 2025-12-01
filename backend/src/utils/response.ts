/**
 * 統一回應格式工具
 * 確保所有 API 回應格式一致
 */

export interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
    stack?: string;
  };
}

/**
 * 成功回應
 */
export function successResponse<T>(
  data: T,
  message?: string
): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  };
}

/**
 * 錯誤回應
 */
export function errorResponse(
  message: string,
  code?: string,
  details?: any,
  stack?: string
): ErrorResponse {
  return {
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(details && { details }),
      ...(stack && { stack }),
    },
  };
}

