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


def _base_url() -> str:
    url = os.getenv("RLS_API_BASE_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("未配置 RLS_API_BASE_URL，请在 backend/.env 中设置")
    return url


def _rls_search_async_request(scac_code: str, query_number: list[str]) -> dict:
    """提交 RLS 异步查询请求。"""
    url = f"{_base_url()}/rlsSearch/async"
    payload = {"SCAC_Code": scac_code, "query_number": query_number}
    # 请求webAgent系统
    resp = requests.post(
        url,
        json=payload,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def rls_search_async(scac_code: str, query_number: list[str]) -> list[dict]:
    """提交 RLS 异步查询请求，单号数量超过 10 个时自动分 2 份提交。"""    
    if len(query_number) <= 10:
        return [_rls_search_async_request(scac_code, query_number)]
    else:
        logger.info(f"单号数量超过 10 个，自动分 2 份提交")
        mid = math.ceil(len(query_number) / 2)
        query_number_1 = query_number[:mid]
        query_number_2 = query_number[mid:]
        return [_rls_search_async_request(scac_code, query_number_1), _rls_search_async_request(scac_code, query_number_2)]

def rls_list_remote_results(params: dict) -> dict:
    """列出 RLS 结果，支持过滤（对接外部系统 GET /rlsSearch/results）。"""
    url = f"{_base_url()}/rlsSearch/results"
    # 请求webAgent系统
    resp = requests.get(
        url,
        params=params,
        headers={"accept": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def rls_update_remote_result(result_id: str, payload: dict) -> dict:
    """更新一条 RLS 结果（对接外部系统 PATCH /rlsSearch/result/{result_id}）。"""
    url = f"{_base_url()}/rlsSearch/result/{result_id}"
    # 请求webAgent系统
    resp = requests.patch(
        url,
        json=payload,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

