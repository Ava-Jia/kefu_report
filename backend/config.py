import os
import logging
from logging.handlers import TimedRotatingFileHandler

def setup_logging():

    log_dir = "/app/logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(log_dir, "app.log"), 
        when="midnight", 
        interval=1, 
        backupCount=30,
        encoding="utf-8",
        )

    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    logging.basicConfig(
        level=logging.INFO,
        handlers=[file_handler, console_handler]
    )