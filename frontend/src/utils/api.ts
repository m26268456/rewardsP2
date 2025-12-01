import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

// 在開發環境中使用代理，生產環境使用完整 URL
const getBaseURL = () => {
  // 在瀏覽器中運行時
  if (typeof window !== 'undefined') {
    // 檢查是否在 Capacitor 環境中（手機應用程式）
    const isCapacitor = (window as any).Capacitor?.isNativePlatform();
    
    // 如果設定了 VITE_API_URL，使用它（生產環境）
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      // 如果已經包含 /api，直接使用
      if (envUrl.includes('/api')) {
        return envUrl;
      }
      // 否則添加 /api
      return `${envUrl}/api`;
    }
    
    // 在 Capacitor 環境中，必須使用完整 URL
    if (isCapacitor) {
      // 使用生產環境的後端 URL
      return 'https://backend-production-abe5.up.railway.app/api';
    }
    
    // 開發環境使用相對路徑（會通過 Vite 代理）
    return '/api';
  }
  
  // 服務端渲染時使用環境變數
  if (!import.meta.env.VITE_API_URL) {
    return '/api';
  }
  
  const envUrl = import.meta.env.VITE_API_URL;
  // 如果已經包含 /api，直接使用
  if (envUrl.includes('/api')) {
    return envUrl;
  }
  // 否則添加 /api
  return `${envUrl}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 秒超時
});

// 請求攔截器：添加統一的錯誤處理
api.interceptors.request.use(
  (config) => {
    // 可以在這裡添加 token 等認證資訊
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 響應攔截器：統一處理錯誤
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // 統一處理成功響應
    return response;
  },
  (error: AxiosError) => {
    // 統一處理錯誤響應
    if (error.response) {
      // 伺服器返回了錯誤狀態碼
      const status = error.response.status;
      const data = error.response.data as any;
      
      // 根據錯誤類型提供更友好的錯誤訊息
      if (status === 400) {
        console.error('請求錯誤:', data?.error || '輸入資料格式錯誤');
      } else if (status === 401) {
        console.error('未授權:', '請重新登入');
      } else if (status === 403) {
        console.error('禁止訪問:', '您沒有權限執行此操作');
      } else if (status === 404) {
        console.error('資源不存在:', data?.error || '請求的資源不存在');
      } else if (status === 429) {
        console.error('請求過於頻繁:', '請稍後再試');
      } else if (status >= 500) {
        console.error('伺服器錯誤:', data?.error || '伺服器發生錯誤，請稍後再試');
      }
    } else if (error.request) {
      // 請求已發出但沒有收到響應
      console.error('網路錯誤:', '無法連接到伺服器，請檢查網路連接');
    } else {
      // 發送請求時出了問題
      console.error('請求錯誤:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default api;

