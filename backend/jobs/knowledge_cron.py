"""
知识库 QA 定时任务：从指定业务日各客服「总结/正文」抽取高价值 QA，写入未存档列表。

时区：Asia/Shanghai

默认业务日：昨天（与「次日 0 点跑昨日」一致）。若要在当天晚间跑「本日」，请传 --today 或 --date YYYY-MM-DD。

crontab 示例：
  30 0 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.knowledge_cron
  # 或每天 23:40 跑当天：
  40 23 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.knowledge_cron --today
"""
from __future__ import annotations

import argparse
import os
import sys
import traceback
from datetime import date, datetime
from zoneinfo import ZoneInfo

from services.ai_service import generate_knowledge_qa_pairs
from utils.analyze_collect import yesterday_report_date
from utils.knowledge_collect import collect_day_summaries_for_knowledge
from utils.knowledge_storage import append_pending_from_ai

TZ = ZoneInfo("Asia/Shanghai")


def _parse_env_date() -> date | None:
    raw = (os.getenv("KNOWLEDGE_BUSINESS_DATE") or "").strip()
    if not raw:
        return None
    return datetime.strptime(raw, "%Y-%m-%d").date()


def resolve_business_date(args: argparse.Namespace) -> date:
    env_d = _parse_env_date()
    if env_d is not None:
        return env_d
    if getattr(args, "date", None):
        return datetime.strptime(args.date, "%Y-%m-%d").date()
    if args.today:
        return datetime.now(TZ).date()
    return yesterday_report_date(datetime.now(TZ))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="知识库 QA 抽取（Cron）")
    p.add_argument(
        "--today",
        action="store_true",
        help="业务日=上海当天（适合晚间 cron）",
    )
    p.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="指定业务日",
    )
    args = p.parse_args(argv)
    try:
        d = resolve_business_date(args)
        text = collect_day_summaries_for_knowledge(d)
        pairs = generate_knowledge_qa_pairs(text)
        n = append_pending_from_ai(pairs)
        print(f"[knowledge_cron] OK business_date={d.isoformat()} added={n}")
        return 0
    except ValueError as e:
        print(f"[knowledge_cron] skip: {e}", file=sys.stderr)
        return 0
    except Exception as e:
        traceback.print_exc()
        print(f"[knowledge_cron] FAIL: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
