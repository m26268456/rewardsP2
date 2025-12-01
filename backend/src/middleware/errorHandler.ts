import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

/**
 * 改進的錯誤處理中間件
 * 統一處理所有錯誤，提供一致的錯誤回應格式
 */
export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 如果是自訂錯誤，使用其狀態碼和代碼
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || '伺服器內部錯誤';
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';

  // 記錄錯誤（生產環境不顯示堆疊）
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  console.error('錯誤:', {
    message: err.message,
    code,
    stack: isDevelopment ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // 如果是 ValidationError，包含詳細資訊
  const details = err instanceof AppError && 'details' in err 
    ? (err as any).details 
    : undefined;

  res.status(statusCode).json({
    success: false,
    error: {
      message: isDevelopment ? message : (statusCode === 500 ? '伺服器內部錯誤' : message),
      code,
      ...(details && { details }),
      ...(isDevelopment && { stack: err.stack }),
    },
  });
};

