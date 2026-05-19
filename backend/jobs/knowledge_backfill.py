"""
历史数据回填：知识库 QA 抽取（按每个业务日）。

用法：
  python -m jobs.knowledge_backfill --from 2026-04-01 --to 2026-05-18 --delay 3
  python -m jobs.knowledge_backfill --auto --dry-run

Docker：
  docker compose exec -T backend python -m jobs.knowledge_backfill --from 2026-04-01 --to 2026-05-18 --delay 3
"""
from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import date, datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

import logging

from services.ai_service import generate_knowledge_qa_pairs
from utils.knowledge_collect import collect_day_summaries_for_knowledge
from utils.knowledge_storage import append_pending_from_ai

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
    from utils.file_utils import list_report_files, read_report_meta_and_content

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


def main(argv: Optional[List[str]] = None) -> int:
    _setup_logging()
    p = argparse.ArgumentParser(description="历史回填：知识库 QA（逐日）")
    p.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", metavar="YYYY-MM-DD")
    p.add_argument("--auto", action="store_true", help="自动取 reports 日期范围")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--delay", type=float, default=2.0)
    args = p.parse_args(argv)

    if args.auto:
        dates = distinct_report_dates()
        if not dates:
            logger.error("无日报数据")
            return 1
        days = dates
    else:
        if not args.date_from or not args.date_to:
            p.error("请指定 --from / --to 或 --auto")
        start = datetime.strptime(args.date_from, "%Y-%m-%d").date()
        end = datetime.strptime(args.date_to, "%Y-%m-%d").date()
        if start > end:
            logger.error("开始日期不能晚于结束日期")
            return 1
        days = [d for d in distinct_report_dates() if start <= d <= end]

    logger.info("共 %s 个业务日待处理", len(days))
    ok = skip = fail = 0

    for d in days:
        ds = d.isoformat()
        try:
            text = collect_day_summaries_for_knowledge(d)
            if args.dry_run:
                logger.info("[knowledge] %s dry-run，材料约 %s 字符", ds, len(text))
                skip += 1
                continue
            pairs = generate_knowledge_qa_pairs(text)
            n = append_pending_from_ai(pairs)
            logger.info("[knowledge] %s 完成，新增 %s 条", ds, n)
            ok += 1
            if args.delay > 0:
                time.sleep(args.delay)
        except ValueError as e:
            logger.warning("[knowledge] %s 跳过: %s", ds, e)
            skip += 1
        except Exception as e:
            fail += 1
            logger.error("[knowledge] %s 失败: %s", ds, e)
            traceback.print_exc()

    logger.info("完成：成功=%s 跳过=%s 失败=%s", ok, skip, fail)
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())