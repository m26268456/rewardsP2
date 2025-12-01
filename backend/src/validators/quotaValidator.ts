import { z } from 'zod';

/**
 * 更新額度驗證 Schema
 */
export const updateQuotaSchema = z.object({
  paymentMethodId: z.string().uuid().optional().nullable(),
  rewardId: z.string().uuid('回饋 ID 必須是有效的 UUID'),
  quotaLimit: z.number().nonnegative().optional().nullable(),
  usedQuota: z.union([
    z.number(),
    z.string().regex(/^[+-]?\d+(\.\d+)?$/, 'usedQuota 必須是數字或 +/- 開頭的數字字串'),
  ]).optional(),
  remainingQuota: z.number().nonnegative().optional().nullable(),
});

