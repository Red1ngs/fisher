"""
Сервис для управления карточками пользователей.
"""
import logging
from math import ceil
from typing import List, Dict, Any, Union

from config import CATEGORY_BADGES
from database import UserCardDB
from models import UserInput, UsersByCategoryResponse
from parser_service import parser_service
from exceptions import (
    UserNotFoundError,
    InvalidCategoryError,
    UserCardError
)

logger = logging.getLogger()


class CardService:
    """Сервис для управления карточками пользователей."""

    def __init__(self, db: UserCardDB):
        self.db = db
        self.valid_categories = list(CATEGORY_BADGES.keys())

    def validate_category(self, category: str) -> None:
        """Валидация категории карточки."""
        if category not in self.valid_categories:
            raise InvalidCategoryError(category, self.valid_categories)
        
    def get_categories_for_users(self, users: List[UserInput]) -> Dict[str, str]:
        """
        Получает категории пользователей по user_id из списка UserInput.
        Возвращает словарь: {user_id: category}
        """
        if not users:
            return {}

        user_ids = [int(user.user_id) for user in users]
        placeholders = ",".join("?" for _ in user_ids)

        query = f'''
            SELECT user_id, category
            FROM users
            WHERE user_id IN ({placeholders})
        '''

        rows = self.db._fetch_all(query, tuple(user_ids))
        return {row["user_id"]: row["category"] for row in rows}

    def set_user_status(self, user_id: Union[str, int], category: str) -> None:
        self.validate_category(category)

        max_successful_updates = 2
        max_total_attempts = 4
        successful_updates = 0
        total_attempts = 0

        while successful_updates < max_successful_updates and total_attempts < max_total_attempts:
            try:
                self.db.update_user_partial(user_id, category=category)
                logger.info(f"status updated to '{category}' for user {user_id}")
                successful_updates += 1
            except UserNotFoundError:
                logger.info(f"User {user_id} not found, adding user")
                self.db.add_user(user_id)
            except Exception as e:
                logger.error(f"Unexpected error updating card status: {e}")
                raise UserCardError(f"Failed to update card status: {e}")
            finally:
                total_attempts += 1

        if successful_updates < max_successful_updates:
            raise UserCardError(f"Failed to update card status after {total_attempts} attempts")
    
    def get_users_by_category(
        self,
        category: str,
        card_id: str,
        page: int = 0,
        page_size: int = 36
    ) -> UsersByCategoryResponse:
        self.validate_category(category)

        offset = page * page_size

        query = '''
            SELECT 
                u.user_id, u.username, u.image, u.category,
                total.count as total_count
            FROM (
                SELECT *
                FROM users u
                INNER JOIN cards c ON u.user_id = c.user_id
                WHERE u.category = ? AND c.card_id = ?
                ORDER BY u.user_id
                LIMIT ? OFFSET ?
            ) u
            CROSS JOIN (
                SELECT COUNT(*) AS count
                FROM users u
                INNER JOIN cards c ON u.user_id = c.user_id
                WHERE u.category = ? AND c.card_id = ?
            ) total
        '''

        params = (category, card_id, page_size, offset, category, card_id)
        rows = self.db._fetch_all(query, params)

        users = [UserInput(**{k: v for k, v in dict(row).items() if k != "total_count"}) for row in rows]
        total_count = rows[0]["total_count"] if rows else 0
        total_pages = ceil(total_count / page_size) if page_size else 1

        return UsersByCategoryResponse(users=users, total_pages=total_pages)
            
    def get_users_status(
        self, 
        card_id: str, 
        users: List[UserInput]
    ) -> Dict[str, Dict[str, str]]:
        """Получение статуса карточки для списка пользователей с обновлением категории в БД."""
        if not users:
            return {}
        
        try:  
            cards_data, missing_users = self.db.get_specific_card_for_users(users, card_id)
            if missing_users:
                logger.info(f"Adding {len(missing_users)} missing users")
                self.db.add_users(missing_users)
                for user in missing_users:
                    try:
                        self._refresh_user_cards(user)
                    except Exception as e:
                        logger.warning(f"Failed to refresh cards for user {user.user_id}: {e}")
                new_cards_data, _ = self.db.get_specific_card_for_users(missing_users, card_id)
                cards_data.update(new_cards_data)
            
            result = {}
            users_map = self.get_categories_for_users(users)
            for user_id, db_category in users_map.items():
                actual_category = parser_service.fetch_user_category(user_id)
                self.validate_category(actual_category)
                if db_category != actual_category and db_category in ("normal", "blocked"):
                    self.db.update_user_partial(user_id, category=actual_category)
                result[str(user_id)] = {
                    "category": actual_category,
                    "badge": CATEGORY_BADGES[actual_category]["badge"],
                    "color": CATEGORY_BADGES[actual_category]["color"]
                }
            
            logger.info(f"Retrieved card status for {len(result)} users")
            return result
            
        except Exception as e:
            logger.error(f"Failed to get users card status: {e}")
            raise UserCardError(f"Failed to get users card status: {e}")
    
    def get_user_cards(self, user_id: str, refresh: bool = False) -> List[Dict[str, Any]]:
        """Получение карточек пользователя с опцией обновления."""
        try:
            if refresh:
                self._refresh_user_cards(user_id)
            
            cards = self.db.get_cards_by_user(user_id)
            logger.info(f"Retrieved {len(cards)} cards for user {user_id}")
            return cards
            
        except UserNotFoundError:
            logger.info(f"User {user_id} not found, adding and refreshing...")
            self.db.add_user(user_id)
            self._refresh_user_cards(user_id)
            return self.db.get_cards_by_user(user_id)
        except Exception as e:
            logger.error(f"Failed to get user cards: {e}")
            raise UserCardError(f"Failed to get user cards: {e}")
    
    def update_card_info(
        self, 
        user_id: str, 
        card_id: str, 
        **kwargs
    ) -> None:
        """Обновление информации о карточке."""
        try:
            self.db.update_card_partial(user_id, card_id, **kwargs)
            logger.info(f"Card {card_id} info updated for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to update card info: {e}")
            raise UserCardError(f"Failed to update card info: {e}")
    
    def bulk_update_category(
        self, 
        updates: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """Массовое обновление категорий карточек."""
        success_count = 0
        error_count = 0
        errors = []
        
        for update in updates:
            try:
                user_id = update.get('user_id')
                card_id = update.get('card_id')
                category = update.get('category')
                
                if not all([user_id, card_id, category]):
                    error_count += 1
                    errors.append(f"Missing required fields in update: {update}")
                    continue
                
                self.set_user_card_status(user_id, card_id, category)
                success_count += 1
                
            except Exception as e:
                error_count += 1
                errors.append(f"Failed to update {update}: {e}")
                logger.error(f"Bulk update error: {e}")
        
        result = {
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors
        }
        
        logger.info(f"Bulk update completed: {success_count} success, {error_count} errors")
        return result
    
    def _subtract_by_data_id(self, list1, list2):
        data_ids_to_remove = {d["data_id"] for d in list2}
        return [d for d in list1 if d["data_id"] not in data_ids_to_remove]

    def _refresh_user_cards(self, user: UserInput) -> None:
        """Обновление карточек пользователя из внешнего источника."""
        try:
            # Парсим карточки пользователя
            parsed = parser_service.parse_user_cards(user)
            self.db.add_cards_from_payload(user, parsed)
            saved = self.db.get_cards_by_user(user)
            
            for_delete = self._subtract_by_data_id(saved, parsed)
            if for_delete:
                cards_to_delete = [
                    {"user_id": user.user_id, "card_id": card["card_id"]}
                    for card in for_delete
                ]
                self.db.delete_cards_batch(cards_to_delete)
            logger.info(f"Refreshed cards for user {user.user_id}")
            
        except Exception as e:
            logger.error(f"Failed to refresh cards for user {user.user_id}: {e}")
            raise UserCardError(f"Failed to refresh user cards: {e}")

def create_card_service() -> CardService:
    """Фабричная функция для создания сервиса карточек."""
    db = UserCardDB()
    return CardService(db)