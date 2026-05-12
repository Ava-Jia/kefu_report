"""
知识库 QA 持久化：knowledge/qa_store.json
pending：AI 生成待审核；archived：已存档
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

_lock = threading.Lock()
StoreStatus = Literal["pending", "archived"]


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def knowledge_dir() -> Path:
    return _project_root() / "knowledge"


def qa_store_path() -> Path:
    return knowledge_dir() / "qa_store.json"


def _empty_store() -> Dict[str, List[Dict[str, Any]]]:
    return {"pending": [], "archived": []}


def ensure_knowledge_dir() -> None:
    knowledge_dir().mkdir(parents=True, exist_ok=True)


def load_store() -> Dict[str, List[Dict[str, Any]]]:
    ensure_knowledge_dir()
    path = qa_store_path()
    if not path.is_file():
        return _empty_store()
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return _empty_store()
    if not isinstance(data, dict):
        return _empty_store()
    pending = data.get("pending")
    archived = data.get("archived")
    if not isinstance(pending, list):
        pending = []
    if not isinstance(archived, list):
        archived = []
    return {"pending": pending, "archived": archived}


def save_store(data: Dict[str, List[Dict[str, Any]]]) -> None:
    ensure_knowledge_dir()
    path = qa_store_path()
    tmp = path.with_suffix(".json.tmp")
    text = json.dumps(
        {"pending": data.get("pending", []), "archived": data.get("archived", [])},
        ensure_ascii=False,
        indent=2,
    )
    tmp.write_text(text + "\n", encoding="utf-8")
    tmp.replace(path)


def _normalize_item(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    q = str(raw.get("Q") or raw.get("q") or "").strip()
    a = str(raw.get("A") or raw.get("a") or "").strip()
    if not q or not a:
        return None
    sn = str(raw.get("source_name") or raw.get("sourceName") or "").strip()
    sd = str(raw.get("source_date") or raw.get("sourceDate") or "").strip()
    return {
        "id": str(raw.get("id") or uuid.uuid4()),
        "q": q,
        "a": a,
        "source_name": sn,
        "source_date": sd,
        "created_at": str(raw.get("created_at") or _utc_now_iso()),
        "updated_at": str(raw.get("updated_at") or _utc_now_iso()),
    }


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_items(status: StoreStatus) -> List[Dict[str, Any]]:
    with _lock:
        data = load_store()
    key = "pending" if status == "pending" else "archived"
    out: List[Dict[str, Any]] = []
    for row in data.get(key, []):
        if isinstance(row, dict):
            norm = _normalize_item(row)
            if norm:
                out.append(norm)
    return out


def append_pending_from_ai(items: List[Dict[str, Any]]) -> int:
    """追加 AI 解析后的 QA（已含 q,a,source_name,source_date），返回新增条数。"""
    with _lock:
        data = load_store()
        pending = data.get("pending", [])
        existing = {
            (str(x.get("q", "")).strip(), str(x.get("source_name", "")).strip(), str(x.get("source_date", "")).strip())
            for x in pending + data.get("archived", [])
            if isinstance(x, dict)
        }
        added = 0
        for raw in items:
            norm = _normalize_item(raw)
            if not norm:
                continue
            norm["id"] = str(uuid.uuid4())
            norm["created_at"] = _utc_now_iso()
            norm["updated_at"] = norm["created_at"]
            key_t = (norm["q"], norm["source_name"], norm["source_date"])
            if key_t in existing:
                continue
            existing.add(key_t)
            pending.append(norm)
            added += 1
        data["pending"] = pending
        save_store(data)
    return added


def update_item(
    item_id: str,
    status: StoreStatus,
    *,
    q: Optional[str] = None,
    a: Optional[str] = None,
    source_name: Optional[str] = None,
    source_date: Optional[str] = None,
) -> Tuple[bool, str]:
    with _lock:
        data = load_store()
        key = "pending" if status == "pending" else "archived"
        rows = data.get(key, [])
        found = False
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            if str(row.get("id")) != item_id:
                continue
            if q is not None:
                rows[i]["q"] = str(q).strip()
            if a is not None:
                rows[i]["a"] = str(a).strip()
            if source_name is not None:
                rows[i]["source_name"] = str(source_name).strip()
            if source_date is not None:
                rows[i]["source_date"] = str(source_date).strip()
            rows[i]["updated_at"] = _utc_now_iso()
            found = True
            break
        if not found:
            return False, "记录不存在"
        data[key] = rows
        save_store(data)
    return True, "ok"


def delete_item(item_id: str, status: StoreStatus) -> Tuple[bool, str]:
    with _lock:
        data = load_store()
        key = "pending" if status == "pending" else "archived"
        rows = [r for r in data.get(key, []) if isinstance(r, dict) and str(r.get("id")) != item_id]
        if len(rows) == len(data.get(key, [])):
            return False, "记录不存在"
        data[key] = rows
        save_store(data)
    return True, "ok"


def archive_item(item_id: str) -> Tuple[bool, str]:
    with _lock:
        data = load_store()
        pending = data.get("pending", [])
        moved: Optional[Dict[str, Any]] = None
        rest: List[Dict[str, Any]] = []
        for row in pending:
            if not isinstance(row, dict):
                continue
            if str(row.get("id")) == item_id:
                moved = dict(row)
            else:
                rest.append(row)
        if moved is None:
            return False, "记录不存在或已存档"
        moved["updated_at"] = _utc_now_iso()
        archived = data.get("archived", [])
        archived.insert(0, moved)
        data["pending"] = rest
        data["archived"] = archived
        save_store(data)
    return True, "ok"
