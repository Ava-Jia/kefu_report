"""
按规则汇总日报正文，供定时全局 analyze 总结使用。
"""
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from utils.file_utils import (
    extract_body_from_saved_txt,
    list_report_files,
    read_report_meta_and_content,
)

TZ = ZoneInfo("Asia/Shanghai")


def _chunks_from_metas(paths: List[Path]) -> List[str]:
    chunks: List[str] = []
    for path in paths:
        meta = read_report_meta_and_content(path)
        d_str = meta.get("date") or ""
        if not d_str:
            continue
        body = extract_body_from_saved_txt(meta["content"])
        chunks.append(
            f"--- 文件: {meta['filename']} | 客服: {meta['name']} | 日期: {meta['date']} ---\n"
            f"{body}\n"
        )
    return chunks


def collect_daily_by_report_date(report_day: date) -> str:
    """日报「业务日期」等于 report_day 的全部日报。"""
    day_s = report_day.isoformat()
    paths: List[Path] = []
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        if meta.get("date") == day_s:
            paths.append(path)
    paths.sort(key=lambda p: p.name)
    chunks = _chunks_from_metas(paths)
    if not chunks:
        raise ValueError(f"日期 {day_s} 下没有找到任何日报")
    return "\n".join(chunks)


def _mtime_aware(path: Path) -> datetime:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=TZ)


def collect_weekly_by_submission_window(start: datetime, end: datetime) -> str:
    """
    按文件修改时间（视为提交时间）落在 [start, end] 内的日报。
    """
    start = start.astimezone(TZ)
    end = end.astimezone(TZ)
    if start > end:
        raise ValueError("开始时间不能晚于结束时间")

    paths: List[Path] = []
    for path in list_report_files():
        mt = _mtime_aware(path)
        if start <= mt <= end:
            paths.append(path)
    paths.sort(key=lambda p: p.stat().st_mtime)
    chunks = _chunks_from_metas(paths)
    if not chunks:
        raise ValueError(
            f"在提交时间窗口 {start.isoformat()} ~ {end.isoformat()} 内没有找到日报"
        )
    return "\n".join(chunks)


def collect_monthly_by_report_date(year: int, month: int) -> str:
    """日报业务日期落在指定自然月内的全部日报。"""
    paths: List[Path] = []
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        d_str = meta.get("date") or ""
        if not d_str:
            continue
        try:
            fd = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        if fd.year == year and fd.month == month:
            paths.append(path)
    paths.sort(key=lambda p: p.name)
    chunks = _chunks_from_metas(paths)
    if not chunks:
        raise ValueError(f"{year}-{month:02d} 月没有找到任何日报")
    return "\n".join(chunks)


def yesterday_report_date(now: Optional[datetime] = None) -> date:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    return (now.date() - timedelta(days=1))


def previous_month_year_month(now: Optional[datetime] = None) -> tuple[int, int]:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    first_this = now.replace(day=1)
    last_prev = first_this - timedelta(days=1)
    return last_prev.year, last_prev.month


def weekly_window_sat_to_sat(now: Optional[datetime] = None) -> tuple[datetime, datetime, str]:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    end = now.replace(second=0, microsecond=0)
    start = end - timedelta(days=7)
    key = end.date().isoformat()
    return start, end, key


def monthly_key_for_month(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"
