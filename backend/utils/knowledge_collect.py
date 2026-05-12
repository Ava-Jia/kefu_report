"""
汇总指定业务日下各客服的日报正文（单人 AI 总结已不使用，知识抽取直接读 txt）。
"""
from datetime import date
from typing import List

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
        reps = list_reports_filtered(name=name, start_date=ds, end_date=ds)
        text = (reps[0].get("content") or "") if reps else ""
        if not str(text).strip():
            continue
        blocks.append(f"=== 客服：{name} | 日期：{ds} ===\n{str(text).strip()}\n")

    if not blocks:
        raise ValueError(f"日期 {ds} 下日报均无可用正文或总结")

    return "\n".join(blocks)
