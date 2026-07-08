"""
Redis 邮件解析数据访问层。
"""
from __future__ import annotations

import json
import logging
import os

import redis
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST", "r-uf6zx1088q5hrpxkbcpd.redis.rds.aliyuncs.com"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            username=os.getenv("REDIS_USERNAME", "pilot"),
            password=os.getenv("REDIS_PASSWORD", "3hE07_U^_3##jBeo1-%5"),
            db=int(os.getenv("REDIS_DB", "30")),
            decode_responses=True,
        )
    return _redis_client


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

