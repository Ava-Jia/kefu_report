import datetime
import email.utils

from sqlalchemy import String, Text, DateTime, func, create_engine, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

_engine = create_engine("sqlite:///./email.db", connect_args={"check_same_thread": False})


class _Base(DeclarativeBase):
    pass


class Email(_Base):
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


_Base.metadata.create_all(_engine)


def get_session() -> Session:
    return Session(_engine)


def get_local_emails(
    page: int = 1,
    page_size: int = 50,
    intent_type1: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    with get_session() as session:
        query = session.query(Email)
        if intent_type1:
            query = query.filter(Email.intent_type1.contains(intent_type1))
        if date_from:
            query = query.filter(Email.date >= date_from)
        if date_to:
            query = query.filter(Email.date <= date_to + " 23:59:59")

        total = query.count()
        items = (
            query
            .order_by(Email.date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [
                {
                    "id": e.id,
                    "date": e.date,
                    "from": e.from_addr,
                    "mbl_number": e.mbl_number,
                    "intent_type1": e.intent_type1,
                    "is_done": e.is_done,
                    "email_summary": e.email_summary,
                    "subject": e.subject,
                    "intent_type2": e.intent_type2,
                    "ordering_id": e.ordering_id,
                }
                for e in items
            ],
        }


_BJT = datetime.timezone(datetime.timedelta(hours=8))


def _to_bjt(date_str: str | None) -> str | None:
    if not date_str:
        return None
    try:
        dt = email.utils.parsedate_to_datetime(date_str)
        return dt.astimezone(_BJT).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return date_str


def upsert_emails(records: list[dict]) -> int:
    if not records:
        return 0
    with get_session() as session:
        for r in records:
            if not r.get("id"):
                continue
            session.merge(Email(
                id=r["id"],
                date=_to_bjt(r.get("date")),
                from_addr=r.get("from"),
                mbl_number=r.get("mbl_number"),
                intent_type1=r.get("intent_type1"),
                subject=r.get("subject"),
                email_summary=r.get("email_summary"),
                intent_type2=str(r.get("intent_type2")) if r.get("intent_type2") else None,
                ordering_id=r.get("ordering_id") or None,
            ))
        session.commit()
        return len(records)
