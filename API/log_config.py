import logging
import logging.handlers
import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(BASE_DIR, "api.log")

MAX_LOG_SIZE = 5 * 1024 * 1024
BACKUP_COUNT = 3

# Файл: пишемо все (DEBUG+)
file_handler = logging.handlers.RotatingFileHandler(
    LOG_PATH, maxBytes=MAX_LOG_SIZE, backupCount=BACKUP_COUNT, encoding="utf-8"
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
file_handler.setLevel(logging.DEBUG)

# Потік: тільки головне (INFO+)
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(levelname)s - %(message)s'
))
stream_handler.setLevel(logging.INFO)

root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)  # Всі повідомлення для root, але хендлери фільтрують

root_logger.handlers = [file_handler, stream_handler]

for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    lg = logging.getLogger(name)
    lg.handlers = [file_handler, stream_handler]
    lg.propagate = False
    lg.setLevel(logging.INFO)