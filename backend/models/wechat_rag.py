from sqlalchemy import String, Text, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from data.database import Base
import datetime


class QaKnowledge(Base):
    __tablename__ = "qa_knowledge"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question: Mapped[str | None] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    final_answer: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100))
    embedding: Mapped[str | None] = mapped_column(Text)        
    status: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Todo(Base):
    __tablename__ = "todo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action_type: Mapped[str] = mapped_column(String(20))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(255), default="")
    qa_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    similar_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
