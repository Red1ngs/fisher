import log_config

import os
import sys
import threading
import signal
import subprocess
import psutil

from PIL import Image, ImageDraw
from pystray import Icon, MenuItem, Menu

# Абсолютный путь к директории скрипта и лог-файлу
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(BASE_DIR, "api.log")

API_HOST = "127.0.0.1"
API_PORT = 8000
uvicorn_proc = None

logger = log_config.root_logger
logger.info("Програма инициализирована")

def find_process_using_port(port: int):
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            conns = proc.net_connections(kind="inet")
            for conn in conns:
                if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                    return proc
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue
    return None


def force_kill_tree(pid: int, timeout: float = 3.0):
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
    cmd = [
        sys.executable, "-m", "uvicorn",
        "main:app", "--host", API_HOST,
        "--port", str(API_PORT), "--workers", "3"
    ]

    if sys.platform.startswith("win"):
        flags = subprocess.CREATE_NEW_PROCESS_GROUP
        uvicorn_proc = subprocess.Popen(cmd, creationflags=flags, start_new_session=True, cwd=BASE_DIR)
    else:
        uvicorn_proc = subprocess.Popen(cmd, preexec_fn=os.setsid, cwd=BASE_DIR)

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
    # Попытка мягкого завершения
    if uvicorn_proc and uvicorn_proc.poll() is None:
        try:
            if sys.platform.startswith("win"):
                uvicorn_proc.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(os.getpgid(uvicorn_proc.pid), signal.SIGTERM)
            psutil.wait_procs([psutil.Process(uvicorn_proc.pid)], timeout=1.0)
        except Exception:
            pass

    # Если uvicorn жив — насильственно убить его дерево
    if uvicorn_proc and uvicorn_proc.poll() is None:
        force_kill_tree(uvicorn_proc.pid)

    # Убить процессы, занимающие порт
    kill_existing_api()

    icon.stop()

    # Жестко завершить текущий процесс и терминал
    if sys.platform.startswith("win"):
        import ctypes
        ctypes.windll.kernel32.TerminateProcess(ctypes.windll.kernel32.GetCurrentProcess(), 0)
        os._exit(0)
    else:
        try:
            os.killpg(0, signal.SIGKILL)
        except Exception:
            pass
        os._exit(0)

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
