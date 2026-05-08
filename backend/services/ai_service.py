"""
OpenAI 兼容 API 封装。
"""
import os
from typing import Optional

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
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"


def analyze_daily_reports(combined_text: str) -> str:
    """
    调用大模型分析拼接后的日报正文。
    """
    model = get_model()
    client = get_client()

    prompt = f"""请分析以下客服日报，并输出：

1. 工作总结
2. 高频问题
3. 客户投诉统计
4. 风险预警
5. 客服情绪分析
6. 值得关注的客户问题

请使用 Markdown 格式输出，条理清晰。

日报内容如下：
{combined_text}
"""

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "你是一名资深客服运营分析专家，擅长从日报中提炼业务洞察。",
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
