-- 新增額度計算方式欄位：單筆回饋/帳單總額
-- 用於決定在扣除額度時，是採用每筆消費過後的計算方式（四捨五入等）還是總消費金額的計算方式

-- 為 scheme_rewards 表新增 quota_calculation_mode 欄位
ALTER TABLE scheme_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_mode VARCHAR(20) DEFAULT 'per_transaction' 
CHECK (quota_calculation_mode IN ('per_transaction', 'total_amount'));
-- per_transaction: 單筆回饋（每筆消費過後的計算方式）
-- total_amount: 帳單總額（總消費金額的計算方式）

-- 為 payment_rewards 表新增 quota_calculation_mode 欄位
ALTER TABLE payment_rewards 
ADD COLUMN IF NOT EXISTS quota_calculation_mode VARCHAR(20) DEFAULT 'per_transaction' 
CHECK (quota_calculation_mode IN ('per_transaction', 'total_amount'));

-- 添加註釋
COMMENT ON COLUMN scheme_rewards.quota_calculation_mode IS '額度計算方式：per_transaction=單筆回饋（每筆消費過後的計算方式），total_amount=帳單總額（總消費金額的計算方式）';
COMMENT ON COLUMN payment_rewards.quota_calculation_mode IS '額度計算方式：per_transaction=單筆回饋（每筆消費過後的計算方式），total_amount=帳單總額（總消費金額的計算方式）';

