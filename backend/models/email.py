import datetime

from sqlalchemy import String, Text, DateTime, Integer, func, Boolean, event, text
from sqlalchemy.orm import Mapped, mapped_column, Session

from db.database import Base, engine


class Email(Base):
    __tablename__ = "email"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    date: Mapped[str | None] = mapped_column(String(100))
    from_addr: Mapped[str | None] = mapped_column(Text)
    mbl_number: Mapped[str | None] = mapped_column(String(100))
    intent_type1: Mapped[str | None] = mapped_column(String(100))
    subject: Mapped[str | None] = mapped_column(Text)
    intent_type2: Mapped[str | None] = mapped_column(Text)
    ordering_id: Mapped[str | None] = mapped_column(String(100))
    email_summary: Mapped[str | None] = mapped_column(Text)
    is_done: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    is_check: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    data_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    email_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachments: Mapped[str | None] = mapped_column(Text, nullable=True)
    parser_result: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(String(50))
    record_id: Mapped[str] = mapped_column(String(64))
    field_name: Mapped[str] = mapped_column(String(100))
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    operator: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())


@event.listens_for(Email, 'before_insert')
def _assign_data_id(mapper, connection, target):
    if target.data_id is None:
        result = connection.execute(text("SELECT COALESCE(MAX(data_id), 0) + 1 FROM email"))
        target.data_id = result.scalar()


Email.__table__.create(bind=engine, checkfirst=True)
AuditLog.__table__.create(bind=engine, checkfirst=True)


def get_session() -> Session:
    return Session(engine)
