import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// 確保 DATABASE_URL 正確
// Railway 會自動提供 DATABASE_URL 環境變數，優先使用它
// 如果沒有設定環境變數，根據運行環境自動選擇主機名
let databaseUrl = process.env.DATABASE_URL;

// 檢查 Railway 環境變數（Railway 會自動設定這些）
const isRailway = !!(
  process.env.RAILWAY_ENVIRONMENT || 
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_NAME
);

const isDocker = process.env.DOCKER_ENV === 'true' || process.env.DATABASE_URL?.includes('@postgres:');

// 記錄環境資訊
console.log('🔍 環境檢測:', {
  hasDatabaseUrl: !!databaseUrl,
  isRailway,
  isDocker,
  railwayEnv: process.env.RAILWAY_ENVIRONMENT,
  railwayProject: process.env.RAILWAY_PROJECT_ID,
  railwayService: process.env.RAILWAY_SERVICE_NAME,
});

if (!databaseUrl) {
  // 檢測是否在 Docker 環境中
  // 在本地開發環境使用 localhost:5433，在 Docker 環境使用 postgres:5432
  const dbHost = isDocker ? 'postgres' : 'localhost';
  const dbPort = isDocker ? '5432' : '5433'; // Docker 內部用 5432，本地映射到 5433
  databaseUrl = `postgresql://rewards_user:rewards_password@${dbHost}:${dbPort}/rewards_db`;
  console.log('⚠️  未設定 DATABASE_URL，使用預設連接字串');
} else {
  // Railway 環境：直接使用提供的 DATABASE_URL，不需要修改
  if (isRailway) {
    console.log('✅ 使用 Railway 提供的 DATABASE_URL');
  }
  
  // 確保連接字串使用 postgresql:// 協議（Railway 可能使用 postgres://）
  if (databaseUrl.startsWith('postgres://')) {
    databaseUrl = databaseUrl.replace('postgres://', 'postgresql://');
    console.log('✅ 已將 postgres:// 轉換為 postgresql://');
  }
  
  // 如果設定了 DATABASE_URL，但主機名是 postgres 且不在 Docker 環境，嘗試替換為 localhost
  else if (databaseUrl.includes('@postgres:') && !isDocker && !isRailway) {
    // 替換 postgres:5432 為 localhost:5433
    databaseUrl = databaseUrl.replace('@postgres:5432', '@localhost:5433');
    console.warn('⚠️  已將資料庫主機從 postgres:5432 改為 localhost:5433（本地開發環境）');
  }
}

// 確保數據庫名稱正確（不應該是 rewards_user，但用戶名應該是 rewards_user）
// 只替換最後的數據庫名稱部分，不替換用戶名
if (databaseUrl.match(/\/rewards_user$/)) {
  databaseUrl = databaseUrl.replace(/\/rewards_user$/, '/rewards_db');
  console.warn('⚠️  修正了數據庫名稱從 rewards_user 到 rewards_db');
}

// 解析連接字串以驗證格式
try {
  const url = new URL(databaseUrl);
  console.log('📊 資料庫連接資訊:', {
    protocol: url.protocol,
    host: url.hostname,
    port: url.port || '5432 (預設)',
    database: url.pathname.replace('/', '') || '未設定',
    user: url.username || '未設定',
    hasPassword: !!url.password,
    passwordLength: url.password ? url.password.length : 0,
    isRailway: !!isRailway,
  });
  console.log('📊 完整連接字串（隱藏密碼）:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
  
  // 驗證必要資訊
  if (!url.username) {
    console.error('❌ 警告：DATABASE_URL 中沒有用戶名');
  }
  if (!url.password) {
    console.error('❌ 警告：DATABASE_URL 中沒有密碼');
  }
  if (!url.pathname || url.pathname === '/') {
    console.error('❌ 警告：DATABASE_URL 中沒有資料庫名稱');
  }
} catch (error) {
  console.error('❌ DATABASE_URL 格式錯誤:', error);
  console.error('📊 DATABASE_URL 原始值（前50字符）:', databaseUrl?.substring(0, 50));
  throw new Error('DATABASE_URL 格式不正確，請檢查環境變數設定');
}

/**
 * 優化的資料庫連接池配置
 * 改進：
 * 1. 根據環境調整連接池大小
 * 2. 添加查詢超時設定
 * 3. 改進錯誤處理
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  // 根據環境調整連接池大小
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // 最大連接數
  min: parseInt(process.env.DB_POOL_MIN || '2', 10), // 最小連接數
  idleTimeoutMillis: 30000, // 空閒連接超時（30秒）
  connectionTimeoutMillis: 10000, // 連接超時（10秒）
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // SQL 語句超時（30秒）
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10), // 查詢超時（30秒）
  // 連接池配置
  allowExitOnIdle: false, // 不允許在空閒時退出
});

// 測試資料庫連線
pool.on('connect', (client) => {
  console.log('✅ 資料庫連線成功');
});

pool.on('error', (err) => {
  console.error('❌ 資料庫連線錯誤:', {
    message: err.message,
    code: (err as any).code,
    detail: (err as any).detail,
    hint: (err as any).hint,
    position: (err as any).position,
  });
  // 在生產環境中，可以考慮發送警報
  if (process.env.NODE_ENV === 'production') {
    // 這裡可以添加日誌服務或警報系統
    console.error('生產環境資料庫錯誤，請檢查資料庫服務狀態');
  }
});

// 在啟動時測試資料庫連接
(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log('✅ 資料庫連接測試成功:', {
      currentTime: result.rows[0].current_time,
      databaseName: result.rows[0].db_name,
    });
    client.release();
  } catch (error: any) {
    console.error('❌ 資料庫連接測試失敗:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    console.error('💡 請檢查：');
    console.error('   1. DATABASE_URL 環境變數是否正確設定');
    console.error('   2. 資料庫服務是否正在運行');
    console.error('   3. 資料庫用戶名和密碼是否正確');
    console.error('   4. 資料庫名稱是否存在');
    // 不拋出錯誤，讓應用程式繼續啟動（連接池會在需要時重試）
  }
})();

// 優雅關閉連接池
process.on('SIGTERM', async () => {
  console.log('正在關閉資料庫連接池...');
  await pool.end();
  console.log('資料庫連接池已關閉');
});

process.on('SIGINT', async () => {
  console.log('正在關閉資料庫連接池...');
  await pool.end();
  console.log('資料庫連接池已關閉');
  process.exit(0);
});

