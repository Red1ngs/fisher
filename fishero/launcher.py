import os
import sys
import threading
import signal
import subprocess
import logging
import logging.handlers
import psutil

from PIL import Image, ImageDraw
from pystray import Icon, MenuItem, Menu

LOG_PATH = "api.log"
MAX_LOG_SIZE = 5 * 1024 * 1024
BACKUP_COUNT = 3

# Ротация логов
file_handler = logging.handlers.RotatingFileHandler(
    LOG_PATH, maxBytes=MAX_LOG_SIZE, backupCount=BACKUP_COUNT, encoding="utf-8"
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
root_logger.handlers = [file_handler, logging.StreamHandler(sys.stdout)]
for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    lg = logging.getLogger(name)
    lg.handlers = [file_handler, logging.StreamHandler(sys.stdout)]
    lg.propagate = False
    lg.setLevel(logging.INFO)

API_HOST = "127.0.0.1"
API_PORT = 8000
uvicorn_proc = None

def find_process_using_port(port: int):
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            # Запрашиваем соединения отдельно
            conns = proc.net_connections(kind="inet")
            for conn in conns:
                if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                    return proc
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue
    return None


def force_kill_tree(pid: int, timeout: float = 3.0):
    """Сначала TERMINATE, ждём, затем KILL."""
    try:
        parent = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return

    children = parent.children(recursive=True)
    for p in children + [parent]:
        try:
            p.terminate()
        except psutil.NoSuchProcess:
            pass

    gone, alive = psutil.wait_procs(children + [parent], timeout=timeout)
    for p in alive:
        try:
            p.kill()
        except psutil.NoSuchProcess:
            pass
    psutil.wait_procs(alive, timeout=timeout)

def kill_existing_api():
    proc = find_process_using_port(API_PORT)
    if proc:
        print(f"Killing existing process {proc.pid} ({proc.name()}) on port {API_PORT}")
        force_kill_tree(proc.pid)

def start_uvicorn():
    global uvicorn_proc
    if sys.platform.startswith("win"):
        # Windows: новая группа процессов
        flags = subprocess.CREATE_NEW_PROCESS_GROUP
        uvicorn_proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "main:app", "--host", API_HOST,
                "--port", str(API_PORT), "--workers", "3"
            ],
            creationflags=flags
        )
    else:
        # Unix: новая сессия (PGID)
        uvicorn_proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "main:app", "--host", API_HOST,
                "--port", str(API_PORT), "--workers", "3"
            ],
            preexec_fn=os.setsid
        )

def create_icon_image() -> Image.Image:
    img = Image.new("RGB", (64, 64), color="black")
    draw = ImageDraw.Draw(img)
    draw.ellipse((16, 16, 48, 48), fill="white")
    return img

def show_log(_, __):
    if not os.path.exists(LOG_PATH):
        return
    if sys.platform.startswith("win"):
        os.startfile(LOG_PATH)
    else:
        term = os.environ.get("TERMINAL", "x-terminal-emulator")
        os.system(f'{term} -e less +F "{LOG_PATH}"')

def exit_app(icon, _):
    # 1. Сначала пробуем мягко
    if uvicorn_proc and uvicorn_proc.poll() is None:
        if sys.platform.startswith("win"):
            uvicorn_proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(os.getpgid(uvicorn_proc.pid), signal.SIGTERM)

        # ждём полсекунды
        psutil.wait_procs([psutil.Process(uvicorn_proc.pid)], timeout=0.5)

    # 2. Если всё ещё висит — добиваем
    if uvicorn_proc and uvicorn_proc.poll() is None:
        if sys.platform.startswith("win"):
            force_kill_tree(uvicorn_proc.pid)
        else:
            os.killpg(os.getpgid(uvicorn_proc.pid), signal.SIGKILL)

    # 3. На всякий случай — сканируем порт
    kill_existing_api()
    icon.stop()

def main():
    kill_existing_api()

    api_thread = threading.Thread(target=start_uvicorn, daemon=True)
    api_thread.start()

    icon = Icon("User Cards API")
    icon.icon = create_icon_image()
    icon.title = "User Cards API"
    icon.menu = Menu(
        MenuItem("Open Logs", show_log),
        MenuItem("Exit", exit_app),
    )
    icon.run()

if __name__ == "__main__":
    main()
