
from __future__ import annotations

import json
import logging
import os
import uuid
from email import message_from_bytes, policy
from email.header import decode_header
import requests
import redis
from dotenv import load_dotenv
from utils.oss_utils import OSSService
load_dotenv()

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None
_oss_service: OSSService | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST"),
            port=int(os.getenv("REDIS_PORT")),
            username=os.getenv("REDIS_USERNAME"),
            password=os.getenv("REDIS_PASSWORD"),
            db=int(os.getenv("REDIS_DB")),
            decode_responses=True,
        )
    return _redis_client


def _get_oss_service() -> OSSService:
    global _oss_service
    if _oss_service is None:
        _oss_service = OSSService()
    return _oss_service


def upload_file_to_oss(filename: str, data: bytes, folder: str | None = None) -> str:
    """把文件上传到 OSS，返回公开访问 URL。"""
    return _get_oss_service().upload(filename, data, folder=folder)


def _json_get(r: redis.Redis, key: str) -> dict | None:
    raw = r.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("key %s 的值不是合法 JSON", key)
        return None


def get_email_id() -> list[str]:
    """返回 Redis 中所有 email_id 的 UUID 列表。"""
    r = _get_redis()
    return [key.split(":", 1)[1] for key in r.scan_iter("email_id:*", count=200)]

def get_order_result(ordering_id: str) -> dict | None:
    "获取指定 ordering_id 的解析结果。"
    r = _get_redis()
    return _json_get(r, f"ordering_id:{ordering_id}")


def get_email_result(email_id: str) -> dict | None:
    "获取指定 email_id 的邮件解析结果。"
    r = _get_redis()
    return _json_get(r, f"email_id:{email_id}")

def submit_parse_async(eml_url: str) -> str | None:
    url = os.getenv("EMAIL_PARSER_BASE_URL")
    url = f"{url}/parse/async"
    headers = {
        "accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "eml_url": eml_url,
        "callBack": "",
        "brokerName": "",
    }
    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return None
    except ValueError:
        print(f"响应不是合法 JSON: {response.text}")
        return None

def email_parse_status(task_id: str):
    url = os.getenv("EMAIL_PARSER_BASE_URL")
    url = f"{url}/task/{task_id}"
    headers = {
        "accept": "application/json",
    }
    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return None
    except ValueError:
        print(f"响应不是合法 JSON: {response.text}")
        return None
    

def email_html_attachment(email_id: str):
    """通过email_id 获取html_content"""
    if not email_id:
        return {
            "success": False,
            "message": "email_id 不能为空",
            "html_content": None,
            "attachments": [],
        }
    
    r = _get_redis()
    results = _json_get(r, f"email_id:{email_id}")
    if not results:
        return {
            "success": False,
            "message": "未找到对应邮件",
            "html_content": None,
            "attachments": [],
        }
    email_html_content = results.get("html_content")
    all_attachments = results.get("attachments") or []
    return {
        "success": True,
        "message": "查询成功",
        "html_content": email_html_content,
        "attachments": all_attachments,

    }

