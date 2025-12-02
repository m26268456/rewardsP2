import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { startQuotaRefreshScheduler } from './services/quotaRefreshScheduler';

// 路由
import cardsRouter from './routes/cards';
import schemesRouter from './routes/schemes';
import paymentMethodsRouter from './routes/paymentMethods';
import channelsRouter from './routes/channels';
import transactionsRouter from './routes/transactions';
import quotaRouter from './routes/quota';
import calculationRouter from './routes/calculation';
import settingsRouter from './routes/settings';
import seedRouter from './routes/seed';
import importDataRouter from './routes/importData';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS 配置（改進安全性）
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*', // 生產環境應該設定具體的來源
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// 信任代理（Railway 和其他雲端平台使用代理）
// 這對於正確處理 X-Forwarded-For header 很重要
app.set('trust proxy', true);

// 中間件
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // 限制請求體大小
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 速率限制（保護 API）
app.use('/api/', apiLimiter);

// 根路徑
app.get('/', (req, res) => {
  res.json({
    message: 'Rewards API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      cards: '/api/cards',
      schemes: '/api/schemes',
      paymentMethods: '/api/payment-methods',
      channels: '/api/channels',
      transactions: '/api/transactions',
      quota: '/api/quota',
      calculation: '/api/calculation',
      settings: '/api/settings',
      seed: '/api/seed',
    },
  });
});

// 健康檢查
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// API 路由
app.use('/api/cards', cardsRouter);
app.use('/api/schemes', schemesRouter);
app.use('/api/payment-methods', paymentMethodsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/quota', quotaRouter);
app.use('/api/calculation', calculationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/seed', seedRouter);
app.use('/api/import', importDataRouter);

// 錯誤處理（必須放在最後）
app.use(errorHandler);

// 啟動伺服器
// Railway 和其他雲端平台需要監聽 0.0.0.0 而不是 localhost
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 後端服務運行於 http://${HOST}:${PORT}`);
  console.log(`📝 環境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 CORS 來源: ${corsOptions.origin === '*' ? '所有來源' : corsOptions.origin}`);

  // 啟動額度刷新定時任務
  startQuotaRefreshScheduler();
});

// 處理端口佔用錯誤
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被佔用，請關閉佔用該端口的進程或更改 PORT 環境變數`);
    console.error(`💡 提示：可以使用以下命令查看佔用端口的進程：`);
    console.error(`   netstat -ano | findstr :${PORT}`);
    console.error(`   然後使用 taskkill /F /PID <進程ID> 關閉進程`);
    process.exit(1);
  } else {
    console.error('❌ 伺服器啟動錯誤:', error);
    process.exit(1);
  }
});

// 優雅關閉
process.on('SIGTERM', async () => {
  console.log('SIGTERM 信號 received: 關閉 HTTP 伺服器');
  server.close(() => {
    console.log('HTTP 伺服器已關閉');
  });
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT 信號 received: 關閉 HTTP 伺服器');
  server.close(() => {
    console.log('HTTP 伺服器已關閉');
  });
  await pool.end();
  process.exit(0);
});

