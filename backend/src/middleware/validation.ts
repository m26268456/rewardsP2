import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * 驗證中間件
 * 使用 Zod schema 驗證請求體
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // 驗證並轉換請求體
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError(
          '輸入驗證失敗',
          error.errors
        );
        return next(validationError);
      }
      next(error);
    }
  };
}

/**
 * 驗證 UUID 參數
 */
export function validateUUID(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuid && uuid !== 'null' && !uuidRegex.test(uuid)) {
      const validationError = new ValidationError(
        `無效的 ${paramName} 格式（必須是 UUID）`
      );
      return next(validationError);
    }
    
    next();
  };
}

