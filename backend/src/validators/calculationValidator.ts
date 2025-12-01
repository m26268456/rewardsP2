import { z } from 'zod';
import { CalculationMethod } from '../utils/types';

/**
 * 計算回饋驗證 Schema（不帶方案）
 */
export const calculateRewardSchema = z.object({
  amount: z.number().positive('金額必須大於 0'),
  rewards: z.array(
    z.object({
      percentage: z.number().nonnegative('回饋百分比不能為負數'),
      calculationMethod: z.enum(['round', 'floor', 'ceil'] as const),
    })
  ).length(3, '必須提供三個回饋組成'),
});

/**
 * 計算回饋驗證 Schema（帶方案）
 */
export const calculateWithSchemeSchema = z.object({
  amount: z.number().positive('金額必須大於 0'),
  schemeId: z.string().uuid().optional().nullable(),
  paymentMethodId: z.string().uuid().optional().nullable(),
}).refine(
  (data) => data.schemeId || data.paymentMethodId,
  {
    message: '必須提供方案 ID 或支付方式 ID',
  }
);

