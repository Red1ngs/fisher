"""
Модели данных для API.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional, Literal


class HttpData(BaseModel):
    """Модель для HTTP данных (cookie и CSRF токен)."""
    cookie: Dict[str, str] = Field(..., description="Cookies для аутентификации")
    csrf_token: str = Field(..., description="CSRF токен")

class UserInput(BaseModel):
    user_id: str = Field(..., pattern=r"^\d+$", description="ID пользователя (в строке)")
    username: Optional[str] = None
    image: Optional[str] = None
    category: Optional[str] = None
    lock: Optional[Literal[0, 1]] = Field(default=0)

    @field_validator('username', 'image', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        return v or None
    
    class Config:
        extra = "forbid"
        
class UsersByCategoryResponse(BaseModel):
    users: List[UserInput]
    total_pages: int
    
class SetStatusRequest(BaseModel):
    """Модель запроса на установку статуса карточки."""
    token: str = Field(..., description="Токен аутентификации")
    user_id: str = Field(..., description="ID пользователя")
    category: str = Field(..., description="Категория Пользователя")
    
class GetStatusRequest(BaseModel):
    """Модель запроса на получение статуса карточки для списка пользователей."""
    token: str = Field(..., description="Токен аутентификации")
    card_id: str = Field(..., description="ID карточки")
    users: List[UserInput] = Field(..., description="Список пользователей")
    class Config:
        extra = "forbid"

class GetUsersStatusRequest(BaseModel):
    """Модель запроса на получение пользователей по статусу карточки."""
    token: str = Field(..., description="Токен аутентификации")
    card_id: str = Field(..., description="ID карточки")
    category: str = Field(..., description="Категория Пользователя")


class CardStatusResponse(BaseModel):
    """Модель ответа со статусом карточки."""
    category: str = Field(..., description="Категория Пользователя")
    badge: str = Field(..., description="Значок категории")
    color: str = Field(..., description="Цвет категории")

class TokenResponse(BaseModel):
    """Модель ответа с токеном."""
    token: str = Field(..., description="Сгенерированный токен")


class StatusResponse(BaseModel):
    """Модель простого ответа о статусе операции."""
    status: str = Field(..., description="Статус операции")


class ProfileData(BaseModel):
    """Модель данных профиля."""
    cookie: Dict[str, str]
    token: str
    headers: Optional[Dict[str, str]] = None


class CardData(BaseModel):
    """Модель данных карточки."""
    card_id: str
    user_id: str = Field(..., pattern=r"^\d+$", description="ID пользователя (в строке)")
    image: str
    name: Optional[str] = None
    manga_name: Optional[str] = None
    data_id: Optional[int] = None,
    lock: Optional[Literal[0, 1]] = Field(default=None)
    created_at: Optional[str] = None


class UserData(BaseModel):
    """Модель данных пользователя."""
    user_id: str = Field(..., pattern=r"^\d+$", description="ID пользователя (в строке)")
    username: Optional[str] = None
    category: str = "normal"  

