from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ActionType = Literal["insert", "update"]


class QaKnowledgeItem(BaseModel):
    id: int
    question: str | None
    answer: str | None
    final_answer: str | None
    category: str | None
    status: str | None
    created_at: datetime | None
    updated_at: datetime | None


    model_config = {"from_attributes": True}


class TodoItem(BaseModel):
    id: int
    action_type: ActionType
    question: str
    answer: str
    category: str
    qa_id: int | None = None
    similar_question: str | None = None
    reason: str | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}