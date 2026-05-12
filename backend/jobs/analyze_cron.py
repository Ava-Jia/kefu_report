"""
定时全局分析总结（analyze_summary），由宿主机 crontab + docker compose exec 调用。

时区：Asia/Shanghai

建议 crontab（宿主机，容器名按实际修改）：
  # 每日次日 00:00 — 总结「昨天」业务日日报
  0 0 * * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron daily
  # 每周六 12:00 — 提交时间在上周六12:00与本周六12:00之间（7天窗口）
  0 12 * * 6 cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron weekly
  # 每月1日 00:00 — 总结上一自然月（按日报业务日期）
  0 0 1 * * cd /home/kefu_report && docker compose exec -T backend python -m jobs.analyze_cron monthly
"""
from __future__ import annotations

import argparse
import sys
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo

import logging
from services.ai_service import generate_analyze_global_summary
from utils.analyze_collect import (
    collect_daily_by_report_date,
    collect_monthly_by_report_date,
    collect_weekly_by_submission_window,
    monthly_key_for_month,
    previous_month_year_month,
    weekly_window_sat_to_sat,
    yesterday_report_date,
)
from utils.analyze_storage import write_analyze_markdown

TZ = ZoneInfo("Asia/Shanghai")

logger = logging.getLogger(__name__)

def run_daily(now: datetime | None = None) -> None:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    day = yesterday_report_date(now)
    key = day.isoformat()
    text = collect_daily_by_report_date(day)
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("daily", key, md)
    logger.info(f"{key} 每日总结生成成功")


def run_weekly(now: datetime | None = None) -> None:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    start, end, key = weekly_window_sat_to_sat(now)
    text = collect_weekly_by_submission_window(start, end)
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("weekly", key, md)
    logger.info(f"{key} 每周总结生成成功")


def run_monthly(now: datetime | None = None) -> None:
    now = (now or datetime.now(TZ)).astimezone(TZ)
    y, m = previous_month_year_month(now)
    key = monthly_key_for_month(y, m)
    text = collect_monthly_by_report_date(y, m)
    md = generate_analyze_global_summary(text)
    write_analyze_markdown("monthly", key, md)
    logger.info(f"{key} 每月总结生成成功")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="定时全局分析总结（Cron）")
    p.add_argument(
        "mode",
        choices=("daily", "weekly", "monthly"),
        help="daily=昨日业务日 | weekly=近7天提交窗口 | monthly=上一自然月",
    )
    args = p.parse_args(argv)
    try:
        if args.mode == "daily":
            run_daily()
        elif args.mode == "weekly":
            run_weekly()
        else:
            run_monthly()
        return 0
    except ValueError as e:
        logger.error(f"总结生成失败，跳过: {e}")
        return 0
    except Exception as e:
        traceback.print_exc()
        logger.error(f"总结生成失败: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
