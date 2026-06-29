"""
远程邮箱解析任务接口，
"""
from __future__ import annotations

import logging
import os

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _base_url() -> str:
    url = os.getenv("EMAIL_PARSER_BASE_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("未配置 EMAIL_PARSER_BASE_URL，请在 backend/.env 中设置")
    return url


def _timeout() -> int:
    return int(os.getenv("EMAIL_API_TIMEOUT", "30"))


def _post(path: str, payload: dict) -> dict:
    url = f"{_base_url()}{path}"
    resp = requests.post(url, json=payload, timeout=_timeout())
    resp.raise_for_status()
    body = resp.json()
    data = body.get("data")
    return data if isinstance(data, dict) else {"data": data}

def _get(path: str) -> dict:
    url = f"{_base_url()}{path}"
    resp = requests.get(url, timeout=_timeout())
    resp.raise_for_status()
    body = resp.json()
    # data = body.get("result")
    return body if isinstance(body, dict) else {"data": body}

def get_email_parser(task_id):
    data = _get(f"/task/{task_id}")
    if isinstance(data, list):
        return data, []
    # results = data.get("result") if isinstance(data.get("result"), list) else []
    return data, []

