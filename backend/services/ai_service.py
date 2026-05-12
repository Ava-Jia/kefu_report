"""
OpenAI 兼容 API 封装。
"""
import json
import os
import re
from typing import Any, Dict, List, Optional
import logging

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logger = logging.getLogger(__name__)

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

    prompt = f"""你是一名“客服团队运营分析助手”。

你的任务是：
基于多位客服、多天的日报内容，
从全局角度提炼团队当前存在的问题、风险、困惑与待推进事项。

注意：
- 不要按“每位客服”分别总结
- 要做“跨客服、跨日期”的聚合分析
- 要把相似问题合并归类
- 要突出“重复出现”“影响范围广”“影响效率”的问题

请输出 Markdown。

# 输出结构

## 全局高频问题 / 困惑 / 待解决事项

## 潜在风险 / 值得关注的趋势


要求：

### 1. 合并同类问题
将表达不同但本质相同的问题合并，例如：
- “客户总问同一个问题”
- “重复解释很耗时间”
- “FAQ不完善”

应归类为：
“FAQ/知识库不足导致重复沟通成本高”

### 2. 按优先级排序
优先输出：
- 出现频率高
- 影响多人
- 阻碍工作效率
- 导致客户不满
- 涉及系统/流程缺陷
的问题。

### 3. 每个问题请包含：

#### 问题标题
一句话概括问题。

#### 问题现象
总结客服具体遇到了什么。

#### 影响
说明对客服效率、客户体验、流程或团队协作的影响。

#### 关联客服
列出涉及该问题的客服姓名。

#### 出现频率（粗略）
使用：
- 高频
- 中频
- 低频

不要编造精确数字。

不要臆造不存在的数据。


---

# 分析要求

请特别关注：

- 重复出现的问题
- 阻碍效率的问题
- 流程问题
- 系统问题
- 知识库缺失
- 沟通协作问题
- 培训问题
- 自动化机会
- 可以沉淀 SOP 的地方

不要输出空泛套话。

不要简单复述日报原文。

尽量提炼“管理层真正需要关注的核心问题”。

输出尽量简洁，不要超过 1000 字。

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


def _extract_json_array(text: str) -> str:
    """
    从文本中提取最像 JSON 数组的部分：
    从第一个 [ 到最后一个 ]
    """
    start = text.find("[")
    end = text.rfind("]")

    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    return text


def _light_json_fix(text: str) -> str:
    """
    轻度 JSON 修复：
    1. 去除末尾多余逗号
       {...,} -> {...}
       [...,] -> [...]
    """

    # 去掉 ,]
    text = re.sub(r",\s*]", "]", text)

    # 去掉 ,}
    text = re.sub(r",\s*}", "}", text)

    return text


def _parse_qa_json_payload(raw: str) -> List[Dict[str, Any]]:
    text = raw.strip()

    # 1. 去 markdown code fence
    if text.startswith("```"):
        text = re.sub(
            r"^```(?:json)?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r"\s*```\s*$", "", text)

    # 2. 提取最像 JSON 数组的部分
    text = _extract_json_array(text)

    # 3. 第一轮直接解析
    try:
        data = json.loads(text)

    except json.JSONDecodeError as e:
        logger.warning(
            "JSON decode failed (first try): %s\nRaw preview: %s",
            e,
            text[:500],
        )

        # 4. 轻度修复后再试
        fixed_text = _light_json_fix(text)

        try:
            data = json.loads(fixed_text)

        except json.JSONDecodeError as e2:
            logger.error(
                "JSON decode failed after fix: %s\nRaw preview: %s",
                e2,
                fixed_text[:500],
            )
            raise ValueError(
                f"模型返回 JSON 解析失败: {e2}"
            ) from e2

    # 5. 兼容多种结构
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for k in ("items", "qa", "pairs", "data", "QAs"):
            v = data.get(k)
            if isinstance(v, list):
                return v

    raise ValueError(
        "模型返回的 JSON 须为数组，或包含 items/qa 等数组字段"
    )


def generate_knowledge_qa_pairs(combined_summaries: str) -> List[Dict[str, str]]:
    """
    从当日各客服总结材料中抽取高价值、可执行的 QA；返回每项含 Q、A、source_name、source_date。
    """
    model = get_model()
    client = get_client()

    prompt = f"""下面是同一日内多位客服的「日报总结/正文」片段，每段开头已标注「客服：姓名 | 日期：YYYY-MM-DD」。

你的任务：提炼**最有执行价值、偏内部经验（insider）、尽量具体**的问答对。要求：
- 不要泛泛的「加强沟通」「提升服务」「优化流程」类空话；
- 不要随机编造；只能依据原文中明确出现的信息生成。不要：补充材料里没有的制度、不要臆测原因、不要编造系统、不要虚构流程
- 每条 QA 必须能对应到某一个明确片段：source_name、source_date 必须与材料中的客服名、日期**完全一致**；
- Q 要像真实业务里会问的具体问题（可含场景、系统名、费用类型等）；
- A 要可操作、可复述给同事照做（步骤、注意点、找谁、改哪里等）；
- 条数控制在 3～10 条；宁缺毋滥，只输出真正有沉淀价值的内容。允许输出 3 条。不要为了凑数量硬写。

**只输出一个 JSON 数组**，不要 Markdown、不要解释、不要额外文字。数组元素格式严格为：
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
        temperature=0.2
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
