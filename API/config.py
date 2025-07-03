"""
Конфигурация приложения.
"""
from typing import Dict

# База данных
DATABASE_PATH = 'user_cards.db'

# Файлы
PROFILE_FILE_PATH = 'profile.json'

# Категории карточек
CATEGORY_BADGES: Dict[str, list] = {
    "blocked": {
        "badge": "𝗫",
        "color": "rgb(220, 20, 60)"
    },
    "normal": {
        "badge": "✓",
        "color": "rgb(0, 128, 0)"
    }, 
    "Viewed": {
        "badge": "👁",
        "color": "rgb(0, 194, 168)"
    },
    "freebie": {
        "badge": "⭐",
        "color": "rgb(255, 223, 0)"
    },
    "equivalent": {
        "badge": "🟰",
        "color": "rgb(0, 0, 0)"
    },
    "Affordable": {
        "badge": "💰",
        "color": "rgb(34, 139, 34)"
    }
}

# Настройки парсинга
PARSING_CONFIG = {
    'retry_limit': 3,
    'base_delay_seconds': 1,
    'request_timeout': 10,
    'cards_per_page': 10000,
}

PAGE_SIZE = 36

# URL-адреса
URLS = {
    'user_markets': 'https://mangabuff.ru/users/{user_id}/markets',
    'user_cards': 'https://mangabuff.ru/users/{user_id}/cards',
    'cards_load': 'https://mangabuff.ru/trades/{user_id}/availableCardsLoad',
}

# CORS настройки
CORS_CONFIG = {
    'allow_origins': ["*"],
    'allow_credentials': True,
    'allow_methods': ["POST", "GET", "OPTIONS"],
    'allow_headers': ["*"],
}

# Настройки сервера
SERVER_CONFIG = {
    'host': "0.0.0.0",
    'port': 8000,
    'reload': True,
}