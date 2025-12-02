/**
 * 優化版的方案服務
 * 使用 JOIN 查詢減少 N+1 問題
 */
import { pool } from '../config/database';
import { SchemeInfo, RewardComposition } from '../utils/types';

/**
 * 取得所有卡片及其方案（優化版：使用 JOIN 減少查詢次數）
 * 從 101 次查詢減少到 1-2 次查詢
 */
export async function getAllCardsWithSchemesOptimized(): Promise<
  Array<{
    id: string;
    name: string;
    note?: string;
    displayOrder: number;
    schemes: Array<{
      id: string;
      name: string;
      note?: string;
      requiresSwitch: boolean;
      activityStartDate?: string;
      activityEndDate?: string;
      rewards: RewardComposition[];
      exclusions: string[];
      applications: Array<{
        channelId: string;
        channelName: string;
        note?: string;
      }>;
    }>;
  }>
> {
  try {
    // 使用單一查詢取得所有資料，使用 JSON 聚合
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.note,
        c.display_order,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'scheme_id', cs.id,
              'scheme_name', cs.name,
              'scheme_note', cs.note,
              'requires_switch', cs.requires_switch,
              'activity_start_date', cs.activity_start_date,
              'activity_end_date', cs.activity_end_date,
              'display_order', cs.display_order
            )
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'::json
        ) as schemes_raw
      FROM cards c
      LEFT JOIN card_schemes cs ON c.id = cs.card_id
      GROUP BY c.id, c.name, c.note, c.display_order
      ORDER BY c.display_order, c.created_at
    `);

    // 取得所有方案的回饋組成（一次查詢）
    const rewardsResult = await pool.query(`
      SELECT 
        sr.scheme_id,
        json_agg(
          json_build_object(
            'percentage', sr.reward_percentage,
            'calculationMethod', sr.calculation_method,
            'quotaLimit', sr.quota_limit,
            'quotaRefreshType', sr.quota_refresh_type,
            'quotaRefreshValue', sr.quota_refresh_value,
            'quotaRefreshDate', sr.quota_refresh_date
          ) ORDER BY sr.display_order
        ) as rewards
      FROM scheme_rewards sr
      GROUP BY sr.scheme_id
    `);

    // 取得所有方案的排除通路（一次查詢）
    const exclusionsResult = await pool.query(`
      SELECT 
        sce.scheme_id,
        json_agg(c.name ORDER BY c.name) as exclusions
      FROM scheme_channel_exclusions sce
      JOIN channels c ON sce.channel_id = c.id
      GROUP BY sce.scheme_id
    `);

    // 取得所有方案的適用通路（一次查詢）
    const applicationsResult = await pool.query(`
      SELECT 
        sca.scheme_id,
        json_agg(
          json_build_object(
            'channelId', c.id,
            'channelName', c.name,
            'note', sca.note
          ) ORDER BY c.name
        ) as applications
      FROM scheme_channel_applications sca
      JOIN channels c ON sca.channel_id = c.id
      GROUP BY sca.scheme_id
    `);

    // 建立查找表
    const rewardsMap = new Map<string, RewardComposition[]>();
    rewardsResult.rows.forEach((row: any) => {
      rewardsMap.set(row.scheme_id, row.rewards.map((r: any) => ({
        percentage: parseFloat(r.percentage) || 0,
        calculationMethod: r.calculationMethod || 'round',
        quotaLimit: r.quotaLimit ? parseFloat(r.quotaLimit) : null,
        quotaRefreshType: r.quotaRefreshType || null,
        quotaRefreshValue: r.quotaRefreshValue || null,
        quotaRefreshDate: r.quotaRefreshDate || null,
      })));
    });

    const exclusionsMap = new Map<string, string[]>();
    exclusionsResult.rows.forEach((row: any) => {
      exclusionsMap.set(row.scheme_id, row.exclusions);
    });

    const applicationsMap = new Map<string, Array<{ channelId: string; channelName: string; note?: string }>>();
    applicationsResult.rows.forEach((row: any) => {
      applicationsMap.set(row.scheme_id, row.applications);
    });

    // 組合結果
    return result.rows.map((card: any) => {
      const schemes = (card.schemes_raw || []).map((scheme: any) => ({
        id: scheme.scheme_id,
        name: scheme.scheme_name,
        note: scheme.scheme_note || undefined,
        requiresSwitch: scheme.requires_switch || false,
        activityStartDate: scheme.activity_start_date
          ? scheme.activity_start_date.toISOString().split('T')[0]
          : undefined,
        activityEndDate: scheme.activity_end_date
          ? scheme.activity_end_date.toISOString().split('T')[0]
          : undefined,
        rewards: rewardsMap.get(scheme.scheme_id) || [],
        exclusions: exclusionsMap.get(scheme.scheme_id) || [],
        applications: applicationsMap.get(scheme.scheme_id) || [],
      }));

      return {
        id: card.id,
        name: card.name,
        note: card.note || undefined,
        displayOrder: card.display_order,
        schemes,
      };
    });
  } catch (error) {
    console.error('取得卡片方案錯誤:', error);
    throw error;
  }
}

