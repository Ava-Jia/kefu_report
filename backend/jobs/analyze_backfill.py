
"""
历史数据回填：问题总结（日 → 周 → 月）。

用法（在 backend 目录或容器内）：
  python -m jobs.analyze_backfill --from 2026-04-01 --to 2026-05-18
  python -m jobs.analyze_backfill --from 2026-04-01 --to 2026-05-18 --dry-run
  python -m jobs.analyze_backfill --from 2026-04-01 --to 2026-05-18 --phase daily --delay 3
  python -m jobs.analyze_backfill --auto --skip-existing --delay 2

Docker：
  docker compose exec -T backend python -m jobs.analyze_backfill --from 2026-04-01 --to 2026-05-18 --delay 3
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator, List, Optional, Tuple
from zoneinfo import ZoneInfo

import logging

from services.ai_service import generate_analyze_global_summary
from utils.analyze_collect import (
    collect_daily_by_report_date,
    collect_monthly_by_report_date,
    collect_weekly_by_submission_window,
    monthly_key_for_month,
)
from utils.analyze_storage import analyze_summary_path, write_analyze_markdown
from utils.file_utils import list_report_files, read_report_meta_and_content

TZ = ZoneInfo("Asia/Shanghai")
logger = logging.getLogger(__name__)


def _setup_logging() -> None:
    try:
        from config import setup_logging

        setup_logging()
    except Exception:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )


def distinct_report_dates() -> List[date]:
    found: set[date] = set()
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        d_str = (meta.get("date") or "").strip()
        if not d_str:
            continue
        try:
            found.add(datetime.strptime(d_str, "%Y-%m-%d").date())
        except ValueError:
            continue
    return sorted(found)


def collect_by_report_date_range(start: date, end: date) -> str:
    """业务日期落在 [start, end] 内的全部日报（用于历史周总结）。"""
    from utils.analyze_collect import _chunks_from_metas

    if start > end:
        raise ValueError("开始日期不能晚于结束日期")
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
        if start <= fd <= end:
            paths.append(path)
    paths.sort(key=lambda p: p.name)
    chunks = _chunks_from_metas(paths)
    if not chunks:
        raise ValueError(f"业务日 {start} ~ {end} 内没有找到任何日报")
    return "\n".join(chunks)


def iter_days(start: date, end: date) -> Iterator[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def iter_saturdays(start: date, end: date) -> Iterator[date]:
    d = start
    while d.weekday() != 5:
        d += timedelta(days=1)
        if d > end:
            return
    while d <= end:
        yield d
        d += timedelta(days=7)


def iter_months(start: date, end: date) -> Iterator[Tuple[int, int]]:
    y, m = start.year, start.month
    end_ym = (end.year, end.month)
    while (y, m) <= end_ym:
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


def month_has_reports(year: int, month: int) -> bool:
    last = monthrange(year, month)[1]
    try:
        collect_monthly_by_report_date(year, month)
        return True
    except ValueError:
        return False


def weekly_report_window(sat: date) -> Tuple[date, date]:
    """周六 key 对应：前 7 个自然日业务日（含 sat-7 … sat-1）。"""
    end_d = sat - timedelta(days=1)
    start_d = sat - timedelta(days=7)
    return start_d, end_d


def summary_exists(kind: str, key: str) -> bool:
    return analyze_summary_path(kind, key).is_file()


def run_one_daily(day: date, *, dry_run: bool, skip_existing: bool) -> str:
    key = day.isoformat()
    if skip_existing and summary_exists("daily", key):
        return "skip"
    if dry_run:
        collect_daily_by_report_date(day)
        return "dry-run"
    text = collect_daily_by_report_date(day)
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("daily", key, md)
    return "ok"


def run_one_weekly(
    sat: date,
    *,
    dry_run: bool,
    skip_existing: bool,
    weekly_by_mtime: bool,
) -> str:
    key = sat.isoformat()
    if skip_existing and summary_exists("weekly", key):
        return "skip"
    if weekly_by_mtime:
        end_dt = datetime(sat.year, sat.month, sat.day, 12, 0, 0, tzinfo=TZ)
        start_dt = end_dt - timedelta(days=7)
        if dry_run:
            collect_weekly_by_submission_window(start_dt, end_dt)
            return "dry-run"
        text = collect_weekly_by_submission_window(start_dt, end_dt)
    else:
        start_d, end_d = weekly_report_window(sat)
        if dry_run:
            collect_by_report_date_range(start_d, end_d)
            return "dry-run"
        text = collect_by_report_date_range(start_d, end_d)
    if dry_run:
        return "dry-run"
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("weekly", key, md)
    return "ok"


def run_one_monthly(year: int, month: int, *, dry_run: bool, skip_existing: bool) -> str:
    key = monthly_key_for_month(year, month)
    if skip_existing and summary_exists("monthly", key):
        return "skip"
    if dry_run:
        if not month_has_reports(year, month):
            return "no-data"
        collect_monthly_by_report_date(year, month)
        return "dry-run"
    text = collect_monthly_by_report_date(year, month)
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("monthly", key, md)
    return "ok"


def main(argv: Optional[List[str]] = None) -> int:
    _setup_logging()
    p = argparse.ArgumentParser(description="历史回填：问题总结（日→周→月）")
    p.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", metavar="YYYY-MM-DD")
    p.add_argument(
        "--auto",
        action="store_true",
        help="自动用 reports 里最早/最晚业务日作为范围",
    )
    p.add_argument(
        "--phase",
        choices=("all", "daily", "weekly", "monthly"),
        default="all",
        help="只跑某一类；默认 all=日→周→月",
    )
    p.add_argument("--dry-run", action="store_true", help="只检查是否有数据，不调 AI")
    p.add_argument("--skip-existing", action="store_true", help="已存在对应 md 则跳过")
    p.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="每次成功调用 AI 后休眠秒数（防限流）",
    )
    p.add_argument(
        "--weekly-by-mtime",
        action="store_true",
        help="周总结按文件 mtime 窗口（与线上一致；历史导入慎用）",
    )
    args = p.parse_args(argv)

    if args.auto:
        dates = distinct_report_dates()
        if not dates:
            logger.error("reports 下没有任何业务日，退出")
            return 1
        start, end = dates[0], dates[-1]
    else:
        if not args.date_from or not args.date_to:
            p.error("请指定 --from 与 --to，或使用 --auto")
        start = datetime.strptime(args.date_from, "%Y-%m-%d").date()
        end = datetime.strptime(args.date_to, "%Y-%m-%d").date()

    if start > end:
        logger.error("开始日期不能晚于结束日期")
        return 1

    logger.info("回填范围：%s ~ %s，phase=%s", start, end, args.phase)
    ok = skip = fail = 0

    def after_ai(result: str) -> None:
        nonlocal ok, skip
        if result == "ok":
            ok += 1
            if args.delay > 0 and not args.dry_run:
                time.sleep(args.delay)
        elif result in ("skip", "dry-run", "no-data"):
            skip += 1

    phases = (
        ["daily", "weekly", "monthly"]
        if args.phase == "all"
        else [args.phase]
    )

    try:
        for phase in phases:
            logger.info("===== 阶段：%s =====", phase)
            if phase == "daily":
                report_days = {d for d in distinct_report_dates() if start <= d <= end}
                for day in iter_days(start, end):
                    if day not in report_days:
                        continue
                    try:
                        r = run_one_daily(
                            day, dry_run=args.dry_run, skip_existing=args.skip_existing
                        )
                        logger.info("[daily] %s -> %s", day, r)
                        after_ai(r)
                    except ValueError as e:
                        logger.warning("[daily] %s 跳过: %s", day, e)
                        skip += 1
                    except Exception as e:
                        fail += 1
                        logger.error("[daily] %s 失败: %s", day, e)
                        traceback.print_exc()

            elif phase == "weekly":
                for sat in iter_saturdays(start, end):
                    try:
                        r = run_one_weekly(
                            sat,
                            dry_run=args.dry_run,
                            skip_existing=args.skip_existing,
                            weekly_by_mtime=args.weekly_by_mtime,
                        )
                        logger.info("[weekly] %s -> %s", sat, r)
                        after_ai(r)
                    except ValueError as e:
                        logger.warning("[weekly] %s 跳过: %s", sat, e)
                        skip += 1
                    except Exception as e:
                        fail += 1
                        logger.error("[weekly] %s 失败: %s", sat, e)
                        traceback.print_exc()

            else:
                for y, m in iter_months(start, end):
                    if not month_has_reports(y, m):
                        logger.info("[monthly] %04d-%02d 无数据，跳过", y, m)
                        skip += 1
                        continue
                    try:
                        r = run_one_monthly(
                            y, m, dry_run=args.dry_run, skip_existing=args.skip_existing
                        )
                        logger.info("[monthly] %04d-%02d -> %s", y, m, r)
                        after_ai(r)
                    except ValueError as e:
                        logger.warning("[monthly] %04d-%02d 跳过: %s", y, m, e)
                        skip += 1
                    except Exception as e:
                        fail += 1
                        logger.error("[monthly] %04d-%02d 失败: %s", y, m, e)
                        traceback.print_exc()

    except KeyboardInterrupt:
        logger.warning("用户中断")

    logger.info("完成：成功=%s 跳过/预检=%s 失败=%s", ok, skip, fail)
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())