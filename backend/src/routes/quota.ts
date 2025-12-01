import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { QuotaService } from '../services/quotaService';
import { validate } from '../middleware/validation';
import { validateUUID } from '../middleware/validation';
import { updateQuotaSchema } from '../validators/quotaValidator';
import { successResponse } from '../utils/response';
import { ValidationError } from '../utils/errors';

const router = Router();
const quotaService = new QuotaService(pool);

/**
 * 取得所有額度資訊
 * 優化：分離刷新邏輯，避免在 GET 請求中執行刷新
 * 刷新應該由定時任務處理，或通過單獨的刷新端點觸發
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 只查詢，不刷新（刷新由定時任務處理）
    const { schemeQuotas, paymentSchemeQuotas, paymentQuotas } =
      await quotaService.getAllQuotas();

    // 格式化資料
    const result = quotaService.formatQuotasForResponse(
      schemeQuotas,
      paymentSchemeQuotas,
      paymentQuotas
    );

    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

/**
 * 手動觸發額度刷新
 * 優化：提供單獨的刷新端點，避免在 GET 請求中執行刷新
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { schemeQuotas, paymentSchemeQuotas, paymentQuotas } =
      await quotaService.getAllQuotas();

    // 合併所有額度
    const allQuotas = [
      ...schemeQuotas,
      ...paymentSchemeQuotas,
      ...paymentQuotas,
    ];

    // 刷新需要刷新的額度
    const refreshedQuotas = await quotaService.refreshQuotasIfNeeded(allQuotas);

    // 重新格式化資料
    const refreshedSchemeQuotas = refreshedQuotas.filter(
      (q) => q.scheme_id && !q.payment_method_id
    );
    const refreshedPaymentSchemeQuotas = refreshedQuotas.filter(
      (q) => q.scheme_id && q.payment_method_id
    );
    const refreshedPaymentQuotas = refreshedQuotas.filter(
      (q) => !q.scheme_id && q.payment_method_id
    );

    const result = quotaService.formatQuotasForResponse(
      refreshedSchemeQuotas,
      refreshedPaymentSchemeQuotas,
      refreshedPaymentQuotas
    );

    res.json(successResponse(result, '額度已刷新'));
  } catch (error) {
    next(error);
  }
});

/**
 * 更新額度（手動編輯）
 * 優化：使用驗證中間件、改進錯誤處理
 */
router.put(
  '/:schemeId',
  validateUUID('schemeId'),
  validate(updateQuotaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schemeId } = req.params;
      const { paymentMethodId, rewardId, quotaLimit, usedQuota, remainingQuota } =
        req.body;

      if (!rewardId) {
        throw new ValidationError('回饋 ID 必填');
      }

      // 處理 schemeId 為 "null" 字符串的情況（純支付方式）
      const actualSchemeId = schemeId === 'null' ? null : schemeId;

      // 判斷是卡片方案還是支付方式的回饋組成
      let checkResult;
      if (actualSchemeId) {
        checkResult = await pool.query(
          `SELECT id, used_quota FROM quota_trackings
           WHERE scheme_id = $1::uuid
             AND (payment_method_id = $2::uuid OR (payment_method_id IS NULL AND $2::uuid IS NULL))
             AND reward_id = $3::uuid
             AND payment_reward_id IS NULL`,
          [actualSchemeId, paymentMethodId || null, rewardId]
        );
      } else if (paymentMethodId) {
        checkResult = await pool.query(
          `SELECT id, used_quota FROM quota_trackings
           WHERE payment_method_id = $1 
             AND payment_reward_id = $2
             AND scheme_id IS NULL`,
          [paymentMethodId, rewardId]
        );
      } else {
        throw new ValidationError('缺少必要參數');
      }

      if (checkResult.rows.length > 0) {
        // 更新現有記錄
        // 處理增減邏輯：如果 usedQuota 以 + 或 - 開頭，則進行增減
        let newUsedQuota = usedQuota;
        if (typeof usedQuota === 'string') {
          const currentUsedQuota = parseFloat(checkResult.rows[0].used_quota) || 0;
          if (usedQuota.startsWith('+')) {
            newUsedQuota = currentUsedQuota + parseFloat(usedQuota.substring(1));
          } else if (usedQuota.startsWith('-')) {
            newUsedQuota = currentUsedQuota - parseFloat(usedQuota.substring(1));
          } else {
            newUsedQuota = parseFloat(usedQuota);
          }
        }

        // 計算新的剩餘額度
        let newRemainingQuota = remainingQuota;
        if (actualSchemeId) {
          const schemeRewardResult = await pool.query(
            `SELECT quota_limit FROM scheme_rewards WHERE id = $1`,
            [rewardId]
          );
          if (
            schemeRewardResult.rows.length > 0 &&
            schemeRewardResult.rows[0].quota_limit
          ) {
            const limit = parseFloat(schemeRewardResult.rows[0].quota_limit);
            newRemainingQuota = limit - (newUsedQuota as number);
            if (newRemainingQuota < 0) {
              newRemainingQuota = 0;
            }
          }
        } else if (paymentMethodId) {
          const paymentRewardResult = await pool.query(
            `SELECT quota_limit FROM payment_rewards WHERE id = $1`,
            [rewardId]
          );
          if (
            paymentRewardResult.rows.length > 0 &&
            paymentRewardResult.rows[0].quota_limit
          ) {
            const limit = parseFloat(paymentRewardResult.rows[0].quota_limit);
            newRemainingQuota = limit - (newUsedQuota as number);
            if (newRemainingQuota < 0) {
              newRemainingQuota = 0;
            }
          }
        }

        await pool.query(
          `UPDATE quota_trackings
           SET used_quota = COALESCE($1, used_quota), 
               remaining_quota = $2, 
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [
            newUsedQuota !== undefined
              ? newUsedQuota
              : checkResult.rows[0].used_quota,
            newRemainingQuota !== undefined ? newRemainingQuota : null,
            checkResult.rows[0].id,
          ]
        );
      } else {
        // 如果不存在，創建新記錄
        if (actualSchemeId) {
          await pool.query(
            `INSERT INTO quota_trackings 
             (scheme_id, payment_method_id, reward_id, used_quota, remaining_quota)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              actualSchemeId,
              paymentMethodId || null,
              rewardId,
              usedQuota !== undefined ? usedQuota : 0,
              remainingQuota !== undefined ? remainingQuota : null,
            ]
          );
        } else if (paymentMethodId) {
          await pool.query(
            `INSERT INTO quota_trackings 
             (payment_method_id, payment_reward_id, used_quota, remaining_quota)
             VALUES ($1, $2, $3, $4)`,
            [
              paymentMethodId,
              rewardId,
              usedQuota !== undefined ? usedQuota : 0,
              remainingQuota !== undefined ? remainingQuota : null,
            ]
          );
        }
      }

      res.json(successResponse(null, '額度已更新'));
    } catch (error) {
      next(error);
    }
  }
);

export default router;

