"""
汇总指定业务日下各客服的「总结」：优先 analyze/daily AI 总结，否则用日报正文。
"""
from datetime import date
from typing import List

from utils.analyze_storage import daily_summary_path, read_utf8
from utils.file_utils import list_distinct_names_for_date, list_reports_filtered


def collect_day_summaries_for_knowledge(business_day: date) -> str:
    """
    拼接该业务日所有有日报的人员材料，供知识抽取。
    """
    ds = business_day.isoformat()
    names: List[str] = list_distinct_names_for_date(ds)
    if not names:
        raise ValueError(f"日期 {ds} 下没有任何日报")

    blocks: List[str] = []
    for name in sorted(names):
        path = daily_summary_path(name, ds)
        text = read_utf8(path)
        if not text or not str(text).strip():
            reps = list_reports_filtered(name=name, start_date=ds, end_date=ds)
            if reps:
                text = reps[0].get("content") or ""
            else:
                text = ""
        if not str(text).strip():
            continue
        blocks.append(f"=== 客服：{name} | 日期：{ds} ===\n{str(text).strip()}\n")

    if not blocks:
        raise ValueError(f"日期 {ds} 下日报均无可用正文或总结")

    return "\n".join(blocks)
