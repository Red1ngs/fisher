"""
Кастомные исключения для приложения управления карточками пользователей.
"""


class UserCardError(Exception):
    """Базовое исключение для всех ошибок приложения."""
    pass


class UserNotFoundError(UserCardError):
    """Исключение, возникающее когда пользователь не найден."""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        super().__init__(f"User with ID {user_id} does not exist.")


class CardNotFoundError(UserCardError):
    """Исключение, возникающее когда карточка не найдена."""
    
    def __init__(self, user_id: str, card_id: str):
        self.user_id = user_id
        self.card_id = card_id
        super().__init__(f"Card {card_id} for user {user_id} does not exist.")


class InvalidCategoryError(UserCardError):
    """Исключение, возникающее при использовании недопустимой категории."""
    
    def __init__(self, category: str, valid_categories: list):
        self.category = category
        self.valid_categories = valid_categories
        super().__init__(f"Invalid category '{category}'. Valid categories: {', '.join(valid_categories)}")


class ProfileError(UserCardError):
    """Исключение, связанное с профилем пользователя."""
    pass


class ProfileNotFoundError(ProfileError):
    """Исключение, возникающее когда файл профиля не найден."""
    
    def __init__(self):
        super().__init__("Profile file not found")


class ProfileCorruptedError(ProfileError):
    """Исключение, возникающе когда файл профиля поврежден."""
    
    def __init__(self):
        super().__init__("Profile file corrupted")


class InvalidTokenError(Exception):
    def __init__(self, message="Invalid token"):
        super().__init__(message)


class ParseError(UserCardError):
    """Исключение, возникающее при ошибках парсинга."""
    pass


class CardCountParseError(ParseError):
    """Исключение при ошибке парсинга количества карт."""
    
    def __init__(self, user_id: str, reason: str):
        self.user_id = user_id
        super().__init__(f"Failed to parse card count for user {user_id}: {reason}")


class UserCardsParseError(ParseError):
    """Исключение при ошибке парсинга карт пользователя."""
    
    def __init__(self, user_id: str, reason: str):
        self.user_id = user_id
        super().__init__(f"Failed to parse user cards for user {user_id}: {reason}")


class NetworkError(UserCardError):
    """Исключение, связанное с сетевыми ошибками."""
    
    def __init__(self, url: str, reason: str):
        self.url = url
        super().__init__(f"Network error for {url}: {reason}")


class RateLimitError(NetworkError):
    """Исключение при превышении лимита запросов."""
    
    def __init__(self, url: str):
        super().__init__(url, "Rate limit exceeded (429 Too Many Requests)")