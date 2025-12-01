import { z } from 'zod';

/**
 * 建立交易驗證 Schema
 */
export const createTransactionSchema = z.object({
  transactionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  reason: z.string().min(1, '事由不能為空'),
  amount: z.number().positive().optional().nullable(),
  typeId: z.string().uuid('類型 ID 必須是有效的 UUID'),
  note: z.string().optional().nullable(),
  schemeId: z.string().uuid('方案 ID 必須是有效的 UUID').optional().nullable(),
  paymentMethodId: z.string().uuid('支付方式 ID 必須是有效的 UUID').optional().nullable(),
}).refine(
  (data) => data.schemeId || data.paymentMethodId,
  {
    message: '必須提供方案 ID 或支付方式 ID',
  }
);

/**
 * 更新交易驗證 Schema
 */
export const updateTransactionSchema = z.object({
  transactionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reason: z.string().min(1).optional(),
  amount: z.number().positive().optional().nullable(),
  typeId: z.string().uuid().optional(),
  note: z.string().optional().nullable(),
  schemeId: z.string().uuid().optional().nullable(),
  paymentMethodId: z.string().uuid().optional().nullable(),
});

