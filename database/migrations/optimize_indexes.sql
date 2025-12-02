-- ============================================
-- 資料庫索引優化腳本
-- 添加複合索引和部分索引以提升查詢效能
-- ============================================

-- 1. quota_trackings 表的複合索引
-- 用於常見的查詢模式

-- 卡片方案額度查詢（最常用）
CREATE INDEX IF NOT EXISTS idx_quota_trackings_scheme_reward_payment 
ON quota_trackings(scheme_id, reward_id, payment_method_id) 
WHERE scheme_id IS NOT NULL AND reward_id IS NOT NULL;

-- 支付方式額度查詢
CREATE INDEX IF NOT EXISTS idx_quota_trackings_payment_reward 
ON quota_trackings(payment_method_id, payment_reward_id) 
WHERE payment_method_id IS NOT NULL AND payment_reward_id IS NOT NULL AND scheme_id IS NULL;

-- 刷新時間查詢（用於定時任務）
CREATE INDEX IF NOT EXISTS idx_quota_trackings_refresh_time 
ON quota_trackings(next_refresh_at) 
WHERE next_refresh_at IS NOT NULL;

-- 2. scheme_rewards 表的複合索引
-- 用於方案總覽查詢
CREATE INDEX IF NOT EXISTS idx_scheme_rewards_scheme_display 
ON scheme_rewards(scheme_id, display_order);

-- 3. card_schemes 表的複合索引
-- 用於卡片方案查詢
CREATE INDEX IF NOT EXISTS idx_card_schemes_card_display 
ON card_schemes(card_id, display_order);

-- 4. transactions 表的複合索引
-- 用於交易查詢和報表
CREATE INDEX IF NOT EXISTS idx_transactions_scheme_date 
ON transactions(scheme_id, transaction_date DESC) 
WHERE scheme_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_date 
ON transactions(payment_method_id, transaction_date DESC) 
WHERE payment_method_id IS NOT NULL;

-- 5. scheme_channel_applications 表的複合索引
-- 用於通路查詢
CREATE INDEX IF NOT EXISTS idx_scheme_channel_applications_channel_scheme 
ON scheme_channel_applications(channel_id, scheme_id);

-- 6. payment_channel_applications 表的複合索引
CREATE INDEX IF NOT EXISTS idx_payment_channel_applications_channel_payment 
ON payment_channel_applications(channel_id, payment_method_id);

-- 7. payment_scheme_links 表的複合索引
-- 用於支付方式連結查詢
CREATE INDEX IF NOT EXISTS idx_payment_scheme_links_payment_scheme 
ON payment_scheme_links(payment_method_id, scheme_id);

-- 8. 分析表統計資訊（幫助查詢優化器選擇最佳索引）
ANALYZE quota_trackings;
ANALYZE scheme_rewards;
ANALYZE card_schemes;
ANALYZE transactions;
ANALYZE scheme_channel_applications;
ANALYZE payment_channel_applications;
ANALYZE payment_scheme_links;

