"""
Сервис для работы с профилем пользователя и токенами.
"""
import log_config # noqa: F401

import json
import uuid  # noqa: F401
import logging
from typing import Dict, Any

from config import PROFILE_FILE_PATH
from exceptions import (
    ProfileNotFoundError,
    ProfileCorruptedError,
    InvalidTokenError,
    UserCardError
)
from models import ProfileData

logger = logging.getLogger(__name__)


class ProfileService:
    """Сервис для управления профилем пользователя."""
    
    def __init__(self, profile_path: str = PROFILE_FILE_PATH):
        self.profile_path = profile_path
    
    def load_profile(self) -> ProfileData:
        """Загрузка профиля из файла. Если файл отсутствует — создаёт новый профиль."""
        try:
            with open(self.profile_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return ProfileData(**data)
        except FileNotFoundError:
            logger.warning(f"Profile file not found: {self.profile_path}, creating new profile.")
            # Создаём новый профиль с пустыми/дефолтными данными
            profile_data = ProfileData(cookie={}, token="", headers={})
            self.save_profile(profile_data)
            return profile_data
        except json.JSONDecodeError as e:
            logger.error(f"Profile file corrupted: {e}")
            raise ProfileCorruptedError()
        except Exception as e:
            logger.error(f"Failed to load profile: {e}")
            raise UserCardError(f"Failed to load profile: {e}")
        
    def save_profile(self, profile_data: ProfileData) -> None:
        """Сохранение профиля в файл."""
        try:
            with open(self.profile_path, 'w', encoding='utf-8') as f:
                json.dump(
                    profile_data.dict(),
                    f,
                    ensure_ascii=False,
                    indent=4
                )
            logger.info("Profile saved successfully")
        except Exception as e:
            logger.error(f"Failed to save profile: {e}")
            raise UserCardError(f"Failed to save profile: {e}")
    
    def create_profile(self, cookie: Dict[str, str], csrf_token: str) -> str:
        """Создание нового профиля с генерацией токена."""
        try:
            token = str(uuid.uuid4())
            # token = "02a788e2-daff-4bc1-82df-7a8e2a7532ae"
            cookie["theme"] = "light"
            profile_data = ProfileData(
                cookie=cookie,
                token=token,
                headers=self._get_default_headers(csrf_token)
            )
            
            self.save_profile(profile_data)
            logger.info(f"New profile created with token: {token[:8]}...")
            return token
        except Exception as e:
            logger.error(f"Failed to create profile: {e}")
            raise UserCardError(f"Failed to create profile: {e}")
    
    def validate_token(self, incoming_token: str) -> ProfileData:
        """
        Проверяет валидность токена и возвращает профиль пользователя.
        
        Исключения:
        - InvalidTokenError: если токен не совпадает
        - ProfileNotFoundError, ProfileCorruptedError: если проблемы с профилем
        - UserCardError: любая другая неожиданная ошибка
        """
        try:
            profile = self.load_profile()
            
            if not incoming_token:
                logger.warning("Token not provided")
                raise InvalidTokenError("Token not provided")
            
            if incoming_token != profile.token:
                logger.warning("Invalid token provided")
                raise InvalidTokenError("Invalid token")

            return profile

        except (ProfileNotFoundError, ProfileCorruptedError) as e:
            logger.error(f"Cannot validate token due to profile error: {e}")
            raise

        except InvalidTokenError:
            raise

        except Exception as e:
            logger.error(f"Token validation failed due to unexpected error: {e}")
            raise UserCardError("Token validation failed due to unexpected error")
    
    def _get_default_headers(self, csrf: str = "") -> Dict[str, str]:
        """Получение заголовков по умолчанию."""
        return {
            "Host": "mangabuff.ru",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Priority": "u=0, i",
            "x-csrf-token": csrf,
            "x-requested-with": "XMLHttpRequest"
        }
    
    def update_profile_data(self, **kwargs) -> None:
        """Обновление данных профиля."""
        try:
            profile = self.load_profile()
            
            # Обновляем только переданные поля
            updated_data = profile.dict()
            for key, value in kwargs.items():
                if hasattr(profile, key) and value is not None:
                    updated_data[key] = value
            
            updated_profile = ProfileData(**updated_data)
            self.save_profile(updated_profile)
            logger.info("Profile updated successfully")
            
        except Exception as e:
            logger.error(f"Failed to update profile: {e}")
            raise UserCardError(f"Failed to update profile: {e}")
    
    def get_request_params(self) -> Dict[str, Any]:
        """Получение параметров для HTTP запросов."""
        try:
            profile = self.load_profile()
            return {
                'cookies': profile.cookie,
                'headers': profile.headers or self._get_default_headers(),
                'timeout': 10
            }
        except Exception as e:
            logger.error(f"Failed to get request params: {e}")
            raise UserCardError(f"Failed to get request params: {e}")


# Глобальный экземпляр сервиса
profile_service = ProfileService()