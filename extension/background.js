// background.js - Централизованная система авторизации

const CONFIG = {
  API_BASE: "http://127.0.0.1:8000",
  TARGET_URL: "https://mangabuff.ru/",
  STORAGE_KEYS: {
    TOKEN: "mbf_token",
    AUTH_META: "mbf_auth_meta",
    HEALTH_CACHE: "mbf_health_cache"
  },
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  AUTH_THROTTLE_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours
  REQUIRED_COOKIES: ["theme", "__ddg9_", "mangabuff_session", "XSRF-TOKEN"],
  REMEMBER_WEB_PREFIX: "remember_web"
};

const PendingUserStatusRequests = new Map();

// Система логирования
const Logger = {
  info: (msg, data = null) => console.log(`🔧 [BG] ${msg}`, data || ''),
  warn: (msg, data = null) => console.warn(`⚠️ [BG] ${msg}`, data || ''),
  error: (msg, data = null) => console.error(`❌ [BG] ${msg}`, data || ''),
  success: (msg, data = null) => console.log(`✅ [BG] ${msg}`, data || ''),
  debug: (msg, data = null) => console.log(`🔍 [BG] ${msg}`, data || '')
};

// Централизованный кэш
class Cache {
  static data = new Map();
  
  static set(key, value, ttl = CONFIG.CACHE_DURATION) {
    const expiry = Date.now() + ttl;
    this.data.set(key, { value, expiry });
  }
  
  static get(key) {
    const item = this.data.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.data.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  static clear() {
    this.data.clear();
  }
}

// Управление хранилищем
class StorageManager {
  static cache = new Map();
  
  static async get(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    return new Promise(resolve => {
      chrome.storage.local.get(key, data => {
        const value = data[key] || null;
        this.cache.set(key, value);
        resolve(value);
      });
    });
  }

  static async remove(key) {
    this.cache.delete(key);
    return new Promise(resolve => {
      chrome.storage.local.remove(key, resolve);
    });
  }
  
  static async set(key, value) {
    this.cache.set(key, value);
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
  
  static invalidate(key) {
    this.cache.delete(key);
  }
  
  static clearCache() {
    this.cache.clear();
  }
}

// API клиент
class ApiClient {
  static async makeRequest(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const defaultOptions = {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000,
      ...options
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), defaultOptions.timeout);
    
    try {
      const response = await fetch(url, {
        ...defaultOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${defaultOptions.timeout}ms`);
      }
      
      Logger.error(`Request to ${endpoint} failed:`, error.message);
      throw error;
    }
  }

  static async checkHealth() {
    const cacheKey = 'health_check';
    const cached = Cache.get(cacheKey);
    
    if (cached) {
      Logger.debug("Using cached health data");
      return cached;
    }

    Logger.info("Checking API health");
    
    try {
      const data = await this.makeRequest('/health', { timeout: 10000 });
      Logger.success("API health check passed:", data.status);
      
      // Кэшируем результат
      Cache.set(cacheKey, data, 60000); // 1 minute
      
      // Сохраняем категории в storage
      if (data.category) {
        await StorageManager.set(CONFIG.STORAGE_KEYS.HEALTH_CACHE, {
          category: data.category,
          timestamp: Date.now()
        });
      }
      
      return data;
    } catch (error) {
      const errorResponse = { status: "unhealthy", error: error.message };
      Cache.set(cacheKey, errorResponse, 30000); // Cache errors for 30s
      return errorResponse;
    }
  }

  static async sendAuthData(cookieData, csrfToken) {
    Logger.info("Sending authentication data to API");
    
    return this.makeRequest('/set_http_data', {
      method: 'POST',
      body: JSON.stringify({ 
        cookie: cookieData, 
        csrf_token: csrfToken 
      })
    });
  }
}

// Управление куки
class CookieManager {
  static async getRequiredCookies() {
    const cacheKey = 'required_cookies';
    const cached = Cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    Logger.debug("Fetching required cookies");
    
    const result = {};
    const promises = CONFIG.REQUIRED_COOKIES.map(name =>
      new Promise(resolve => {
        chrome.cookies.get({ url: CONFIG.TARGET_URL, name }, cookie => {
          if (cookie?.value) {
            result[name] = cookie.value;
          }
          resolve();
        });
      })
    );
    
    await Promise.all(promises);
    
    // Кэшируем на 30 секунд
    Cache.set(cacheKey, result, 30000);
    
    Logger.debug(`Collected ${Object.keys(result).length} required cookies`);
    return result;
  }

  static async getRememberWebCookies() {
    const cacheKey = 'remember_cookies';
    const cached = Cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const allCookies = await new Promise(resolve => {
        chrome.cookies.getAll({ url: CONFIG.TARGET_URL }, resolve);
      });
      
      const result = allCookies
        .filter(cookie => cookie.name.startsWith(CONFIG.REMEMBER_WEB_PREFIX))
        .reduce((acc, cookie) => {
          acc[cookie.name] = cookie.value;
          return acc;
        }, {});
      
      // Кэшируем на 30 секунд
      Cache.set(cacheKey, result, 30000);
      
      Logger.debug(`Collected ${Object.keys(result).length} remember_web cookies`);
      return result;
    } catch (error) {
      Logger.error("Failed to get remember_web cookies:", error.message);
      return {};
    }
  }

  static async getAllRelevantCookies() {
    const [required, remember] = await Promise.all([
      this.getRequiredCookies(),
      this.getRememberWebCookies()
    ]);
    
    const result = { ...required, ...remember };
    Logger.success(`Total cookies collected: ${Object.keys(result).length}`);
    return result;
  }
}

// Централизованный менеджер авторизации
class AuthManager {
  static pendingAuthRequest = null;
  
  static async getAuthMeta() {
    const meta = await StorageManager.get(CONFIG.STORAGE_KEYS.AUTH_META);
    return meta || { 
      lastTime: 0, 
      lastUser: null, 
      lastCsrf: null,
      lastAttempt: 0,
      failureCount: 0
    };
  }

  static async setAuthMeta(meta) {
    await StorageManager.set(CONFIG.STORAGE_KEYS.AUTH_META, meta);
  }

  static async getToken() {
    return await StorageManager.get(CONFIG.STORAGE_KEYS.TOKEN);
  }

  static async setToken(token) {
    if (token) {
      await StorageManager.set(CONFIG.STORAGE_KEYS.TOKEN, token);
      Logger.success("Token saved successfully");
    }
  }

  static shouldPerformAuth(token, meta, currentUser, currentCsrf) {
    const now = Date.now();
    
    // Базовые проверки
    if (!token) {
      return { shouldAuth: true, reason: "no_token" };
    }
    
    if (!currentCsrf) {
      return { shouldAuth: false, reason: "no_csrf" };
    }
    
    if (!currentUser) {
      return { shouldAuth: false, reason: "no_user" };
    }
    
    // Проверка изменений
    if (currentUser !== meta.lastUser) {
      return { shouldAuth: true, reason: "user_changed" };
    }
    
    if (currentCsrf !== meta.lastCsrf) {
      return { shouldAuth: true, reason: "csrf_changed" };
    }
    
    // Проверка времени (throttling)
    const timeElapsed = now - meta.lastTime;
    if (timeElapsed > CONFIG.AUTH_THROTTLE_INTERVAL) {
      return { shouldAuth: true, reason: "time_elapsed" };
    }
    
    // Проверка на повторные неудачи
    if (meta.failureCount > 0 && (now - meta.lastAttempt) > 30000) {
      return { shouldAuth: true, reason: "retry_after_failure" };
    }
    
    return { shouldAuth: false, reason: "throttled" };
  }

  static async performAuthentication(authData) {
    const { currentUser, csrfToken } = authData;
    
    // Предотвращаем дублирующие запросы
    if (this.pendingAuthRequest) {
      Logger.debug("Auth request already in progress, waiting...");
      return this.pendingAuthRequest;
    }
    
    this.pendingAuthRequest = this._executeAuth(currentUser, csrfToken);
    
    try {
      const result = await this.pendingAuthRequest;
      return result;
    } finally {
      this.pendingAuthRequest = null;
    }
  }

  static async _executeAuth(currentUser, csrfToken) {
    const startTime = Date.now();
    let authMeta = await this.getAuthMeta();
    
    try {
      Logger.info(`Starting authentication for user: ${currentUser}`);
      
      // 1. Проверяем здоровье API
      const healthCheck = await ApiClient.checkHealth();
      if (healthCheck.status !== 'healthy') {
        throw new Error(`API unhealthy: ${healthCheck.error || 'Unknown error'}`);
      }
      
      // 2. Получаем куки
      const cookies = await CookieManager.getAllRelevantCookies();
      if (Object.keys(cookies).length === 0) {
        throw new Error("No cookies found");
      }
      
      // 3. Отправляем данные авторизации
      const response = await ApiClient.sendAuthData(cookies, csrfToken);
      
      if (!response || typeof response !== 'object') {
        throw new Error("Invalid API response");
      }
      
      // 4. Сохраняем токен если получен
      if (response.token) {
        await this.setToken(response.token);
        Logger.success("New token received and saved");
      }
      
      // 5. Обновляем метаданные при успехе
      authMeta = {
        lastTime: Date.now(),
        lastUser: currentUser,
        lastCsrf: csrfToken,
        lastAttempt: startTime,
        failureCount: 0
      };
      
      await this.setAuthMeta(authMeta);
      
      Logger.success(`Authentication completed successfully in ${Date.now() - startTime}ms`);
      
      return {
        success: true,
        token: response.token,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      Logger.error("Authentication failed:", error.message);
      
      // Обновляем метаданные при ошибке
      authMeta.lastAttempt = startTime;
      authMeta.failureCount = (authMeta.failureCount || 0) + 1;
      
      await this.setAuthMeta(authMeta);
      
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Главный метод для обработки авторизации
  static async handleAuthRequest(authData) {
    try {
      const { currentUser, csrfToken } = authData;
      
      if (!currentUser || !csrfToken) {
        return {
          success: false,
          error: "Missing required auth data",
          shouldAuth: false
        };
      }
      
      const token = await this.getToken();
      const meta = await this.getAuthMeta();
      
      const { shouldAuth, reason } = this.shouldPerformAuth(
        token, 
        meta, 
        currentUser, 
        csrfToken
      );
      
      if (!shouldAuth) {
        Logger.info(`Authentication skipped: ${reason}`);
        return {
          success: true,
          shouldAuth: false,
          reason,
          token
        };
      }
      
      Logger.info(`Performing authentication: ${reason}`);
      const result = await this.performAuthentication(authData);
      
      return {
        ...result,
        shouldAuth: true,
        reason
      };
      
    } catch (error) {
      Logger.error("Auth request handling failed:", error.message);
      return {
        success: false,
        error: error.message,
        shouldAuth: false
      };
    }
  }

  // Получить статус авторизации
  static async getAuthStatus() {
    const token = await this.getToken();
    const meta = await this.getAuthMeta();
    
    return {
      hasToken: !!token,
      lastAuthTime: meta.lastTime,
      lastUser: meta.lastUser,
      failureCount: meta.failureCount || 0,
      isHealthy: (await ApiClient.checkHealth()).status === 'healthy'
    };
  }

  // Принудительная переавторизация
  static async forceReauth(authData) {
    Logger.info("Forcing re-authentication");
    
    // Сбрасываем метаданные для принудительной авторизации
    await this.setAuthMeta({
      lastTime: 0,
      lastUser: null,
      lastCsrf: null,
      lastAttempt: 0,
      failureCount: 0
    });
    
    // Очищаем кэши
    Cache.clear();
    StorageManager.invalidate(CONFIG.STORAGE_KEYS.TOKEN);
    
    return this.handleAuthRequest(authData);
  }
}

// Обработчики сообщений
const MessageHandlers = {
  // Основной обработчик авторизации
  async HANDLE_AUTH(msg, sender, sendResponse) {
    try {
      const result = await AuthManager.handleAuthRequest(msg.data);
      sendResponse(result);
    } catch (error) {
      Logger.error("HANDLE_AUTH failed:", error.message);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  },

  // Получить статус авторизации
  async GET_AUTH_STATUS(msg, sender, sendResponse) {
    try {
      const status = await AuthManager.getAuthStatus();
      sendResponse({ success: true, status });
    } catch (error) {
      Logger.error("GET_AUTH_STATUS failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  },

  // Принудительная переавторизация
  async FORCE_REAUTH(msg, sender, sendResponse) {
    try {
      const result = await AuthManager.forceReauth(msg.data);
      sendResponse(result);
    } catch (error) {
      Logger.error("FORCE_REAUTH failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  },

  async CLEAR_TOKEN(msg, sender, sendResponse) {
    await StorageManager.remove(CONFIG.STORAGE_KEYS.TOKEN);
    chrome.storage.local.get(null, data => Logger.info("Storage after CLEAR_TOKEN:", data));
    Logger.info("Auth token fully removed by content script");
    sendResponse && sendResponse({ success: true });
  },

  // Получить токен
  async GET_TOKEN(msg, sender, sendResponse) {
    try {
      const token = await AuthManager.getToken();
      sendResponse({ token });
    } catch (error) {
      Logger.error("GET_TOKEN failed:", error.message);
      sendResponse({ token: null });
    }
  },

  async SET_USER_STATUS(msg, sender, sendResponse) {
    try {
      Logger.info("SET_USER_STATUS called with data:", msg.data); // Логируем входящие данные

      const { user_id, category } = msg.data;
      if (!user_id || !category) {
        throw new Error("Missing required parameters");
      }

      const token = await AuthManager.getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      const response = await ApiClient.makeRequest('/set_user_status', {
        method: 'POST',
        body: JSON.stringify({ token, user_id, category }),
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      sendResponse({ success: true, data: response });
    } catch (error) {
      Logger.error("SET_USER_STATUS failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  },

  // Получить куки (для обратной совместимости)
  async GET_COOKIES(msg, sender, sendResponse) {
    try {
      const cookies = await CookieManager.getAllRelevantCookies();
      sendResponse(cookies);
    } catch (error) {
      Logger.error("GET_COOKIES failed:", error.message);
      sendResponse({});
    }
  },

  // Проверка здоровья API
  async CHECK_HEALTH(msg, sender, sendResponse) {
    try {
      const data = await ApiClient.checkHealth();
      sendResponse({ 
        healthy: data.status === 'healthy', 
        data 
      });
    } catch (error) {
      Logger.error("CHECK_HEALTH failed:", error.message);
      sendResponse({ 
        healthy: false, 
        data: { status: 'unhealthy', error: error.message } 
      });
    }
  },

  // Получить категорию из кэша здоровья
  async GET_HEALTH_CATEGORY(msg, sender, sendResponse) {
    try {
      const cached = await StorageManager.get(CONFIG.STORAGE_KEYS.HEALTH_CACHE);
      
      if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
        sendResponse(cached.category || {}); // Возвращаем объект категорий напрямую
        return;
      }

      const data = await ApiClient.checkHealth();
      sendResponse(data.category || {}); // Возвращаем объект категорий напрямую
    } catch (error) {
      Logger.error("GET_HEALTH_CATEGORY failed:", error.message);
      sendResponse({});
    }
  },

  // Остальные обработчики (для совместимости)
  async FETCH_USERS_CARD_STATUS(msg, sender, sendResponse) {
    try {
      const { token, card_id, users } = msg.data;
      if (!token || !card_id || !Array.isArray(users) || users.length === 0) {
        throw new Error("Invalid input parameters");
      }

      // Ключ для кэширования промиса
      const key = `${card_id}:${users.map(u => u.user_id || u).sort().join(',')}`;

      // Если уже есть промис — ждем его
      if (PendingUserStatusRequests.has(key)) {
        Logger.debug("Using pending FETCH_USERS_CARD_STATUS promise from background");
        PendingUserStatusRequests.get(key)
          .then(data => sendResponse({ success: true, data }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return;
      }

      // Новый промис
      const promise = (async () => {
        const data = await ApiClient.makeRequest('/users_card_status', {
          method: 'POST',
          body: JSON.stringify({ token, card_id, users }),
          timeout: 120000
        });
        return data;
      })();

      PendingUserStatusRequests.set(key, promise);

      promise
        .then(data => {
          PendingUserStatusRequests.delete(key);
          sendResponse({ success: true, data });
        })
        .catch(error => {
          PendingUserStatusRequests.delete(key);
          Logger.error("FETCH_USERS_CARD_STATUS failed:", error.message);
          sendResponse({ success: false, error: error.message });
        });

    } catch (error) {
      Logger.error("FETCH_USERS_CARD_STATUS failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  },

  async FETCH_USERS_BY_CATEGORY(msg, sender, sendResponse) {
    try {
      const { category, card_id, page } = msg.data;

      if (!category || !card_id) {
        throw new Error("Missing required parameters");
      }

      const token = await AuthManager.getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      const data = await ApiClient.makeRequest(
        `/get_cards_by_category?token=${encodeURIComponent(token)}&category=${encodeURIComponent(category)}&card_id=${encodeURIComponent(card_id)}&page=${page || 0}`
      );

      sendResponse({ success: true, data });
    } catch (error) {
      Logger.error("FETCH_USERS_BY_CATEGORY failed:", error.message);
      sendResponse({ success: false, error: error.message });
    }
  }
};

// Главный обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MessageHandlers[message.type];
  
  if (!handler) {
    Logger.warn("Unknown message type:", message.type);
    sendResponse({ error: "Unknown message type" });
    return false;
  }

  // Все обработчики асинхронные
  handler(message, sender, sendResponse).catch(error => {
    Logger.error(`Handler ${message.type} failed:`, error.message);
    sendResponse({ success: false, error: error.message });
  });
  
  return true; // Указываем, что ответ будет асинхронным
});

// Очистка при старте
chrome.runtime.onStartup.addListener(() => {
  Logger.info("Extension startup - clearing caches");
  Cache.clear();
  StorageManager.clearCache();
});

// Периодическая очистка кэша
setInterval(() => {
  Logger.debug("Periodic cache cleanup");
  Cache.clear();
}, 10 * 60 * 1000); // Каждые 10 минут

// Обработка ошибок на уровне service worker
self.addEventListener('error', (event) => {
  Logger.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  Logger.error('Unhandled promise rejection:', event.reason);
});

Logger.success("Centralized Auth Background Script initialized");