"""
OpenAI 兼容 API 封装。
"""
import json
import os
import re
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()


def get_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    if not api_key:
        raise ValueError("未配置 OPENAI_API_KEY，请在 backend/.env 中设置")
    return OpenAI(api_key=api_key, base_url=base_url)


def get_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-5-mini").strip() or "gpt-5-mini"


def generate_analyze_global_summary(combined_text: str) -> str:
    """
    全局总结：高频问题 / 困惑 / 待解决项及涉及人员（不按单人拆分输出）。
    """
    model = get_model()
    client = get_client()

    prompt = f"""基于以下客服日报汇总（含多位客服、多日），请输出**全局**问题总结（不要做每人一小节）。

请使用 Markdown，包含：
1. **高频问题 / 困惑 / 待解决事项**（合并归纳，按出现频率或影响排序）
2. **主要涉及哪些客服**（姓名列表；若某问题可关联到人请简要标注）

若某些信息在日报中缺失，请如实说明，不要臆造。

---
日报汇总：
{combined_text}
"""

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "你是一名海运客服运营与知识管理专家，擅长从多份日报中归纳共性问题并标注来源人员。",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    choice = completion.choices[0]
    content: Optional[str] = choice.message.content
    if content is None:
        raise RuntimeError("模型返回内容为空")
    return content.strip()


def _parse_qa_json_payload(raw: str) -> List[Dict[str, Any]]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)
    data = json.loads(text)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("items", "qa", "pairs", "data", "QAs"):
            v = data.get(k)
            if isinstance(v, list):
                return v
    raise ValueError("模型返回的 JSON 须为数组，或包含 items/qa 等数组字段")


def generate_knowledge_qa_pairs(combined_summaries: str) -> List[Dict[str, str]]:
    """
    从当日各客服总结材料中抽取高价值、可执行的 QA；返回每项含 Q、A、source_name、source_date。
    """
    model = get_model()
    client = get_client()

    prompt = f"""下面是同一业务日内多位客服的「日报总结/正文」片段，每段开头已标注「客服：姓名 | 日期：YYYY-MM-DD」。

你的任务：提炼**最有执行价值、偏内部经验（insider）、尽量具体**的问答对。要求：
- 不要泛泛的「加强沟通」「提升服务」「优化流程」类空话；
- 不要随机编造；只能依据材料中可支撑的事实与做法；
- 每条 QA 必须能对应到某一个明确片段：source_name、source_date 必须与材料中的客服名、日期**完全一致**；
- Q 要像真实业务里会问的具体问题（可含场景、系统名、费用类型等）；
- A 要可操作、可复述给同事照做（步骤、注意点、找谁、改哪里等）；
- 条数控制在 3～10 条；宁缺毋滥。

**只输出一个 JSON 数组**，不要 Markdown、不要解释。数组元素格式严格为：
[
  {{"Q":"...","A":"...","source_name":"姓名","source_date":"YYYY-MM-DD"}},
  ...
]

举例：
[
    {{
    "Q":"对于未下单公司的下单信息推送，一些公司的常用shipper名存在变化，出现信息推送错误情况，怎么办？",
    "A":"对此下单预警设置里的信息备注应当及时更新，如不确定的进行删除",
    "source_name":"姓名",
    "source_date":"YYYY-MM-DD"
    }},{{
    "Q":"针对 DEM 费用争议及 AN 费用取消，有什么注意点",
    "A":"需尽快跟进上层代理回复，明确费用承担方式。比如起运港订舱口那边预付的 要和上层代理核实。",
    "source_name":"姓名",
    "source_date":"YYYY-MM-DD"
    }}
]

材料：
---
{combined_summaries}
"""

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "你只输出合法 JSON 数组，键名必须为 Q、A、source_name、source_date。",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )

    choice = completion.choices[0]
    content: Optional[str] = choice.message.content
    if content is None:
        raise RuntimeError("模型返回内容为空")

    arr = _parse_qa_json_payload(content)
    out: List[Dict[str, str]] = []
    for row in arr:
        if not isinstance(row, dict):
            continue
        q = str(row.get("Q") or row.get("q") or "").strip()
        a = str(row.get("A") or row.get("a") or "").strip()
        sn = str(row.get("source_name") or row.get("sourceName") or "").strip()
        sd = str(row.get("source_date") or row.get("sourceDate") or "").strip()
        if not q or not a:
            continue
        out.append({"Q": q, "A": a, "source_name": sn, "source_date": sd})
    if not out:
        raise ValueError("模型未返回任何有效 QA")
    return out
