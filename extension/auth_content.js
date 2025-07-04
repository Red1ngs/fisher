;(async function () {
  console.log("🔑 Lightweight auth_content.js loaded");

  const CONFIG = {
    SELECTORS: {
      CSRF_TOKEN: 'meta[name="csrf-token"]',
      USER_PROFILE: ".header__item.header-profile.dropdown__trigger",
      USER_AVATAR: "img"
    },
    THROTTLE_DELAY: 100,
    DOM_CACHE_TTL: 5000
  };

  // Минимальная система логирования
  const Logger = {
    info: (msg, data = null) => console.log(`🔑 ${msg}`, data || ''),
    warn: (msg, data = null) => console.warn(`⚠️ ${msg}`, data || ''),
    error: (msg, data = null) => console.error(`❌ ${msg}`, data || ''),
    success: (msg, data = null) => console.log(`✅ ${msg}`, data || ''),
    debug: (msg, data = null) => console.log(`🔍 ${msg}`, data || '')
  };

  // Упрощенный DOM Helper с минимальным кэшированием
  class DOMHelper {
    static _cache = new Map();
    
    static isAuthenticated() {
      return document.body.classList.contains("isAuth");
    }

    static getCsrfToken() {
      const key = 'csrf';
      const cached = this._cache.get(key);
      
      if (cached && Date.now() - cached.timestamp < CONFIG.DOM_CACHE_TTL) {
        return cached.value;
      }
      
      const meta = document.querySelector(CONFIG.SELECTORS.CSRF_TOKEN);
      const token = meta?.content || null;
      
      this._cache.set(key, { value: token, timestamp: Date.now() });
      return token;
    }

    static getCurrentUserName() {
      const key = 'username';
      const cached = this._cache.get(key);
      
      if (cached && Date.now() - cached.timestamp < CONFIG.DOM_CACHE_TTL) {
        return cached.value;
      }
      
      const container = document.querySelector(CONFIG.SELECTORS.USER_PROFILE);
      const img = container?.querySelector(CONFIG.SELECTORS.USER_AVATAR);
      const username = img?.alt?.trim() || null;
      
      this._cache.set(key, { value: username, timestamp: Date.now() });
      return username;
    }

    static getUserProfileElement() {
      return document.querySelector(CONFIG.SELECTORS.USER_PROFILE);
    }

    static clearCache() {
      this._cache.clear();
    }
  }

  // Упрощенный менеджер авторизации - делегирует всё в background
  class AuthManager {
    static async processAuthentication() {
      try {
        if (!DOMHelper.isAuthenticated()) {
          Logger.info("User not authenticated — skipping");
          return;
        }

        const csrfToken = DOMHelper.getCsrfToken();
        const currentUser = DOMHelper.getCurrentUserName();

        if (!csrfToken || !currentUser) {
          Logger.warn("Missing CSRF token or user info");
          return;
        }

        Logger.info("Sending auth request to background");

        // Отправляем всё в background script
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: "HANDLE_AUTH",
            data: {
              currentUser,
              csrfToken
            }
          }, resolve);
        });

        if (response?.success) {
          if (response.shouldAuth) {
            Logger.success(`Authentication completed: ${response.reason}`);
            if (response.token) {
              Logger.success("Token received");
            }
          } else {
            Logger.info(`Authentication skipped: ${response.reason}`);
          }
        } else {
          Logger.error("Authentication failed:", response?.error || "Unknown error");
        }

      } catch (error) {
        Logger.error("Authentication process failed:", error.message);
      }
    }
  }

  // Упрощенный наблюдатель DOM
  class DOMObserver {
    static observer = null;
    static throttleTimer = null;
    
    static setupUserProfileObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }
      
      const element = DOMHelper.getUserProfileElement();
      if (!element) {
        Logger.warn("User profile element not found");
        return;
      }

      this.observer = new MutationObserver(() => {
        if (this.throttleTimer) {
          clearTimeout(this.throttleTimer);
        }
        
        this.throttleTimer = setTimeout(() => {
          Logger.info("User profile changed, clearing cache");
          DOMHelper.clearCache();
          AuthManager.processAuthentication();
        }, CONFIG.THROTTLE_DELAY);
      });

      this.observer.observe(element, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['alt', 'src']
      });
      
      Logger.success("DOM observer setup completed");
    }
    
    static disconnect() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.throttleTimer) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
      }
    }
  }

  // Главная функция инициализации (максимально упрощена)
  async function initialize() {
    try {
      if (!DOMHelper.isAuthenticated()) {
        Logger.info("Page has no 'isAuth' class — skipping script entirely");
        chrome.runtime.sendMessage({ type: "CLEAR_TOKEN" });
        return;
      }

      Logger.info("Starting lightweight authentication initialization");

      // Запускаем процессы
      await AuthManager.processAuthentication();
      DOMObserver.setupUserProfileObserver();

      Logger.success("Lightweight authentication system initialized");
    } catch (error) {
      Logger.error("Initialization failed:", error.message);
    }
  }

  // Очистка при выгрузке страницы
  window.addEventListener('beforeunload', () => {
    DOMObserver.disconnect();
    DOMHelper.clearCache();
  });

  // Обработка сообщений от background (если необходимо)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'FORCE_AUTH_REFRESH':
        Logger.info("Forced auth refresh requested");
        DOMHelper.clearCache();
        AuthManager.processAuthentication();
        sendResponse({ success: true });
        break;
      
      case 'GET_PAGE_AUTH_INFO':
        sendResponse({
          isAuthenticated: DOMHelper.isAuthenticated(),
          currentUser: DOMHelper.getCurrentUserName(),
          csrfToken: DOMHelper.getCsrfToken()
        });
        break;
        
      default:
        sendResponse({ error: "Unknown message type" });
    }
    
    return false; // Синхронный ответ
  });

  // Запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    await initialize();
  }

})();