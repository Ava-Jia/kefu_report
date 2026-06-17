"""
远程 FAISS 向量库 HTTP 客户端。
接口约定：POST /api/faiss/search | /api/faiss/insert | /api/faiss/update | /api/faiss/delete
"""
from __future__ import annotations

import logging
import os

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _base_url() -> str:
    url = os.getenv("FAISS_API_BASE_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("未配置 FAISS_API_BASE_URL，请在 backend/.env 中设置")
    return url


def _timeout() -> int:
    return int(os.getenv("FAISS_API_TIMEOUT", "30"))


def _post(path: str, payload: dict) -> dict:
    url = f"{_base_url()}{path}"
    resp = requests.post(url, json=payload, timeout=_timeout())
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        detail = body.get("detail") or body.get("message") or "FAISS 请求失败"
        raise RuntimeError(str(detail))
    data = body.get("data")
    return data if isinstance(data, dict) else {"data": data}


def search_faiss(query: str, top_k: int = 5) -> tuple[list, list]:
    """查询相似 Q/A。"""
    data = _post("/api/faiss/search", {"query": query.strip(), "top_k": top_k})
    if isinstance(data, list):
        return data, []
    results = data.get("data") if isinstance(data.get("data"), list) else []
    return results, []


def _vector_payload(
    item_id: int,
    question: str,
    answer: str,
    category: str = "",
) -> dict:
    return {
        "id": item_id,
        "question": question.strip(),
        "answer": answer.strip(),
        "category": (category or "").strip(),
    }


def insert_vector_by_id(
    item_id: int,
    question: str,
    answer: str,
    category: str = "",
) -> dict:
    """按 id 新增向量。"""
    return _post("/api/faiss/insert", _vector_payload(item_id, question, answer, category))


def update_vector_by_id(
    item_id: int,
    question: str,
    answer: str,
    category: str = "",
) -> dict:
    """按 id 更新向量。"""
    return _post("/api/faiss/update", _vector_payload(item_id, question, answer, category))


def delete_vector_by_id(item_id: int) -> dict:
    """按 id 删除向量。"""
    return _post("/api/faiss/delete", {"id": item_id})
