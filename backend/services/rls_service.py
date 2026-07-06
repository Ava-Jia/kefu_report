"""
RLS 查询系统 HTTP 客户端。
接口约定：POST /rlsSearch/async | GET /task/{task_id}
"""
from __future__ import annotations

import json
import logging
import math
import os

import requests
from dotenv import load_dotenv

from models.rls import RlsResult, get_tasks_session

load_dotenv()

logger = logging.getLogger(__name__)

RLS_SPLIT_THRESHOLD = 10
RLS_SPLIT_COUNT = 3


def _base_url() -> str:
    url = os.getenv("RLS_API_BASE_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("未配置 RLS_API_BASE_URL，请在 backend/.env 中设置")
    return url


def _timeout() -> int:
    return int(os.getenv("RLS_API_TIMEOUT", "30"))


def _split_query_numbers(query_number: list[str]) -> list[list[str]]:
    """当单号数量超过阈值时，均分为若干份。"""
    if len(query_number) <= RLS_SPLIT_THRESHOLD:
        return [query_number]
    chunk_size = math.ceil(len(query_number) / RLS_SPLIT_COUNT)
    return [
        query_number[i : i + chunk_size]
        for i in range(0, len(query_number), chunk_size)
    ]


def _rls_search_async_request(scac_code: str, query_number: list[str]) -> dict:
    url = f"{_base_url()}/rlsSearch/async"
    payload = {"SCAC_Code": scac_code, "query_number": query_number}
    resp = requests.post(
        url,
        json=payload,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        timeout=_timeout(),
    )
    resp.raise_for_status()
    return resp.json()


def rls_search_async(scac_code: str, query_number: list[str]) -> list[dict]:
    """提交 RLS 异步查询请求，单号数量超过 10 个时自动分 3 份提交。"""
    batches = _split_query_numbers(query_number)
    return [_rls_search_async_request(scac_code, batch) for batch in batches]


def _save_rls_results(task_id: str, task_payload: dict) -> None:
    """把任务结果按提单号（query_number）落库到 rls_results 表。"""
    items = ((task_payload.get("result") or {}).get("data")) or []
    if not isinstance(items, list):
        return

    with get_tasks_session() as session:
        for item in items:
            if not isinstance(item, dict):
                continue
            query_number = item.get("query_number")
            if not query_number:
                continue

            row = (
                session.query(RlsResult)
                .filter_by(task_id=task_id, query_number=str(query_number))
                .first()
            )
            if row is None:
                row = RlsResult(task_id=task_id, query_number=str(query_number))
                session.add(row)

            row.scac_code = item.get("SCAC_Code")
            row.success = bool(item.get("success"))
            release_status = (item.get("result") or {}).get("release_status") or {}
            bl_type = release_status.get("bl_type")
            row.result = json.dumps(bl_type, ensure_ascii=False) if bl_type is not None else None
            row.error = item.get("error")

        session.commit()


def _safe_json_loads(value: str | None):
    """兼容历史数据：老数据未做 JSON 编码，直接存了裸字符串。"""
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


def _row_to_dict(row: RlsResult) -> dict:
    return {
        "task_id": row.task_id,
        "scac_code": row.scac_code,
        "query_number": row.query_number,
        "success": row.success,
        "result": _safe_json_loads(row.result),
        "error": row.error,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_rls_results(limit: int = 100, offset: int = 0) -> list[dict]:
    """列出本地库中的 RLS 结果，按更新时间倒序。"""
    with get_tasks_session() as session:
        rows = (
            session.query(RlsResult)
            .order_by(RlsResult.updated_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    return [_row_to_dict(row) for row in rows]


def rls_get_task_result(task_id: str) -> dict:
    """根据 task_id 获取 RLS 查询结果，任务完成时按提单号落库。"""
    url = f"{_base_url()}/task/{task_id}"
    resp = requests.get(url, headers={"accept": "application/json"}, timeout=_timeout())
    resp.raise_for_status()
    payload = resp.json()

    if payload.get("status") == "completed":
        try:
            _save_rls_results(task_id, payload)
        except Exception:
            logger.exception("保存 RLS 结果到 tasks.db 失败, task_id=%s", task_id)

    return payload
