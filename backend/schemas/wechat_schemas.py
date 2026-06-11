"""
schemas/wechat_schemas.py
"""

from pydantic import BaseModel
from datetime import datetime


class QaKnowledgeItem(BaseModel):
    id: int
    question: str | None
    answer: str | None
    final_answer: str | None
    category: str | None
    status: str | None
    created_at: datetime | None
    updated_at: datetime | None


    model_config = {"from_attributes": True}  # 允许从 ORM 对象直接转换