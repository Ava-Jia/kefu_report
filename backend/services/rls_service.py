"""
RLS 查询系统 HTTP 客户端。
接口约定：POST /rlsSearch/async | GET /task/{task_id}
"""
from __future__ import annotations

import logging
import math
import os

import requests
from dotenv import load_dotenv


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


def rls_create_result(payload: dict) -> dict:
    """新增一条 RLS 结果（对接外部系统 POST /rlsSearch/result）。"""
    url = f"{_base_url()}/rlsSearch/result"
    resp = requests.post(
        url,
        json=payload,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        timeout=_timeout(),
    )
    resp.raise_for_status()
    return resp.json()


def rls_query_result(query_number: str) -> dict:
    """按提单号查询 RLS 结果（对接外部系统 GET /rlsSearch/result）。"""
    url = f"{_base_url()}/rlsSearch/result"
    resp = requests.get(
        url,
        params={"query_number": query_number},
        headers={"accept": "application/json"},
        timeout=_timeout(),
    )
    resp.raise_for_status()
    return resp.json()


def rls_list_remote_results(params: dict) -> dict:
    """列出 RLS 结果，支持过滤（对接外部系统 GET /rlsSearch/results）。"""
    url = f"{_base_url()}/rlsSearch/results"
    resp = requests.get(
        url,
        params=params,
        headers={"accept": "application/json"},
        timeout=_timeout(),
    )
    resp.raise_for_status()
    return resp.json()


def rls_update_remote_result(result_id: str, payload: dict) -> dict:
    """更新一条 RLS 结果（对接外部系统 PATCH /rlsSearch/result/{result_id}）。"""
    url = f"{_base_url()}/rlsSearch/result/{result_id}"
    resp = requests.patch(
        url,
        json=payload,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        timeout=_timeout(),
    )
    resp.raise_for_status()
    return resp.json()


def rls_get_task_result(task_id: str) -> dict:
    """根据 task_id 获取 RLS 查询结果。"""
    url = f"{_base_url()}/task/{task_id}"
    resp = requests.get(url, headers={"accept": "application/json"}, timeout=_timeout())
    resp.raise_for_status()
    return resp.json()
