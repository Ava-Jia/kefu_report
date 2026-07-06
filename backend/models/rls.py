import datetime
from pathlib import Path

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

TASKS_DB_PATH = Path(__file__).resolve().parent.parent / "db" / "tasks.db"

tasks_engine = create_engine(f"sqlite:///{TASKS_DB_PATH}", pool_pre_ping=True)


class TasksBase(DeclarativeBase):
    pass


class RlsResult(TasksBase):
    """RLS 查询结果，按提单号（query_number）记录一行。"""

    __tablename__ = "rls_results"
    __table_args__ = (
        UniqueConstraint("task_id", "query_number", name="uq_rls_results_task_query"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scac_code: Mapped[str | None] = mapped_column(String(20))
    query_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


TasksBase.metadata.create_all(bind=tasks_engine, checkfirst=True)


def get_tasks_session() -> Session:
    return Session(tasks_engine)
