"""
Основное приложение FastAPI для управления карточками пользователей.
"""
import log_config # noqa: F401

import logging
from contextlib import contextmanager
from typing import Dict

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_CONFIG, CATEGORY_BADGES, PAGE_SIZE
from models import (
    HttpData, SetStatusRequest, GetStatusRequest,
    TokenResponse, StatusResponse, CardStatusResponse,
    UsersByCategoryResponse
)
from exceptions import (
    UserCardError, InvalidCategoryError, InvalidTokenError,
    ProfileNotFoundError, ProfileCorruptedError, UserNotFoundError,
    CardNotFoundError, NetworkError, ParseError
)
from profile_service import profile_service
from card_service import create_card_service

logger = logging.getLogger(__name__)

# Создание приложения FastAPI
app = FastAPI(
    title="User Cards Management API",
    description="API для управления карточками пользователей",
    version="2.0.0"
)

# Настройка CORS
app.add_middleware(CORSMiddleware, **CORS_CONFIG)


# Dependency для получения сервиса карточек
@contextmanager
def get_card_service():
    """Контекстный менеджер для получения сервиса карточек."""
    service = create_card_service()
    yield service


def get_card_service_dependency():
    """Dependency для FastAPI."""
    with get_card_service() as service:
        yield service


# Обработчики исключений
@app.exception_handler(InvalidTokenError)
async def handle_invalid_token(request, exc):
    logger.warning(f"Invalid token attempt from {request.client.host}")
    return JSONResponse(
        status_code=401,
        content={"detail": "Invalid token"}
    )


@app.exception_handler(ProfileNotFoundError)
async def handle_profile_not_found(request, exc):
    logger.error("Profile file not found")
    return JSONResponse(
        status_code=500,
        content={"detail": "Profile not configured"}
    )


@app.exception_handler(ProfileCorruptedError)
async def handle_profile_corrupted(request, exc):
    logger.error("Profile file corrupted")
    return JSONResponse(
        status_code=500,
        content={"detail": "Profile configuration corrupted"}
    )


@app.exception_handler(InvalidCategoryError)
async def handle_invalid_category(request, exc):
    return JSONResponse(
        status_code=400,
        content={"detail": f"Invalid category. Valid options: {', '.join(exc.valid_categories)}"}
    )


@app.exception_handler(UserNotFoundError)
async def handle_user_not_found(request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": f"User {exc.user_id} not found"}
    )


@app.exception_handler(CardNotFoundError)
async def handle_card_not_found(request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": f"Card {exc.card_id} not found for user {exc.user_id}"}
    )


@app.exception_handler(NetworkError)
async def handle_network_error(request, exc):
    logger.error(f"Network error: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "External service unavailable"}
    )


@app.exception_handler(ParseError)
async def handle_parse_error(request, exc):
    logger.error(f"Parse error: {exc}")
    return JSONResponse(
        status_code=502,
        content={"detail": "Failed to parse external data"}
    )


@app.exception_handler(UserCardError)
async def handle_user_card_error(request, exc):
    logger.error(f"User card error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


# Эндпоинты API

@app.get("/", tags=["Health"])
async def root():
    """Проверка работоспособности API."""
    return {"message": "User Cards Management API", "status": "running"}


@app.get("/health", tags=["Health"])
async def health_check():
    """Детальная проверка состояния системы."""
    try:
        # Проверяем подключение к базе данных
        with get_card_service():
            # stats = service.get_statistics()
            return {
                "status": "healthy",
                "database": "connected",
                "category": CATEGORY_BADGES
            }
            
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": "Service unavailable"
            }
        )

@app.post("/set_http_data", response_model=TokenResponse, tags=["Authentication"])
async def set_http_data(data: HttpData):
    token = profile_service.create_profile(data.cookie, data.csrf_token)
    logger.info("HTTP data configured successfully")
    return TokenResponse(token=token)


@app.post("/set_user_status", response_model=StatusResponse)
async def set_user_status(
    data: SetStatusRequest,
    card_service=Depends(get_card_service_dependency)
):
    profile_service.validate_token(data.token)
    card_service.set_user_status(data.user_id, data.category)
    return StatusResponse(status="ok")


@app.post("/users_card_status", response_model=Dict[str, CardStatusResponse], tags=["Cards"])
async def get_users_card_status(
    data: GetStatusRequest,
    card_service=Depends(get_card_service_dependency)
):
    """
    Получение статуса карточки для списка пользователей.
    """
    profile_service.validate_token(data.token)
    result = card_service.get_users_status(card_id=data.card_id, users=data.users)

    response = {}
    for user_id, status_data in result.items():
        response[str(user_id)] = CardStatusResponse(**status_data)
    return response


@app.get("/get_cards_by_category", response_model=UsersByCategoryResponse, tags=["Users"])
async def get_cards_by_category(
    token: str = Query(..., description="Access token"),
    category: str = Query(..., description="Категория пользователя"),
    card_id: str = Query(..., description="ID карточки"),
    page: int = Query(0, ge=0, description="Номер страницы (начиная с 0)"),
    card_service=Depends(get_card_service_dependency)
):
    """
    Получение пользователей по статусу карточки (категории) для заданной карточки.
    """
    profile_service.validate_token(token)
    result = card_service.get_users_by_category(category, card_id, page, PAGE_SIZE)
    return result
    