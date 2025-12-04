import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

// ============================================
// A: 回饋查詢設定
// ============================================

// 更新卡片順序
router.put('/cards/order', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body; // [{ id, displayOrder }]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE cards SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新支付方式順序
router.put('/payment-methods/order', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE payment_methods SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新常用通路順序
router.put('/channels/common/order', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE channels SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================================
// B: 回饋計算設定
// ============================================

// 取得計算方案列表
router.get('/calculation-schemes', async (req: Request, res: Response) => {
  try {
    // 取得所有計算方案，按 display_order 排序
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

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增計算方案
router.post('/calculation-schemes', async (req: Request, res: Response) => {
  try {
    const { schemeId, paymentMethodId, displayOrder } = req.body;

    const result = await pool.query(
      `INSERT INTO calculation_schemes (scheme_id, payment_method_id, display_order)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [schemeId || null, paymentMethodId || null, displayOrder || 0]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新計算方案順序
router.put('/calculation-schemes/order', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        if (!order.id || order.displayOrder === undefined) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '順序資料格式錯誤' });
        }
        await client.query(
          'UPDATE calculation_schemes SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除計算方案
router.delete('/calculation-schemes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM calculation_schemes WHERE id = $1', [id]);

    res.json({ success: true, message: '方案已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============================================
// C: 記帳功能設定
// ============================================

// 取得事由字串
router.get('/reason-strings', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT id, content FROM reason_strings ORDER BY created_at');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新事由字串
router.put('/reason-strings', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    // 刪除舊的
    await pool.query('DELETE FROM reason_strings');

    // 插入新的
    if (content) {
      await pool.query('INSERT INTO reason_strings (content) VALUES ($1)', [content]);
    }

    res.json({ success: true, message: '事由字串已更新' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 取得交易類型
router.get('/transaction-types', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, display_order FROM transaction_types ORDER BY display_order, created_at'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增交易類型
router.post('/transaction-types', async (req: Request, res: Response) => {
  try {
    const { name, displayOrder } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '類型名稱必填' });
    }

    const result = await pool.query(
      `INSERT INTO transaction_types (name, display_order)
       VALUES ($1, $2)
       RETURNING id, name, display_order`,
      [name, displayOrder || 0]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新交易類型順序（必須在 /:id 之前）
router.put('/transaction-types/order', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: '請提供順序陣列' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const order of orders) {
        await client.query(
          'UPDATE transaction_types SET display_order = $1 WHERE id = $2',
          [order.displayOrder, order.id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: '順序已更新' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新交易類型
router.put('/transaction-types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, displayOrder } = req.body;

    const result = await pool.query(
      `UPDATE transaction_types
       SET name = $1, display_order = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, display_order`,
      [name, displayOrder, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '類型不存在' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 刪除交易類型
router.delete('/transaction-types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM transaction_types WHERE id = $1', [id]);

    res.json({ success: true, message: '類型已刪除' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 清除交易明細（依時間區間）
router.delete('/transactions/clear', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '請提供開始日期和結束日期',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 先取得所有要刪除的交易（包含方案和金額）
      const transactionsResult = await client.query(
        `SELECT id, scheme_id, payment_method_id, amount
         FROM transactions
         WHERE transaction_date >= $1 AND transaction_date <= $2`,
        [startDate, endDate]
      );

      const transactions = transactionsResult.rows;

      // 對每筆交易回退額度
      for (const transaction of transactions) {
        if (transaction.scheme_id && transaction.amount) {
          // 取得方案的回饋組成（包含額度計算方式）
          const rewardsResult = await client.query(
            `SELECT sr.id, sr.reward_percentage, sr.calculation_method, sr.quota_calculation_mode
             FROM scheme_rewards sr
             WHERE sr.scheme_id = $1
             ORDER BY sr.display_order`,
            [transaction.scheme_id]
          );

          const rewards = rewardsResult.rows;
          
          // 回退額度
          for (let i = 0; i < rewards.length; i++) {
            const reward = rewards[i];
            const quotaCalculationMode = reward.quota_calculation_mode || 'per_transaction';
            
            // 取得當前的額度追蹤記錄
            const quotaResult = await client.query(
              `SELECT id, used_quota, current_amount
               FROM quota_trackings
               WHERE scheme_id = $1 AND reward_id = $2
               AND (payment_method_id = $3 OR (payment_method_id IS NULL AND $3 IS NULL))`,
              [transaction.scheme_id, reward.id, transaction.payment_method_id || null]
            );
            
            if (quotaResult.rows.length > 0) {
              const quota = quotaResult.rows[0];
              const newCurrentAmount = parseFloat(quota.current_amount) - parseFloat(transaction.amount);
              
              let newUsedQuota: number;
              if (quotaCalculationMode === 'total_amount') {
                // 帳單總額模式：重新計算總額的回饋
                const { calculateReward } = require('../utils/rewardCalculation');
                newUsedQuota = calculateReward(
                  newCurrentAmount,
                  parseFloat(reward.reward_percentage),
                  reward.calculation_method
                );
              } else {
                // 單筆回饋模式：回退單筆回饋
                const { calculateReward } = require('../utils/rewardCalculation');
                const calculatedReward = calculateReward(
                  parseFloat(transaction.amount),
                  parseFloat(reward.reward_percentage),
                  reward.calculation_method
                );
                newUsedQuota = parseFloat(quota.used_quota) - calculatedReward;
              }
              
              // 計算剩餘額度
              const quotaLimitResult = await client.query(
                `SELECT quota_limit FROM scheme_rewards WHERE id = $1`,
                [reward.id]
              );
              const quotaLimit = quotaLimitResult.rows[0]?.quota_limit ? parseFloat(quotaLimitResult.rows[0].quota_limit) : null;
              let newRemainingQuota: number | null = null;
              if (quotaLimit !== null) {
                newRemainingQuota = quotaLimit - newUsedQuota;
                if (newRemainingQuota < 0) {
                  newRemainingQuota = 0;
                }
              }

              await client.query(
                `UPDATE quota_trackings
                 SET used_quota = $1,
                     remaining_quota = $2,
                     current_amount = $3,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [
                  newUsedQuota,
                  newRemainingQuota,
                  newCurrentAmount,
                  quota.id,
                ]
              );
            }
          }
        }
      }

      // 刪除交易
      const deleteResult = await client.query(
        `DELETE FROM transactions
         WHERE transaction_date >= $1 AND transaction_date <= $2
         RETURNING id`,
        [startDate, endDate]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `已清除 ${deleteResult.rows.length} 筆交易`,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

