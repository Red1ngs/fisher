// integrated_category_badge.js - Version with Badge Placeholders

console.log("🔄 integrated_category_badge.js loaded (placeholder optimized)");

(async function () {
  const CONFIG = {
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    SELECTORS: {
      USER_WRAPPER: ".card-show__owner-wrapper",
      USER_CONTAINER: ".card-show__owners",
      USER_LINKS: ".card-show__owners a.card-show__owner",
      USER_NAME: ".card-show__owner-name",
      USER_IMAGE_CONTAINER: ".card-show__owner-image",
      USER_ICON_CONTAINER: ".card-show__owner-icon",
      BADGE_ELEMENT: ".badge-i",
      BADGE_PLACEHOLDER: ".badge-placeholder",
      PAGINATION: "ul.pagination"
    },
    PATTERNS: {
      USERS_PAGE: /^\/cards\/\d+\/users\/?(?:\?.*)?$/,
      CARD_ID: /cards\/(\d+)\/users/,
      USER_ID: /\/users\/(\d+)$/,
    },
    BADGE_PLACEHOLDER_STYLE: {
      width: '16px',
      height: '16px',
      backgroundColor: '#e0e0e0',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'pulse 1.5s ease-in-out infinite alternate'
    }
  };

  const Logger = {
    info: (msg, data = null) => console.log(`ℹ️ ${msg}`, data || ''),
    warn: (msg, data = null) => console.warn(`⚠️ ${msg}`, data || ''),
    error: (msg, data = null) => console.error(`❌ ${msg}`, data || ''),
    success: (msg, data = null) => console.log(`✅ ${msg}`, data || ''),
    debug: (msg, data = null) => console.debug(`🔍 ${msg}`, data || ''),
  };

  // Unified message sender with error handling and timeout
  class MessageSender {
    static async send(type, data = {}, timeout = 30000) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Message ${type} timed out after ${timeout}ms`));
        }, timeout);

        chrome.runtime.sendMessage({ type, data }, response => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error(`No response for ${type}`));
            return;
          }

          if (response.success === false) {
            reject(new Error(response.error || `${type} failed`));
            return;
          }

          resolve(response);
        });
      });
    }
  }

  // Optimized token manager - uses background cache
  class TokenManager {
    static async getToken() {
      try {
        const response = await MessageSender.send('GET_TOKEN');
        return response.token;
      } catch (error) {
        Logger.error("Failed to get token:", error.message);
        return null;
      }
    }
  }

  // Optimized user data extractor with caching
  class UserDataExtractor {
    static userCache = new Map();
    
    static extractUsersFromPage() {
      const cacheKey = location.href;
      const cached = this.userCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < 30000) {
        Logger.debug("Using cached user data");
        return cached.users;
      }

      const links = Array.from(document.querySelectorAll(CONFIG.SELECTORS.USER_LINKS));
      const users = links.map(link => {
        const idMatch = link.href.match(CONFIG.PATTERNS.USER_ID);
        if (!idMatch) return null;
        return {
          user_id: idMatch[1],
          username: link.querySelector(CONFIG.SELECTORS.USER_NAME)?.textContent.trim() || "",
          image: link.querySelector("img")?.getAttribute("src") || ""
        };
      }).filter(Boolean);

      // Cache the result
      this.userCache.set(cacheKey, { users, timestamp: Date.now() });
      
      // Clean old cache entries
      if (this.userCache.size > 10) {
        const oldestKey = this.userCache.keys().next().value;
        this.userCache.delete(oldestKey);
      }

      return users;
    }

    static clearCache() {
      this.userCache.clear();
    }
  }

  // Optimized API client - all requests go through background
  class ApiClient {
    static badgeCache = new Map();
    
    static _makeCacheKey(cardId, users) {
      const ids = users.map(u => u.user_id || u).sort().join(',');
      return `${cardId}:${ids}`;
    }
    
    static async fetchUsersByCategory(category, cardId, page) {
      try {
        Logger.debug("Calling fetchUsersByCategory with:", { category, cardId, page });
        const response = await MessageSender.send('FETCH_USERS_BY_CATEGORY', {
          category,
          card_id: cardId,
          page
        }, 60000); // 1 minute timeout

        return response.data || [];
      } catch (error) {
        Logger.error("fetchUsersByCategory failed:", error.message);
        return [];
      }
    }

    static async fetchUserStatuses(cardId, users) {
      if (!users.length) return {};

      try {
        Logger.debug("Fetching user statuses", { cardId, userCount: users.length });

        const token = await TokenManager.getToken();
        Logger.debug("FETCH_USERS_CARD_STATUS payload", { token, card_id: cardId, users });
        const response = await MessageSender.send('FETCH_USERS_CARD_STATUS', {
          token,
          card_id: String(cardId),
          users
        }, 360000);

        const data = response.data || {};

        Logger.success("User statuses fetched", Object.keys(data).length + " users");
        return data;
      } catch (error) {
        Logger.error("fetchUserStatuses failed:", error.message);
        return {};
      }
    }
  }

  // Badge placeholder manager
  class BadgePlaceholderManager {
    static createPulseAnimation() {
      // Add pulse animation if not exists
      if (!document.getElementById('badge-pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'badge-pulse-animation';
        style.textContent = `
          @keyframes badge-pulse {
            0% { opacity: 0.4; transform: scale(0.95); }
            100% { opacity: 0.8; transform: scale(1.05); }
          }
          .badge-placeholder {
            width: 16px;
            height: 16px;
            background-color: #e0e0e0;
            border-radius: 50%;
            display: inline-block;
            animation: badge-pulse 1.5s ease-in-out infinite alternate;
            margin: 2px;
          }
          .lock-placeholder {
            width: 12px;
            height: 12px;
            background-color: #f0f0f0;
            border-radius: 2px;
            display: inline-block;
            animation: badge-pulse 1.5s ease-in-out infinite alternate;
            margin: 1px;
            opacity: 0.3;
          }
        `;
        document.head.appendChild(style);
      }
    }

    static createBadgePlaceholder() {
      const placeholder = document.createElement("div");
      placeholder.className = "badge-placeholder";
      placeholder.title = "Загрузка бэйджа...";
      return placeholder;
    }

    static createLockPlaceholder() {
      const placeholder = document.createElement("div");
      placeholder.className = "lock-placeholder";
      placeholder.title = "Проверка блокировки...";
      return placeholder;
    }

    static replacePlaceholderWithBadge(placeholder, badgeInfo) {
      if (!placeholder || !placeholder.parentNode) return;

      const badge = document.createElement("i");
      badge.className = "badge-i";
      badge.textContent = badgeInfo.badge;
      badge.title = badgeInfo.category;
      badge.style.color = badgeInfo.color || "#000";
      
      placeholder.parentNode.replaceChild(badge, placeholder);
    }

    static replaceLockPlaceholderWithIcon(placeholder, isLocked) {
      if (!placeholder || !placeholder.parentNode) return;

      if (isLocked) {
        const lockIcon = document.createElement("i");
        lockIcon.className = "icon icon-lock";
        lockIcon.title = "Заблокирован";
        placeholder.parentNode.replaceChild(lockIcon, placeholder);
      } else {
        // Remove placeholder if not locked
        placeholder.parentNode.removeChild(placeholder);
      }
    }

    static removePlaceholder(placeholder) {
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
    }
  }

  // Ultra-optimized user renderer with immediate placeholder creation
  class UserRenderer {
    static createUserElement(user, withBadgePlaceholder = true, withLockPlaceholder = false) {
      const userLink = document.createElement("a");
      userLink.href = `/users/${user.user_id}`;
      userLink.className = "card-show__owner";

      const imageDiv = document.createElement("div");
      imageDiv.className = "card-show__owner-image";
      imageDiv.setAttribute("bis_skin_checked", "1");

      const img = document.createElement("img");
      img.src = user.image || "";
      img.alt = "Аватар";
      img.loading = "lazy";
      imageDiv.appendChild(img);

      const iconDiv = document.createElement("div");
      iconDiv.className = "card-show__owner-icon";
      iconDiv.setAttribute("bis_skin_checked", "1");

      // Add placeholders as needed
      if (withBadgePlaceholder) {
        const badgePlaceholder = BadgePlaceholderManager.createBadgePlaceholder();
        iconDiv.appendChild(badgePlaceholder);
      }
      if (withLockPlaceholder) {
        const lockPlaceholder = BadgePlaceholderManager.createLockPlaceholder();
        iconDiv.appendChild(lockPlaceholder);
      }

      imageDiv.appendChild(iconDiv);

      const nameSpan = document.createElement("span");
      nameSpan.className = "card-show__owner-name";
      nameSpan.textContent = user.username || user.user_id;

      userLink.appendChild(imageDiv);
      userLink.appendChild(nameSpan);

      return userLink;
    }

    static async renderUsers(users, cardId, withLockPlaceholder = false) {
      const container = document.querySelector(CONFIG.SELECTORS.USER_CONTAINER);
      if (!container) {
        Logger.warn("Users container not found");
        return;
      }

      Logger.debug(`Rendering ${users.length} users with placeholders (lock: ${withLockPlaceholder})`);
      BadgePlaceholderManager.createPulseAnimation();

      // Используем DocumentFragment для ускорения вставки новых элементов
      const fragment = document.createDocumentFragment();
      const existing = Array.from(container.querySelectorAll("a.card-show__owner"));

      // Обновляем или создаём только нужные элементы
      users.forEach((user, index) => {
        let el = existing[index];
        if (!el) {
          el = this.createUserElement(user, true, withLockPlaceholder);
          fragment.appendChild(el);
        } else {
          el.style.display = "";
          el.href = `/users/${user.user_id}`;
          const nameSpan = el.querySelector(CONFIG.SELECTORS.USER_NAME);
          if (nameSpan) nameSpan.textContent = user.username;
          const img = el.querySelector("img");
          if (img && img.src !== user.image) img.src = user.image;
          const iconContainer = el.querySelector(CONFIG.SELECTORS.USER_ICON_CONTAINER);
          if (iconContainer) {
            if (withLockPlaceholder) {
              iconContainer.innerHTML = '';
            } else {
              iconContainer.querySelectorAll('.badge-placeholder').forEach(el => el.remove());
            }
            const badgePlaceholder = BadgePlaceholderManager.createBadgePlaceholder();
            iconContainer.appendChild(badgePlaceholder);
            if (withLockPlaceholder) {
              const lockPlaceholder = BadgePlaceholderManager.createLockPlaceholder();
              iconContainer.appendChild(lockPlaceholder);
            }
          }
          fragment.appendChild(el);
        }
      });

      // Удаляем лишние элементы
      for (let i = users.length; i < existing.length; i++) {
        existing[i].remove();
      }

      // Вставляем новые элементы (если были)
      if (fragment.childNodes.length > 0) {
        container.appendChild(fragment);
      }

      Logger.success(`Instantly rendered ${users.length} users with placeholders`);
      this.loadAndUpdateBadgesAndLocks(container, users, cardId);
    }
    
    static async loadAndUpdateBadgesAndLocks(container, users, cardId) {
      try {
        Logger.debug("Loading badges and locks asynchronously...");
        const statusData = await ApiClient.fetchUserStatuses(cardId, users);
        
        // Get current user elements (they might have changed during async operation)
        const elementsToUpdate = Array.from(container.querySelectorAll("a.card-show__owner"));
        
        users.forEach((user, index) => {
          const el = elementsToUpdate[index];
          if (!el) return;

          const iconContainer = el.querySelector(CONFIG.SELECTORS.USER_ICON_CONTAINER);
          if (!iconContainer) return;

          const badgePlaceholder = iconContainer.querySelector(".badge-placeholder");
          const lockPlaceholder = iconContainer.querySelector(".lock-placeholder");
          const userStatus = statusData[user.user_id];

          // Handle badge placeholder
          if (userStatus && badgePlaceholder) {
            BadgePlaceholderManager.replacePlaceholderWithBadge(badgePlaceholder, userStatus);
          } else if (!userStatus && badgePlaceholder) {
            BadgePlaceholderManager.removePlaceholder(badgePlaceholder);
          }

          // Handle lock placeholder
          if (lockPlaceholder) {
            const isLocked = userStatus && Boolean(parseInt(userStatus.lock || '0', 10));
            BadgePlaceholderManager.replaceLockPlaceholderWithIcon(lockPlaceholder, isLocked);
          }
        });

        Logger.success(`Updated ${Object.keys(statusData).length} badges and locks from placeholders`);
      } catch (error) {
        Logger.error("Badge and lock loading failed:", error.message);
        
        // Remove all placeholders on error
        const badgePlaceholders = container.querySelectorAll(".badge-placeholder");
        const lockPlaceholders = container.querySelectorAll(".lock-placeholder");
        badgePlaceholders.forEach(p => BadgePlaceholderManager.removePlaceholder(p));
        lockPlaceholders.forEach(p => BadgePlaceholderManager.removePlaceholder(p));
      }
    }
  }

  // Optimized badge updater for existing users
  class BadgeUpdater {
    static async updateBadges(cardId, withLockPlaceholder = false) {
      const users = UserDataExtractor.extractUsersFromPage();
      if (!users.length) {
        Logger.warn("No users found for badge update");
        return;
      }

      // Ensure animation is available
      BadgePlaceholderManager.createPulseAnimation();

      // 1️⃣ First, add placeholders to all existing users
      this.addPlaceholdersToExistingUsers(withLockPlaceholder);

      // 2️⃣ Then load actual badges and locks
      try {
        const statusData = await ApiClient.fetchUserStatuses(cardId, users);
        this.replacePlaceholdersWithBadgesAndLocks(statusData);
        Logger.success(`Updated ${Object.keys(statusData).length} badges and locks`);
      } catch (error) {
        Logger.error("Badge and lock update failed:", error.message);
        this.removeAllPlaceholders();
      }
    }

    static addPlaceholdersToExistingUsers(withLockPlaceholder = false) {
      const links = document.querySelectorAll(CONFIG.SELECTORS.USER_LINKS);

      links.forEach(link => {
        const imgContainer = link.querySelector(CONFIG.SELECTORS.USER_IMAGE_CONTAINER);
        if (!imgContainer) return;

        let iconContainer = imgContainer.querySelector(CONFIG.SELECTORS.USER_ICON_CONTAINER);
        if (!iconContainer) {
          iconContainer = document.createElement("div");
          iconContainer.className = CONFIG.SELECTORS.USER_ICON_CONTAINER.replace('.', '');
          iconContainer.setAttribute("bis_skin_checked", "1");
          imgContainer.appendChild(iconContainer);
        }

        // В обычном режиме удаляем только badge-placeholder, оставляем icon-lock
        if (withLockPlaceholder) {
          iconContainer.innerHTML = '';
        } else {
          iconContainer.querySelectorAll('.badge-placeholder').forEach(el => el.remove());
          // НЕ трогаем .icon-lock!
        }

        // Добавляем badge-placeholder всегда
        const badgePlaceholder = BadgePlaceholderManager.createBadgePlaceholder();
        iconContainer.appendChild(badgePlaceholder);

        // Добавляем lock-placeholder только если нужно
        if (withLockPlaceholder) {
          const lockPlaceholder = BadgePlaceholderManager.createLockPlaceholder();
          iconContainer.appendChild(lockPlaceholder);
        }
      });

      Logger.debug("Added placeholders to existing users");
    }

    static replacePlaceholdersWithBadgesAndLocks(statusData) {
      const links = document.querySelectorAll(CONFIG.SELECTORS.USER_LINKS);
      
      links.forEach(link => {
        const idMatch = link.href.match(CONFIG.PATTERNS.USER_ID);
        if (!idMatch) return;
        
        const userId = idMatch[1];
        const userStatus = statusData[userId];
        const iconContainer = link.querySelector(CONFIG.SELECTORS.USER_ICON_CONTAINER);
        
        if (!iconContainer) return;
        
        const badgePlaceholder = iconContainer.querySelector(".badge-placeholder");
        const lockPlaceholder = iconContainer.querySelector(".lock-placeholder");
        
        // Handle badge
        if (userStatus && badgePlaceholder) {
          BadgePlaceholderManager.replacePlaceholderWithBadge(badgePlaceholder, userStatus);
        } else if (!userStatus && badgePlaceholder) {
          BadgePlaceholderManager.removePlaceholder(badgePlaceholder);
        }

        // Handle lock
        if (lockPlaceholder) {
          const isLocked = userStatus && Boolean(parseInt(userStatus.lock || '0', 10));
          BadgePlaceholderManager.replaceLockPlaceholderWithIcon(lockPlaceholder, isLocked);
        }
      });
    }

    static removeAllPlaceholders() {
      const badgePlaceholders = document.querySelectorAll(".badge-placeholder");
      const lockPlaceholders = document.querySelectorAll(".lock-placeholder");
      badgePlaceholders.forEach(p => BadgePlaceholderManager.removePlaceholder(p));
      lockPlaceholders.forEach(p => BadgePlaceholderManager.removePlaceholder(p));
    }
  }

  class PaginationManager {
    static originalPaginationHtml = null;
    static isCustomPagination = false;

    static saveOriginalPagination() {
      const paginationEl = document.querySelector(CONFIG.SELECTORS.PAGINATION);
      if (!paginationEl || this.originalPaginationHtml) return;
      
      this.originalPaginationHtml = paginationEl.innerHTML;
      Logger.debug("Original pagination HTML saved");
    }

    static updatePaginationForCategory(currentPage, totalPages, cardId, category, onPageChange) {
      const paginationEl = document.querySelector(CONFIG.SELECTORS.PAGINATION);
      if (!paginationEl) {
        Logger.warn("Pagination element not found");
        return;
      }

      // Сохраняем оригинальную пагинацию при первом вызове
      this.saveOriginalPagination();
      this.isCustomPagination = true;

      Logger.debug(`Updating pagination: page ${currentPage + 1}/${totalPages}`);

      // Очищаем и создаём новую пагинацию
      paginationEl.innerHTML = '';
      
      // Создаём контейнер для кнопок
      const fragment = document.createDocumentFragment();

      // Функция создания кнопки страницы
      const createPageItem = (pageIndex, text, isActive = false, isDisabled = false) => {
        const li = document.createElement('li');
        li.className = 'pagination__button';
        
        if (isActive) {
          li.classList.add('pagination__button--active');
        }

        const link = document.createElement('a');
        link.textContent = text;
        link.href = '#';
        
        if (isDisabled) {
          link.style.opacity = '0.5';
          link.style.pointerEvents = 'none';
          link.style.cursor = 'not-allowed';
        } else if (!isActive) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (pageIndex >= 0 && pageIndex < totalPages) {
              Logger.debug(`Switching to page ${pageIndex + 1}`);
              onPageChange(category, cardId, pageIndex);
            }
          });
          
          link.style.cursor = 'pointer';
        } else {
          link.style.cursor = 'default';
        }

        li.appendChild(link);
        return li;
      };

      // Кнопка "Назад"
      const prevDisabled = currentPage <= 0;
      fragment.appendChild(createPageItem(currentPage - 1, '← Назад', false, prevDisabled));

      // Логика отображения номеров страниц
      if (totalPages <= 1) {
        // Только одна страница
        fragment.appendChild(createPageItem(0, '1', currentPage === 0));
      } else if (totalPages <= 7) {
        // Показываем все страницы если их мало
        for (let i = 0; i < totalPages; i++) {
          fragment.appendChild(createPageItem(i, (i + 1).toString(), i === currentPage));
        }
      } else {
        // Сложная логика для большого количества страниц
        const createEllipsis = () => {
          const li = document.createElement('li');
          li.className = 'pagination__button';
          const span = document.createElement('span');
          span.textContent = '...';
          span.style.opacity = '0.5';
          li.appendChild(span);
          return li;
        };

        // Всегда показываем первую страницу
        fragment.appendChild(createPageItem(0, '1', currentPage === 0));

        let startPage, endPage;
        
        if (currentPage <= 3) {
          // Начало списка
          startPage = 1;
          endPage = Math.min(5, totalPages - 1);
        } else if (currentPage >= totalPages - 4) {
          // Конец списка
          startPage = Math.max(1, totalPages - 6);
          endPage = totalPages - 1;
        } else {
          // Середина списка
          startPage = currentPage - 2;
          endPage = currentPage + 2;
        }

        // Добавляем многоточие после первой страницы если нужно
        if (startPage > 1) {
          fragment.appendChild(createEllipsis());
        }

        // Добавляем страницы в диапазоне
        for (let i = startPage; i <= endPage; i++) {
          if (i > 0 && i < totalPages - 1) {
            fragment.appendChild(createPageItem(i, (i + 1).toString(), i === currentPage));
          }
        }

        // Добавляем многоточие перед последней страницей если нужно
        if (endPage < totalPages - 1) {
          fragment.appendChild(createEllipsis());
        }

        // Всегда показываем последнюю страницу
        if (totalPages > 1) {
          fragment.appendChild(createPageItem(totalPages - 1, totalPages.toString(), currentPage === totalPages - 1));
        }
      }

      // Кнопка "Вперёд"
      const nextDisabled = currentPage >= totalPages - 1;
      fragment.appendChild(createPageItem(currentPage + 1, 'Вперёд →', false, nextDisabled));

      // Добавляем все элементы в пагинацию
      paginationEl.appendChild(fragment);

      Logger.success(`Pagination updated: page ${currentPage + 1}/${totalPages} for category ${category}`);
    }

    static restoreOriginalPagination() {
      const paginationEl = document.querySelector(CONFIG.SELECTORS.PAGINATION);
      if (!paginationEl || !this.originalPaginationHtml || !this.isCustomPagination) {
        Logger.debug("Nothing to restore in pagination");
        return;
      }

      Logger.debug("Restoring original pagination");
      
      // Восстанавливаем оригинальный HTML
      paginationEl.innerHTML = this.originalPaginationHtml;
      this.isCustomPagination = false;
      
      // Убираем все кастомные event listeners, клонируя элементы
      const links = paginationEl.querySelectorAll('a');
      links.forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
      });

      Logger.success("Original pagination restored");
    }

    static reset() {
      this.originalPaginationHtml = null;
      this.isCustomPagination = false;
    }
  }

  // Optimized navigation manager
  class NavigationManager {
    static init(onUrlChange) {
      // Debounced URL change handler
      let debounceTimer;
      const debouncedHandler = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(onUrlChange, 100);
      };

      ["pushState", "replaceState"].forEach(method => {
        const original = history[method];
        history[method] = function(...args) {
          const ret = original.apply(this, args);
          debouncedHandler();
          return ret;
        };
      });
      
      window.addEventListener("popstate", debouncedHandler);
      Logger.success("Navigation manager initialized");
    }
  }

  class CategoryNavigator {
    constructor() {
      this.isActive = false;
      this.currentCategory = null;
      this.currentPage = 0;
      this.totalPages = 0;
      this.categories = [];
    }

    async fetchCategories() {
      try {
        const response = await MessageSender.send('GET_HEALTH_CATEGORY');
        Logger.debug("Raw GET_HEALTH_CATEGORY response:", response);
        const src = response.category || response.categories || response;
        
        if (!src || typeof src !== 'object') {
          Logger.warn('No valid category data received');
          return [];
        }

        const cats = Object.entries(src)
          .filter(([key, val]) => val && typeof val === 'object' && 'badge' in val && 'color' in val)
          .map(([key, val]) => ({
            category: key,
            badge: val.badge,
            color: val.color
          }));
          
        Logger.debug('Categories fetched:', cats);
        this.categories = cats;
        return cats;
      } catch (error) {
        Logger.error("Failed to fetch categories:", error.message);
        return [];
      }
    }

    insertBookmarkNavigator(onClickCategory) {
      const target = document.querySelector(CONFIG.SELECTORS.USER_WRAPPER);
      if (!target) return;
      
      const existing = document.querySelector('#mbf-bookmark-navigator');
      if (existing) existing.remove();
      
      if (!this.categories.length) {
        Logger.warn("No categories to display");
        return;
      }

      Logger.info("Inserting bookmark navigator", this.categories);
      
      const container = document.createElement('div');
      container.id = 'mbf-bookmark-navigator';
      container.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.1);
      `;
      
      // Кнопка "Показать всех" для возврата к обычному режиму
      const showAllBtn = document.createElement('button');
      showAllBtn.textContent = '👥 Показать всех';
      showAllBtn.title = 'Вернуться к обычному просмотру';
      showAllBtn.style.cssText = `
        cursor: pointer;
        border: 2px solid #007bff;
        background: #fff;
        color: #007bff;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.2s ease;
        margin-right: 10px;
      `;
      
      showAllBtn.addEventListener('click', () => {
        Logger.info("Returning to normal view");
        this.deactivate();
        window.location.reload(); // Простое решение для возврата к обычному виду
      });
      
      container.appendChild(showAllBtn);
      
      // Create fragment for batch insertion
      const fragment = document.createDocumentFragment();
      
      this.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.badge || cat.category;
        btn.title = cat.category;
        btn.style.cssText = `
          cursor: pointer;
          border: 1px solid #ccc;
          background: ${cat.color || '#fff'};
          color: #333;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 14px;
          transition: all 0.2s ease;
          min-width: 40px;
        `;
        
        btn.addEventListener('mouseenter', () => {
          btn.style.transform = 'scale(1.05)';
          btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        });
        
        btn.addEventListener('mouseleave', () => {
          btn.style.transform = 'scale(1)';
          btn.style.boxShadow = 'none';
        });
        
        btn.addEventListener('click', () => {
          if (!cat || !cat.category) {
            Logger.warn("Clicked invalid category button", cat);
            return;
          }

          // Check if same category clicked
          if (this.isActive && this.currentCategory === cat.category) {
            Logger.info(`Same category clicked, reloading: ${cat.category}`);
            onClickCategory(cat.category); // Просто перезагружаем данные
            return;
          }

          this.activateCategory(cat.category);

          this.updatePagination(0, 1, controller.cardId, (c, id, p) => controller.fetchAndRender(c, id, p));
          
          onClickCategory(cat.category);

          // Visual feedback
          document.querySelectorAll('#mbf-bookmark-navigator button:not(:first-child)').forEach(b => {
            b.style.opacity = '0.6';
            b.style.fontWeight = 'normal';
          });
          btn.style.opacity = '1';
          btn.style.fontWeight = 'bold';
        });

        fragment.appendChild(btn);
      });
      
      container.appendChild(fragment);
      target.parentNode.insertBefore(container, target);
    }

    activateCategory(category) {
      this.isActive = true;
      this.currentCategory = category;
      this.currentPage = 0;
      Logger.info(`Category navigator activated: ${category}`);
    }

    deactivate() {
      this.isActive = false;
      this.currentCategory = null;
      this.currentPage = 0;
      this.totalPages = 0;
      
      // Restore original pagination
      PaginationManager.restoreOriginalPagination();
      Logger.info("Category navigator deactivated");
    }

    updatePagination(currentPage, totalPages, cardId, onPageChange) {
      if (!this.isActive || !this.currentCategory) {
        Logger.debug("Not updating pagination - navigator not active");
        return;
      }
      
      this.currentPage = currentPage;
      this.totalPages = totalPages;
      
      Logger.debug(`Updating pagination: page ${currentPage + 1}/${totalPages}`);
      
      PaginationManager.updatePaginationForCategory(
        currentPage,
        totalPages,
        cardId,
        this.currentCategory,
        onPageChange
      );
    }
  }

  // Main controller with optimized initialization
  class MainController {
    constructor() {
      this.navigator = new CategoryNavigator();
      this.cardId = null;
      this.initialized = false;
    }

    detectCardId() {
      const m = location.pathname.match(CONFIG.PATTERNS.CARD_ID);
      return m ? m[1] : null;
    }

    async fetchAndRender(category, cardId, page) {
      if (!category) {
        Logger.warn("Invalid category provided to fetchAndRender:", category);
        return;
      }

      try {
        Logger.info(`Fetching and rendering: ${category}, page: ${page}`);
        const response = await ApiClient.fetchUsersByCategory(category, cardId, page);
        const { users, total_pages } = response;

        const container = document.querySelector(CONFIG.SELECTORS.USER_CONTAINER);
        if (!container) return;

        container.innerHTML = "";

        if (!users.length) {
          Logger.warn("No users found for category");
          container.innerHTML = '<p>Пользователи не найдены</p>';
          return;
        }

        // lock-placeholder нужен при выборе категории
        await UserRenderer.renderUsers(users, cardId, true);

        // ВАЖНО: передайте true!
        await BadgeUpdater.updateBadges(cardId, true);

        this.navigator.updatePagination(
          page,
          total_pages || 1,
          cardId,
          (c, id, p) => this.fetchAndRender(c, id, p)
        );
        
        Logger.success(`Rendered ${users.length} users for category ${category}, page ${page + 1}/${total_pages || 1}`);
      } catch (error) {
        Logger.error("fetchAndRender failed:", error.message);
      }
    }

    async onCategoryClick(category) {
      Logger.info(`Category clicked: ${category}`);
      await this.fetchAndRender(category, this.cardId, 0);
    }

    async initialize() {
      if (this.initialized) return;
      
      this.cardId = this.detectCardId();
      if (!this.cardId) {
        Logger.warn("No card ID detected");
        return;
      }
      
      this.navigator.deactivate();
      
      try {
        await this.navigator.fetchCategories();
        this.navigator.insertBookmarkNavigator(c => this.onCategoryClick(c));
        
        // lock-placeholder НЕ нужен при обычной загрузке
        await UserRenderer.renderUsers(UserDataExtractor.extractUsersFromPage(), this.cardId, false);

        // ВАЖНО: передайте false!
        await BadgeUpdater.updateBadges(this.cardId, false);

        this.initialized = true;
        Logger.success("Main controller initialized");
      } catch (error) {
        Logger.error("Initialization failed:", error.message);
      }
  }

  async handleNavigation() {
      // Reset initialization status on navigation
      this.initialized = false;
      UserDataExtractor.clearCache();
      
      if (CONFIG.PATTERNS.USERS_PAGE.test(location.pathname + location.search)) {
        await this.initialize();
      }
    }
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const interval = 50;
      let elapsed = 0;

      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        elapsed += interval;
        if (elapsed >= timeout) return reject(new Error(`Timeout waiting for ${selector}`));
        setTimeout(check, interval);
      };

      check();
    });
  }

  // Initialize controller
  const controller = new MainController();

  // Navigation
  NavigationManager.init(() => controller.handleNavigation());

  // Wait for DOM element and start
  (async () => {
    try {
      await waitForElement(".card-show__owners", 10000);
      await controller.handleNavigation();
    } catch (e) {
      Logger.error("Failed to start badge injector:", e.message);
    }
  })();
 
})();