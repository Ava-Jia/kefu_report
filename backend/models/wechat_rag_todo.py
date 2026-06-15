import logging
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from data.database import engine
from models.wechat_rag import Todo

logger = logging.getLogger(__name__)

ActionType = Literal["insert", "update"]


def _build_todo_stmt(
    action_type: str | None = None,
    status: str | None = None,
    limit: int | None = None,
):
    stmt = select(Todo)
    if action_type is not None:
        stmt = stmt.where(Todo.action_type == action_type)
    if status is not None:
        stmt = stmt.where(Todo.status == status)
    stmt = stmt.order_by(Todo.id.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    return stmt


def insert_todo(
    action_type: str,
    question: str,
    answer: str,
    category: str,
    status: str = "pending",
    qa_id: int | None = None,
    similar_question: str | None = None,
    similar_answer: str | None = None,
    reason: str | None = None,
    session: Session | None = None,
) -> int:
    """向 todo 表写入一条待处理记录，返回自增 id。"""
    todo = Todo(
        action_type=action_type,
        question=question,
        answer=answer,
        category=category,
        qa_id=qa_id,
        similar_question=similar_question,
        similar_answer=similar_answer,
        reason=reason,
        status=status,
    )

    if session is not None:
        session.add(todo)
        session.flush()
        return todo.id

    with Session(engine) as db:
        db.add(todo)
        db.commit()
        db.refresh(todo)
        logger.info("todo 已写入: id=%s, action_type=%s", todo.id, action_type)
        return todo.id


def list_todos(
    action_type: str | None = None,
    status: str | None = None,
    limit: int | None = None,
) -> list[Todo]:
    """查询 todo 列表，可按 action_type、status 过滤。"""
    with Session(engine) as db:
        return list(db.execute(_build_todo_stmt(action_type, status, limit)).scalars().all())


def list_todos_by_action_type(
    action_type: ActionType,
    status: str | None = None,
    limit: int | None = None,
) -> list[Todo]:
    """按指定 action_type 提取 todo 数据。"""
    return list_todos(action_type=action_type, status=status, limit=limit)


def fetch_todos_grouped_by_action_type(
    action_types: list[ActionType] | None = None,
    status: str | None = None,
    limit: int | None = None,
) -> dict[str, list[Todo]]:
    """按不同 action_type 分组提取 todo 数据。"""
    types = action_types or ["insert", "update"]
    return {
        action_type: list_todos(action_type=action_type, status=status, limit=limit)
        for action_type in types
    }
