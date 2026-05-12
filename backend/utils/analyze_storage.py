"""
本地持久化（均在项目根下）：
- analyze/daily、analyze/cache：单日 AI、区间分析缓存（Docker 挂载 /app/analyze）
- analyze_summary/daily|weekly|monthly：定时全局总结 Markdown（Docker 挂载 /app/analyze_summary）
"""
import hashlib
import json
from pathlib import Path
from typing import List, Literal, Optional

from utils.file_utils import sanitize_name_for_filename

AnalyzeSummaryKind = Literal["daily", "weekly", "monthly"]


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent

def analyze_summary_root() -> Path:
    return _project_root() / "analyze_summary"


def ensure_analyze_summary_dirs() -> None:
    for sub in ("daily", "weekly", "monthly"):
        (analyze_summary_root() / sub).mkdir(parents=True, exist_ok=True)


def analyze_summary_path(kind: AnalyzeSummaryKind, key: str) -> Path:
    safe = str(key).strip().replace("..", "")
    if not safe.endswith(".md"):
        safe = f"{safe}.md"
    return analyze_summary_root() / kind / safe


def list_analyze_keys(kind: AnalyzeSummaryKind) -> List[str]:
    ensure_analyze_summary_dirs()
    d = analyze_summary_root() / kind
    if not d.is_dir():
        return []
    keys: List[str] = []
    for p in sorted(d.glob("*.md"), reverse=True):
        keys.append(p.stem)
    return keys


def read_analyze_markdown(kind: AnalyzeSummaryKind, key: str) -> Optional[str]:
    path = analyze_summary_path(kind, key)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def write_analyze_markdown(kind: AnalyzeSummaryKind, key: str, markdown: str) -> Path:
    ensure_analyze_summary_dirs()
    path = analyze_summary_path(kind, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown.strip() + "\n", encoding="utf-8")
    return path
