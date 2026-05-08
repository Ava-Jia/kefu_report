"""
AI 分析结果与日报简要总结的本地存储（UTF-8）。
目录：backend/analysis/daily/ 、backend/analysis/cache/
"""
import hashlib
import json
from pathlib import Path
from typing import List, Optional

from utils.file_utils import sanitize_name_for_filename


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def ensure_analysis_dirs() -> Path:
    root = _project_root() / "analysis"
    (root / "daily").mkdir(parents=True, exist_ok=True)
    (root / "cache").mkdir(parents=True, exist_ok=True)
    return root


def daily_summary_path(name: str, date_str: str) -> Path:
    """单日自动生成/读取的分析结果：analysis/daily/姓名-日期.txt"""
    ensure_analysis_dirs()
    safe = sanitize_name_for_filename(name)
    return _project_root() / "analysis" / "daily" / f"{safe}-{date_str}.txt"


def save_daily_summary(name: str, date_str: str, text: str) -> Path:
    path = daily_summary_path(name, date_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.strip() + "\n", encoding="utf-8")
    return path


def analyze_cache_path(names: Optional[List[str]], start_date: str, end_date: str) -> Path:
    """完整分析报告缓存：analysis/cache/<sha256>.md（names 为空表示全部）"""
    ensure_analysis_dirs()
    key_names = sorted(
        [str(x).strip() for x in (names if names is not None else []) if x and str(x).strip()]
    )
    payload = {
        "names": key_names,
        "start_date": str(start_date).strip(),
        "end_date": str(end_date).strip(),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return _project_root() / "analysis" / "cache" / f"{h}.md"


def read_utf8(path: Path) -> Optional[str]:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def write_utf8(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def try_merge_daily_analysis(date_str: str, names_filter: Optional[List[str]]) -> Optional[str]:
    """
    单日筛选：若所选每位客服在 analysis/daily 下均有对应文件，拼接返回；否则 None。
    names_filter 为空表示「当天所有已有日报的客服」。
    """
    from utils.file_utils import list_distinct_names_for_date

    d = str(date_str).strip()
    if names_filter:
        required = sorted({str(n).strip() for n in names_filter if n and str(n).strip()})
    else:
        required = list_distinct_names_for_date(d)

    if not required:
        return None

    parts: List[str] = []
    for nm in required:
        p = daily_summary_path(nm, d)
        t = read_utf8(p)
        if t is None:
            return None
        parts.append(t.strip())

    return "\n\n---\n\n".join(parts)
