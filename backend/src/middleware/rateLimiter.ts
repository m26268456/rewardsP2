import rateLimit from 'express-rate-limit';

/**
 * API 速率限制
 * 防止濫用和 DDoS 攻擊
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 限制每個 IP 100 次請求
  message: {
    success: false,
    error: {
      message: '請求過於頻繁，請稍後再試',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true, // 返回標準的 RateLimit-* headers
  legacyHeaders: false, // 禁用 X-RateLimit-* headers
  // 信任代理（Railway 使用代理）
  trustProxy: true,
  // 自定義 key 生成器，正確處理 X-Forwarded-For
  keyGenerator: (req) => {
    // 如果使用代理，從 X-Forwarded-For 獲取真實 IP
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      // X-Forwarded-For 可能包含多個 IP，取第一個
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim() || req.ip;
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

/**
 * 嚴格速率限制（用於敏感操作）
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 20, // 限制每個 IP 20 次請求
  message: {
    success: false,
    error: {
      message: '操作過於頻繁，請稍後再試',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

