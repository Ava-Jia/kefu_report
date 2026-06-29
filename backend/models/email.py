import datetime
import email.utils

from sqlalchemy import String, Text, DateTime, func, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

_engine = create_engine("sqlite:///./email.db", connect_args={"check_same_thread": False})


class _Base(DeclarativeBase):
    pass


class Email(_Base):
    __tablename__ = "email"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    subject: Mapped[str | None] = mapped_column(Text)
    date: Mapped[str | None] = mapped_column(String(100))
    from_addr: Mapped[str | None] = mapped_column(Text)
    mbl_number: Mapped[str | None] = mapped_column(String(100))
    intent_type1: Mapped[str | None] = mapped_column(String(100))
    intent_type2: Mapped[str | None] = mapped_column(Text)
    email_summary: Mapped[str | None] = mapped_column(Text)
    html_content: Mapped[str | None] = mapped_column(Text)
    email_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())


_Base.metadata.create_all(_engine)


def get_session() -> Session:
    return Session(_engine)


def get_local_emails(page: int = 1, page_size: int = 50) -> dict:
    with get_session() as session:
        total = session.query(Email).count()
        items = (
            session.query(Email)
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
                    "subject": e.subject,
                    "date": e.date,
                    "from": e.from_addr,
                    "mbl_number": e.mbl_number,
                    "intent_type1": e.intent_type1,
                    "intent_type2": e.intent_type2,
                    "email_summary": e.email_summary,
                    "html_content": e.html_content,
                    "email_url": e.email_url,
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
            html = r.get("html_content")
            session.merge(Email(
                id=r["id"],
                subject=r.get("subject"),
                date=_to_bjt(r.get("date")),
                from_addr=r.get("from"),
                mbl_number=r.get("mbl_number"),
                intent_type1=r.get("intent_type1"),
                intent_type2=str(r.get("intent_type2")) if r.get("intent_type2") else None,
                email_summary=r.get("email_summary"),
                html_content=html[0] if isinstance(html, list) and html else html if isinstance(html, str) else None,
                email_url=r.get("email_url"),
            ))
        session.commit()
        return len(records)
