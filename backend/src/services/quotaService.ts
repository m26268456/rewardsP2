import { Pool } from 'pg';
import { shouldRefreshQuota, calculateNextRefreshTime, formatRefreshTime } from '../utils/quotaRefresh';

/**
 * 額度查詢結果類型
 */
export interface QuotaQueryResult {
  scheme_id: string | null;
  payment_method_id: string | null;
  name: string;
  reward_id: string;
  reward_percentage: string;
  calculation_method: string;
  quota_limit: string | null;
  quota_refresh_type: string | null;
  quota_refresh_value: number | null;
  quota_refresh_date: string | null;
  activity_end_date: string | null;
  display_order: number;
  used_quota: number;
  remaining_quota: number | null;
  current_amount: number;
  next_refresh_at: Date | null;
}

/**
 * 額度服務
 * 提取重複的查詢邏輯，提供統一的額度查詢和刷新功能
 */
export class QuotaService {
  constructor(private pool: Pool) {}

  /**
   * 取得所有額度資訊（並行查詢，提升效能）
   */
  async getAllQuotas(): Promise<{
    schemeQuotas: QuotaQueryResult[];
    paymentSchemeQuotas: QuotaQueryResult[];
    paymentQuotas: QuotaQueryResult[];
  }> {
    // 並行執行三個查詢，提升效能
    const [schemeQuotasResult, paymentSchemeQuotasResult, paymentQuotasResult] =
      await Promise.all([
        // 卡片方案的額度
        this.pool.query<QuotaQueryResult>(
          `SELECT 
           cs.id as scheme_id,
           NULL::uuid as payment_method_id,
           c.name || '-' || cs.name as name,
           sr.id as reward_id,
           sr.reward_percentage,
           sr.calculation_method,
           sr.quota_limit,
           sr.quota_refresh_type,
           sr.quota_refresh_value,
           sr.quota_refresh_date,
           cs.activity_end_date,
           sr.display_order,
           COALESCE(qt.used_quota, 0) as used_quota,
           qt.remaining_quota,
           COALESCE(qt.current_amount, 0) as current_amount,
           qt.next_refresh_at
         FROM card_schemes cs
         JOIN cards c ON cs.card_id = c.id
         JOIN scheme_rewards sr ON cs.id = sr.scheme_id
         LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
           AND sr.id = qt.reward_id 
           AND qt.payment_method_id IS NULL
         ORDER BY c.display_order, cs.display_order, sr.display_order`
        ),

        // 支付方式綁定卡片方案的額度
        this.pool.query<QuotaQueryResult>(
          `SELECT 
           cs.id as scheme_id,
           pm.id as payment_method_id,
           c.name || '-' || cs.name || '-' || pm.name as name,
           sr.id as reward_id,
           sr.reward_percentage,
           sr.calculation_method,
           sr.quota_limit,
           sr.quota_refresh_type,
           sr.quota_refresh_value,
           sr.quota_refresh_date,
           cs.activity_end_date,
           sr.display_order,
           COALESCE(qt.used_quota, 0) as used_quota,
           qt.remaining_quota,
           COALESCE(qt.current_amount, 0) as current_amount,
           qt.next_refresh_at
         FROM payment_scheme_links psl
         JOIN card_schemes cs ON psl.scheme_id = cs.id
         JOIN cards c ON cs.card_id = c.id
         JOIN payment_methods pm ON psl.payment_method_id = pm.id
         JOIN scheme_rewards sr ON cs.id = sr.scheme_id
         LEFT JOIN quota_trackings qt ON cs.id = qt.scheme_id 
           AND pm.id = qt.payment_method_id
           AND sr.id = qt.reward_id
         ORDER BY pm.display_order, cs.display_order, sr.display_order`
        ),

        // 純支付方式的額度
        this.pool.query<QuotaQueryResult>(
          `SELECT 
           NULL::uuid as scheme_id,
           pm.id as payment_method_id,
           pm.name,
           pr.id as reward_id,
           pr.reward_percentage,
           pr.calculation_method,
           pr.quota_limit,
           pr.quota_refresh_type,
           pr.quota_refresh_value,
           pr.quota_refresh_date,
           NULL::date as activity_end_date,
           pr.display_order,
           COALESCE(qt.used_quota, 0) as used_quota,
           qt.remaining_quota,
           COALESCE(qt.current_amount, 0) as current_amount,
           qt.next_refresh_at
         FROM payment_methods pm
         INNER JOIN payment_rewards pr ON pm.id = pr.payment_method_id
         LEFT JOIN quota_trackings qt ON pm.id = qt.payment_method_id 
           AND pr.id = qt.payment_reward_id
           AND qt.scheme_id IS NULL
         ORDER BY pm.display_order, pr.display_order`
        ),
      ]);

    return {
      schemeQuotas: schemeQuotasResult.rows,
      paymentSchemeQuotas: paymentSchemeQuotasResult.rows,
      paymentQuotas: paymentQuotasResult.rows,
    };
  }

  /**
   * 刷新需要刷新的額度
   * 返回刷新後的額度資料（避免重複查詢）
   */
  async refreshQuotasIfNeeded(
    quotas: QuotaQueryResult[]
  ): Promise<QuotaQueryResult[]> {
    const client = await this.pool.connect();
    const quotasToRefresh: QuotaQueryResult[] = [];
    const refreshedQuotas: QuotaQueryResult[] = [];

    try {
      for (const quota of quotas) {
        if (quota.next_refresh_at && shouldRefreshQuota(quota.next_refresh_at)) {
          quotasToRefresh.push(quota);
        } else {
          // 不需要刷新的額度直接加入結果
          refreshedQuotas.push(quota);
        }
      }

      // 批量刷新需要刷新的額度
      for (const quota of quotasToRefresh) {
        const nextRefresh = calculateNextRefreshTime(
          quota.quota_refresh_type as any,
          quota.quota_refresh_value,
          quota.quota_refresh_date,
          quota.activity_end_date
        );

        const quotaLimit = quota.quota_limit
          ? parseFloat(quota.quota_limit)
          : null;

        // 更新資料庫
        if (quota.scheme_id) {
          // 明確指定 UUID 類型以避免 PostgreSQL 類型推斷問題
          await client.query(
            `UPDATE quota_trackings
             SET used_quota = 0,
                 remaining_quota = $1,
                 current_amount = 0,
                 next_refresh_at = $2,
                 last_refresh_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE scheme_id = $3::uuid
               AND (payment_method_id = $4::uuid OR (payment_method_id IS NULL AND $4::uuid IS NULL))
               AND reward_id = $5::uuid
               AND payment_reward_id IS NULL`,
            [
              quotaLimit,
              nextRefresh,
              quota.scheme_id,
              quota.payment_method_id || null,
              quota.reward_id,
            ]
          );
        } else if (quota.payment_method_id && quota.reward_id) {
          await client.query(
            `UPDATE quota_trackings
             SET used_quota = 0,
                 remaining_quota = $1,
                 current_amount = 0,
                 next_refresh_at = $2,
                 last_refresh_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE payment_method_id = $3 
               AND payment_reward_id = $4
               AND scheme_id IS NULL`,
            [quotaLimit, nextRefresh, quota.payment_method_id, quota.reward_id]
          );
        }

        // 更新本地資料（避免再次查詢）
        refreshedQuotas.push({
          ...quota,
          used_quota: 0,
          remaining_quota: quotaLimit,
          current_amount: 0,
          next_refresh_at: nextRefresh,
        });
      }
    } finally {
      client.release();
    }

    return refreshedQuotas;
  }

  /**
   * 格式化額度資料為前端需要的格式
   */
  formatQuotasForResponse(
    schemeQuotas: QuotaQueryResult[],
    paymentSchemeQuotas: QuotaQueryResult[],
    paymentQuotas: QuotaQueryResult[]
  ) {
    const quotaMap = new Map<
      string,
      {
        name: string;
        rewards: Array<{
          percentage: number;
          rewardId: string;
          calculationMethod: string;
          quotaLimit: number | null;
          currentAmount: number;
          usedQuota: number;
          remainingQuota: number | null;
          referenceAmount: number | null;
          refreshTime: string;
        }>;
      }
    >();

    const allQuotas = [...schemeQuotas, ...paymentSchemeQuotas, ...paymentQuotas];

    allQuotas.forEach((row) => {
      const key = `${row.scheme_id || 'null'}_${row.payment_method_id || 'null'}`;
      const percentage = parseFloat(row.reward_percentage);
      const usedQuota = row.used_quota || 0;
      const currentAmount = row.current_amount || 0;
      const quotaLimit = row.quota_limit ? parseFloat(row.quota_limit) : null;

      // 計算剩餘額度
      let remainingQuota: number | null = null;
      if (quotaLimit !== null) {
        remainingQuota = Math.max(0, quotaLimit - usedQuota);
      }

      if (!quotaMap.has(key)) {
        quotaMap.set(key, {
          name: row.name,
          rewards: [],
        });
      }

      const quota = quotaMap.get(key)!;

      // 計算參考餘額
      const referenceAmount =
        remainingQuota !== null && percentage > 0
          ? (remainingQuota / percentage) * 100
          : null;

      // 格式化刷新時間
      const refreshTime = formatRefreshTime(
        row.quota_refresh_type as any,
        row.quota_refresh_value,
        row.quota_refresh_date,
        row.activity_end_date
      );

      quota.rewards.push({
        percentage,
        rewardId: row.reward_id || '',
        calculationMethod: row.calculation_method || 'round',
        quotaLimit,
        currentAmount,
        usedQuota,
        remainingQuota,
        referenceAmount,
        refreshTime,
      });
    });

    // 轉換為前端需要的格式
    const result = Array.from(quotaMap.entries()).map(([key, quota]) => {
      quota.rewards.sort((a, b) => a.percentage - b.percentage);

      const [schemeId, paymentMethodId] = key.split('_');

      return {
        schemeId: schemeId === 'null' ? null : schemeId,
        paymentMethodId: paymentMethodId === 'null' ? null : paymentMethodId,
        name: quota.name,
        rewardComposition: quota.rewards.map((r) => `${r.percentage}%`).join('/'),
        calculationMethods: quota.rewards.map((r) => r.calculationMethod),
        quotaLimits: quota.rewards.map((r) => r.quotaLimit),
        currentAmounts: quota.rewards.map((r) => r.currentAmount),
        usedQuotas: quota.rewards.map((r) => r.usedQuota),
        remainingQuotas: quota.rewards.map((r) => r.remainingQuota),
        referenceAmounts: quota.rewards.map((r) => r.referenceAmount),
        refreshTimes: quota.rewards.map((r) => r.refreshTime),
        rewardIds: quota.rewards.map((r) => r.rewardId),
      };
    });

    return result;
  }
}

