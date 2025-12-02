import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { validateUUID } from '../middleware/validation';
import { successResponse } from '../utils/response';
import { NotFoundError, ValidationError } from '../utils/errors';
import { z } from 'zod';

const router = Router();

// 驗證 Schema
const createCardSchema = z.object({
  name: z.string().min(1, '卡片名稱必填'),
  note: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
});

const updateCardSchema = z.object({
  name: z.string().min(1).optional(),
  note: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
});

/**
 * 取得所有卡片（用於管理設定）
 * 優化：使用統一回應格式、改進錯誤處理
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, name, note, display_order FROM cards ORDER BY display_order, created_at'
    );
    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
});

/**
 * 新增卡片
 * 優化：添加驗證、使用統一回應格式
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const validated = createCardSchema.parse(req.body);
        const { name, note } = validated;

        // 取得最大 display_order，新增在最下方
        const maxOrderResult = await pool.query(
          'SELECT COALESCE(MAX(display_order), 0) as max_order FROM cards'
        );
        const maxOrder = maxOrderResult.rows[0]?.max_order || 0;

        const result = await pool.query(
          `INSERT INTO cards (name, note, display_order)
           VALUES ($1, $2, $3)
           RETURNING id, name, note, display_order`,
          [name, note || null, maxOrder + 1]
        );

    res.json(successResponse(result.rows[0], '卡片已建立'));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new ValidationError('輸入驗證失敗', error.errors));
    }
    next(error);
  }
});

/**
 * 更新卡片
 * 優化：添加 UUID 驗證、使用統一回應格式
 */
router.put(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validated = updateCardSchema.parse(req.body);
      const { name, note, displayOrder } = validated;

      const result = await pool.query(
        `UPDATE cards
         SET name = COALESCE($1, name), 
             note = $2, 
             display_order = COALESCE($3, display_order), 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, name, note, display_order`,
        [name, note !== undefined ? note : null, displayOrder, id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('卡片');
      }

      res.json(successResponse(result.rows[0], '卡片已更新'));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('輸入驗證失敗', error.errors));
      }
      next(error);
    }
  }
);

/**
 * 刪除卡片
 * 優化：添加 UUID 驗證、使用統一回應格式
 */
router.delete(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await pool.query('DELETE FROM cards WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        throw new NotFoundError('卡片');
      }

      res.json(successResponse(null, '卡片已刪除'));
    } catch (error) {
      next(error);
    }
  }
);

export default router;

