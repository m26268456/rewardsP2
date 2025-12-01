import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { calculateTotalReward } from '../utils/rewardCalculation';
import { CalculationMethod } from '../utils/types';
import { validate } from '../middleware/validation';
import {
  calculateRewardSchema,
  calculateWithSchemeSchema,
} from '../validators/calculationValidator';
import { successResponse } from '../utils/response';
import { ValidationError, NotFoundError } from '../utils/errors';

const router = Router();

/**
 * 回饋計算（不帶入方案）
 * 優化：使用驗證中間件、改進錯誤處理
 */
router.post(
  '/calculate',
  validate(calculateRewardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, rewards } = req.body;

      const calculation = calculateTotalReward(
        parseFloat(amount),
        rewards.map((r: any) => ({
          percentage: parseFloat(r.percentage),
          calculationMethod: r.calculationMethod as CalculationMethod,
        }))
      );

      res.json(successResponse(calculation));
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 回饋計算（帶入方案）
 * 優化：使用驗證中間件、改進錯誤處理、並行查詢
 */
router.post(
  '/calculate-with-scheme',
  validate(calculateWithSchemeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, schemeId, paymentMethodId } = req.body;

      let rewards: Array<{
        percentage: number;
        calculationMethod: CalculationMethod;
        id?: string;
      }> = [];
      let rewardsResult: any;

      // 如果有方案 ID，取得方案的回饋組成
      if (schemeId) {
        rewardsResult = await pool.query(
          `SELECT sr.id, sr.reward_percentage, sr.calculation_method, sr.quota_limit,
                  sr.quota_refresh_type, sr.quota_refresh_value, sr.quota_refresh_date,
                  cs.activity_end_date
           FROM scheme_rewards sr
           JOIN card_schemes cs ON sr.scheme_id = cs.id
           WHERE sr.scheme_id = $1
           ORDER BY sr.display_order`,
          [schemeId]
        );

        rewards = rewardsResult.rows.map((r: any) => ({
          id: r.id,
          percentage: parseFloat(r.reward_percentage),
          calculationMethod: r.calculation_method as CalculationMethod,
        }));
      }

      if (rewards.length === 0) {
        throw new ValidationError('請提供方案或支付方式');
      }

      // 計算回饋
      const calculation = calculateTotalReward(
        parseFloat(amount),
        rewards.map((r) => ({
          percentage: r.percentage,
          calculationMethod: r.calculationMethod,
        }))
      );

      // 取得額度資訊（僅針對有方案的情況）
      let quotaInfo: any[] = [];
      if (schemeId && rewardsResult) {
        // 並行查詢所有額度資訊，提升效能
        quotaInfo = await Promise.all(
          rewardsResult.rows.map(async (reward: any) => {
            const quotaLimit = reward.quota_limit
              ? parseFloat(reward.quota_limit)
              : null;

            const quotaResult = await pool.query(
              `SELECT remaining_quota, used_quota
               FROM quota_trackings
               WHERE scheme_id = $1::uuid 
                 AND reward_id = $2::uuid
                 AND (payment_method_id = $3::uuid OR (payment_method_id IS NULL AND $3::uuid IS NULL))`,
              [schemeId, reward.id, paymentMethodId || null]
            );

            const quota = quotaResult.rows[0];
            const remainingQuota = quota?.remaining_quota
              ? parseFloat(quota.remaining_quota)
              : null;
            const usedQuota = quota?.used_quota ? parseFloat(quota.used_quota) : 0;
            const percentage = parseFloat(reward.reward_percentage);

            // 計算預估消費後的剩餘額度
            const calculatedReward = calculation.breakdown.find(
              (b) => b.percentage === percentage
            )?.calculatedReward || 0;

            // 當前餘額（如果有追蹤記錄，使用 remaining_quota；否則使用 quota_limit）
            let currentQuota: number | null = null;
            if (quotaLimit !== null) {
              if (remainingQuota !== null) {
                currentQuota = remainingQuota;
              } else {
                currentQuota = quotaLimit;
              }
            }

            // 計算預估消費後的剩餘額度
            let newRemainingQuota: number | null = null;
            if (quotaLimit !== null) {
              if (remainingQuota !== null) {
                newRemainingQuota = remainingQuota - calculatedReward;
              } else {
                newRemainingQuota = quotaLimit - calculatedReward;
              }
            }

            // 計算參考餘額
            const referenceAmount =
              newRemainingQuota !== null
                ? (newRemainingQuota / percentage) * 100
                : null;

            return {
              rewardPercentage: percentage,
              quotaLimit: quotaLimit !== null ? quotaLimit : '無上限',
              currentQuota: currentQuota !== null ? currentQuota : '無上限',
              deductedQuota: calculatedReward,
              remainingQuota: newRemainingQuota !== null ? newRemainingQuota : '無上限',
              referenceAmount: referenceAmount !== null ? referenceAmount : '無上限',
            };
          })
        );
      }

      res.json(
        successResponse({
          ...calculation,
          quotaInfo,
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 取得可用於計算的方案列表（從設定表）
 * 優化：改進錯誤處理
 */
router.get('/schemes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT cs.id, cs.scheme_id, cs.payment_method_id, cs.display_order,
              CASE
                WHEN cs.payment_method_id IS NOT NULL AND cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name || '-' || pm.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   JOIN payment_methods pm ON cs.payment_method_id = pm.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.scheme_id IS NOT NULL THEN
                  (SELECT c.name || '-' || cs2.name
                   FROM card_schemes cs2
                   JOIN cards c ON cs2.card_id = c.id
                   WHERE cs2.id = cs.scheme_id)
                WHEN cs.payment_method_id IS NOT NULL THEN
                  (SELECT name FROM payment_methods WHERE id = cs.payment_method_id)
              END as name
       FROM calculation_schemes cs
       ORDER BY cs.display_order, cs.id`
    );

    const schemes = result.rows.map((r) => ({
      id:
        r.scheme_id && r.payment_method_id
          ? `${r.scheme_id}_${r.payment_method_id}`
          : r.scheme_id || r.payment_method_id,
      name: r.name,
      type:
        r.scheme_id && r.payment_method_id
          ? 'payment_scheme'
          : r.scheme_id
          ? 'scheme'
          : 'payment',
      schemeId: r.scheme_id,
      paymentId: r.payment_method_id,
    }));

    res.json(successResponse(schemes));
  } catch (error) {
    next(error);
  }
});

export default router;

