"""
Сервис для парсинга данных с веб-сайта.
"""
import time
import os
import json
import logging
from typing import List, Dict, Any
from http import HTTPStatus

import requests
from bs4 import BeautifulSoup

from config import URLS, PARSING_CONFIG, CATEGORY_BADGES
from models import UserInput
from exceptions import (
    NetworkError,
    RateLimitError,
    CardCountParseError,
    UserCardsParseError
)
from profile_service import profile_service


logger = logging.getLogger()


class ParserService:
    """Сервис для парсинга данных пользователей и карточек."""
    
    def __init__(self):
        self.retry_limit = PARSING_CONFIG['retry_limit']
        self.base_delay = PARSING_CONFIG['base_delay_seconds']
        self.timeout = PARSING_CONFIG['request_timeout']
        self.cards_per_page = PARSING_CONFIG['cards_per_page']
    
    def _make_request(
        self, 
        url: str, 
        method: str = 'GET',
        data: Dict[str, Any] = None,
        use_auth: bool = False,
        retry_on_rate_limit: bool = True
    ) -> requests.Response:
        """Выполнение HTTP запроса с обработкой ошибок."""
        retries = 0
        
        while retries < self.retry_limit:
            try:
                kwargs = {'timeout': self.timeout}
                
                if use_auth:
                    auth_params = profile_service.get_request_params()
                    kwargs.update(auth_params)
                
                if method.upper() == 'POST':
                    if data:
                        kwargs['data'] = data
                    response = requests.post(url, **kwargs)
                else:
                    response = requests.get(url, **kwargs)
                
                # Обработка rate limiting
                if response.status_code == HTTPStatus.TOO_MANY_REQUESTS:
                    if retry_on_rate_limit and retries < self.retry_limit - 1:
                        delay = self.base_delay * (2 ** retries) 
                        logger.warning(f"Rate limit hit for {url}, retrying in {delay}s...")
                        time.sleep(delay)
                        retries += 1
                        continue
                    else:
                        raise RateLimitError(url)
                
                response.raise_for_status()
                return response
                
            except requests.RequestException as e:
                if retries < self.retry_limit - 1:
                    delay = self.base_delay * (retries + 1)
                    logger.warning(f"Request failed for {url}: {e}, retrying in {delay}s...")
                    time.sleep(delay)
                    retries += 1
                else:
                    logger.error(f"Request failed after {self.retry_limit} attempts: {e}")
                    raise NetworkError(url, str(e))
        
        raise NetworkError(url, "Max retries exceeded")
    
    def fetch_user_category(self, user_id: str) -> str:
        """Определение категории пользователя на основе его страницы markets."""
        url = URLS['user_markets'].format(user_id=user_id)

        try:
            response = self._make_request(url, retry_on_rate_limit=True)
            soup = BeautifulSoup(response.text, 'html.parser')

            if not soup.select_one('.not-found'):
                logger.debug(f"User {user_id} not appears to be blocked (not-found detected)")
                return "blocked"

            logger.debug(f"User {user_id} category determined as 'normal'")
            return "normal"

        except (NetworkError, RateLimitError) as e:
            logger.error(f"Failed to fetch category for user {user_id}: {e}")
            return "normal"

        except Exception as e:
            logger.error(f"Unexpected error fetching category for user {user_id}: {e}")
            return "normal"

    def parse_users_categories(self, user_ids: List[int]) -> Dict[int, Dict[str, str]]:
        """Парсинг категорий для списка пользователей."""
        if not user_ids:
            return {}
        
        parsed = {}
        
        for i, user_id in enumerate(user_ids):
            try:
                user_category = self.fetch_user_category(user_id)
                badge = CATEGORY_BADGES[user_category]["badge"]
                parsed[user_id] = {"badge": badge, "category": user_category}

                if i < len(user_ids) - 1:  
                    time.sleep(self.base_delay)
                    
            except Exception as e:
                logger.error(f"Failed to parse category for user {user_id}: {e}")
                # Устанавливаем значения по умолчанию при ошибке
                parsed[user_id] = {"badge": CATEGORY_BADGES["normal"]["badge"], "category": "normal"}
        
        logger.info(f"Parsed categories for {len(parsed)} users")
        return parsed
    
    def parse_card_count(self, user_id: str) -> str:
        """Получение общего количества карт пользователя."""
        url = URLS['user_cards'].format(user_id=user_id)
        
        try:
            response = self._make_request(url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Ищем элемент со счетчиком карт
            count_selectors = [
                'span.secondary-text',
                '.cards-count',
                '.total-cards'
            ]
            
            for selector in count_selectors:
                span = soup.select_one(selector)
                if span and span.text:
                    try:
                        count_text = span.text.strip().replace(" ", "").replace(",", "")
                        count = int(count_text)
                        logger.debug(f"Found {count} cards for user {user_id}")
                        return count
                    except ValueError:
                        continue
            
            raise CardCountParseError(user_id, "Card count element not found or invalid")
            
        except NetworkError as e:
            raise CardCountParseError(user_id, f"Network error: {e}")
        except Exception as e:
            raise CardCountParseError(user_id, f"Parsing error: {e}")

    def parse_user_cards(self, user: UserInput, save_to_json: bool = False) -> List[Dict[str, Any]]:
        try:
            user_id = user.user_id
            total_cards = self.parse_card_count(user_id)
            logger.info(f"User {user_id}: {total_cards} total cards found")
        except CardCountParseError as e:
            logger.error(f"User {user_id}: failed to determine card count: {e}")
            raise UserCardsParseError(user_id, f"Card count error: {e}")

        all_data = []
        cards_loaded = 0

        if save_to_json:
            user_folder = os.path.join("user_cards_data", str(user_id))
            os.makedirs(user_folder, exist_ok=True)

        total_pages = (total_cards + self.cards_per_page - 1) // self.cards_per_page
        page_offsets = list(range(0, total_cards, self.cards_per_page))

        logger.info(f"User {user_id}: parsing {total_pages} pages...")

        try:
            for page_index, offset in enumerate(page_offsets):
                start_time = time.time()
                logger.info(f"User {user_id}: parsing page {page_index + 1}/{total_pages} (offset={offset})")

                try:
                    page_data = self._fetch_cards_page(user_id, offset)
                    logger.debug(f"User {user_id}: received {len(page_data)} page items at offset {offset}")

                    if page_data:
                        if save_to_json:
                            raw_filename = f"cards_offset_{offset}.json"
                            raw_filepath = os.path.join(user_folder, raw_filename)
                            with open(raw_filepath, "w", encoding="utf-8") as f:
                                json.dump(page_data, f, ensure_ascii=False, indent=2)

                        cards = self.extract_cards_from_payload(page_data, user_id)

                        if save_to_json:
                            parsed_filename = f"parsed_cards_offset_{offset}.json"
                            parsed_filepath = os.path.join(user_folder, parsed_filename)
                            with open(parsed_filepath, "w", encoding="utf-8") as f:
                                json.dump(cards, f, ensure_ascii=False, indent=2)

                        all_data.extend(cards)
                        cards_loaded += len(cards)
                        logger.info(f"User {user_id}: parsed {len(cards)} cards at offset {offset}")
                    else:
                        logger.warning(f"User {user_id}: empty page at offset {offset}")

                except Exception as e:
                    logger.warning(f"User {user_id}: failed to process offset {offset}: {e}")
                    continue

                elapsed = time.time() - start_time
                logger.info(f"User {user_id}: finished offset {offset} in {elapsed:.2f} sec")

                if offset + self.cards_per_page < total_cards:
                    time.sleep(self.base_delay)

            logger.info(f"User {user_id}: successfully loaded {cards_loaded} cards across {total_pages} pages")
            return all_data

        except Exception as e:
            logger.error(f"User {user_id}: unexpected failure: {e}")
            raise UserCardsParseError(user_id, f"Cards parsing failed: {e}")

        
    def _fetch_cards_page(self, user_id, offset: str) -> List[Dict[str, Any]]:
        """Загрузка одной страницы карт."""
        url = URLS['cards_load'].format(user_id=user_id)
        payload = {"offset": offset}
        
        try:
            response = self._make_request(
                url, 
                method='POST', 
                data=payload, 
                use_auth=True
            )
            
            json_data = response.json()
            
            # Обрабатываем различные форматы ответа
            if isinstance(json_data, list):
                return json_data
            elif isinstance(json_data, dict):
                return [json_data]
            else:
                logger.warning(f"Unexpected JSON format at offset {offset}: {type(json_data)}")
                return []
                
        except requests.JSONDecodeError as e:
            logger.error(f"JSON decode error at offset {offset}: {e}")
            return []
        except Exception as e:
            logger.error(f"Error fetching cards page at offset {offset}: {e}")
            raise
    
    def extract_cards_from_payload(self, payload: List[Dict[str, Any]], user_id: str) -> List[Dict[str, Any]]:
        """Извлечение карточек из полученных данных."""
        extracted_cards = []
        for group in payload:
            for entry in group["cards"]:
                card = entry.get("card", {})
                
                if not card:
                    continue
                
                card_info = {
                    'card_id': str(card.get("id")),
                    'image': card.get("image", ""),
                    'name': card.get("name", ""),
                    'manga_name': (card.get("manga") or {}).get("name", ""),
                    'data_id': entry.get("id"),
                    'lock': entry.get("is_lock")
                }
                
                extracted_cards.append(card_info)
        
        logger.debug(f"Extracted {len(extracted_cards)} valid cards from payload")
        return extracted_cards


# Глобальный экземпляр сервиса
parser_service = ParserService()