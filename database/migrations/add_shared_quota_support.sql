-- ============================================
-- 支援共用額度的資料庫遷移腳本
-- 此腳本會添加共用額度功能，同時保持現有資料的完整性
-- ============================================

-- 1. 創建共用額度組表
-- 這個表用於管理多個方案共用的額度設定
CREATE TABLE IF NOT EXISTS shared_quota_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL, -- 共用額度組名稱，例如："台新狗狗卡共用額度"
    card_id UUID REFERENCES cards(id) ON DELETE CASCADE, -- 所屬卡片（可選，用於組織）
    description TEXT, -- 說明
    quota_limit DECIMAL(12,2), -- 共用額度上限（NULL 表示無上限）
    quota_refresh_type VARCHAR(20) CHECK (quota_refresh_type IN ('monthly', 'date', 'activity')), 
    quota_refresh_value INTEGER, -- 每月幾號
    quota_refresh_date DATE, -- 指定日期刷新
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 創建方案與共用額度組的關聯表
-- 一個方案可以屬於多個共用額度組（用於不同的回饋組成）
CREATE TABLE IF NOT EXISTS scheme_shared_quota_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
    shared_quota_group_id UUID NOT NULL REFERENCES shared_quota_groups(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES scheme_rewards(id) ON DELETE CASCADE,
    -- 表示這個方案的這個回饋組成使用這個共用額度組
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scheme_id, reward_id, shared_quota_group_id)
);

-- 3. 修改 quota_trackings 表，添加 shared_quota_group_id 欄位
-- 當使用共用額度時，額度追蹤會連結到共用額度組
ALTER TABLE quota_trackings 
ADD COLUMN IF NOT EXISTS shared_quota_group_id UUID REFERENCES shared_quota_groups(id) ON DELETE SET NULL;

-- 4. 創建共用額度追蹤表
-- 用於追蹤共用額度組的整體使用情況
CREATE TABLE IF NOT EXISTS shared_quota_trackings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shared_quota_group_id UUID NOT NULL REFERENCES shared_quota_groups(id) ON DELETE CASCADE,
    current_amount DECIMAL(12,2) DEFAULT 0, -- 當前消費金額（所有共用方案的總和）
    used_quota DECIMAL(12,2) DEFAULT 0, -- 已使用額度
    remaining_quota DECIMAL(12,2), -- 剩餘額度（NULL 表示無上限）
    last_refresh_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    next_refresh_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shared_quota_group_id)
);

-- 5. 更新 quota_trackings 的約束
-- 允許三種情況：
-- a) 傳統方式：scheme_id + reward_id（或 payment_method_id + payment_reward_id）
-- b) 共用額度：shared_quota_group_id + reward_id（或 payment_reward_id）
-- 先刪除舊的約束（如果存在）
ALTER TABLE quota_trackings DROP CONSTRAINT IF EXISTS quota_trackings_unique_check;

-- 添加新的約束
ALTER TABLE quota_trackings 
ADD CONSTRAINT quota_trackings_unique_check CHECK (
  -- 傳統方式：卡片方案
  (scheme_id IS NOT NULL AND reward_id IS NOT NULL AND shared_quota_group_id IS NULL) OR
  -- 傳統方式：純支付方式
  (payment_method_id IS NOT NULL AND payment_reward_id IS NOT NULL AND scheme_id IS NULL AND shared_quota_group_id IS NULL) OR
  -- 共用額度：卡片方案
  (shared_quota_group_id IS NOT NULL AND reward_id IS NOT NULL) OR
  -- 共用額度：支付方式（未來擴展）
  (shared_quota_group_id IS NOT NULL AND payment_reward_id IS NOT NULL)
);

-- 6. 創建索引
CREATE INDEX IF NOT EXISTS idx_shared_quota_groups_card_id ON shared_quota_groups(card_id);
CREATE INDEX IF NOT EXISTS idx_scheme_shared_quota_links_scheme ON scheme_shared_quota_links(scheme_id);
CREATE INDEX IF NOT EXISTS idx_scheme_shared_quota_links_group ON scheme_shared_quota_links(shared_quota_group_id);
CREATE INDEX IF NOT EXISTS idx_scheme_shared_quota_links_reward ON scheme_shared_quota_links(reward_id);
CREATE INDEX IF NOT EXISTS idx_quota_trackings_shared_group ON quota_trackings(shared_quota_group_id);
CREATE INDEX IF NOT EXISTS idx_shared_quota_trackings_group ON shared_quota_trackings(shared_quota_group_id);
CREATE INDEX IF NOT EXISTS idx_shared_quota_trackings_refresh ON shared_quota_trackings(next_refresh_at);

-- 7. 添加觸發器
CREATE TRIGGER update_shared_quota_groups_updated_at BEFORE UPDATE ON shared_quota_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_quota_trackings_updated_at BEFORE UPDATE ON shared_quota_trackings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 資料遷移說明
-- 現有的 quota_trackings 記錄不需要遷移，因為它們仍然有效
-- 新的共用額度功能是額外添加的，不會影響現有資料
-- 當用戶創建共用額度組時，系統會：
--   a) 創建 shared_quota_groups 記錄
--   b) 創建 scheme_shared_quota_links 記錄
--   c) 創建 shared_quota_trackings 記錄
--   d) 更新相關的 quota_trackings 記錄，設置 shared_quota_group_id

-- 9. 視圖：方便查詢共用額度資訊
CREATE OR REPLACE VIEW v_shared_quota_info AS
SELECT 
    sqg.id as group_id,
    sqg.name as group_name,
    sqg.card_id,
    c.name as card_name,
    sqg.quota_limit,
    sqg.quota_refresh_type,
    sqg.quota_refresh_value,
    sqg.quota_refresh_date,
    sqt.used_quota,
    sqt.remaining_quota,
    sqt.current_amount,
    sqt.next_refresh_at,
    COUNT(DISTINCT ssql.scheme_id) as linked_scheme_count,
    COUNT(DISTINCT ssql.reward_id) as linked_reward_count
FROM shared_quota_groups sqg
LEFT JOIN cards c ON sqg.card_id = c.id
LEFT JOIN shared_quota_trackings sqt ON sqg.id = sqt.shared_quota_group_id
LEFT JOIN scheme_shared_quota_links ssql ON sqg.id = ssql.shared_quota_group_id
GROUP BY sqg.id, sqg.name, sqg.card_id, c.name, sqg.quota_limit, 
         sqg.quota_refresh_type, sqg.quota_refresh_value, sqg.quota_refresh_date,
         sqt.used_quota, sqt.remaining_quota, sqt.current_amount, sqt.next_refresh_at;

-- 10. 函數：初始化共用額度追蹤
-- 當創建共用額度組時，自動創建對應的追蹤記錄
CREATE OR REPLACE FUNCTION init_shared_quota_tracking()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shared_quota_trackings (
        shared_quota_group_id,
        used_quota,
        remaining_quota,
        current_amount
    ) VALUES (
        NEW.id,
        0,
        NEW.quota_limit,
        0
    )
    ON CONFLICT (shared_quota_group_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER init_shared_quota_tracking_trigger
    AFTER INSERT ON shared_quota_groups
    FOR EACH ROW
    EXECUTE FUNCTION init_shared_quota_tracking();

