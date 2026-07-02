import datetime
import email.utils

from sqlalchemy import String, Text, DateTime, Integer, func, create_engine, Boolean, event, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

_engine = create_engine("sqlite:///./data/email.db", connect_args={"check_same_thread": False})


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
    is_check: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    data_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)
    email_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)


class AuditLog(_Base):
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


def _migrate():
    with _engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(email)")).fetchall()]
        if 'data_id' not in cols:
            conn.execute(text("ALTER TABLE email ADD COLUMN data_id INTEGER"))
            conn.execute(text("UPDATE email SET data_id = rowid"))
            conn.commit()
        if 'email_url' not in cols:
            conn.execute(text("ALTER TABLE email ADD COLUMN email_url TEXT"))
            conn.commit()
        if 'status' not in cols:
            conn.execute(text("ALTER TABLE email ADD COLUMN status TEXT"))
            conn.commit()


_Base.metadata.create_all(_engine)
_migrate()


def get_session() -> Session:
    return Session(_engine)


def get_local_emails(
    page: int = 1,
    page_size: int = 50,
    intent_type1: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    is_check: int | None = None,
    mbl_number: str | None = None,
) -> dict:
    with get_session() as session:
        query = session.query(Email)
        if intent_type1:
            query = query.filter(Email.intent_type1.contains(intent_type1))
        if date_from:
            query = query.filter(Email.date >= date_from)
        if date_to:
            query = query.filter(Email.date <= date_to + " 23:59:59")
        if is_check is not None:
            query = query.filter(Email.is_check == is_check)
        if mbl_number:
            query = query.filter(Email.mbl_number.contains(mbl_number))

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
                    "is_check": e.is_check,
                    "data_id": e.data_id,
                    "email_url": e.email_url,
                    "status": e.status,
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
            is_done = 1 if r.get("intent_type1") == "EXCHANGE_OF_PORT" else 0
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
                email_url=r.get("email_url") or None,
                is_done=is_done,
            ))
        session.commit()
        return len(records)


def update_email_check(email_id: str, is_check: int, operator: str | None = None) -> bool:
    if is_check not in (0, 1, 2):
        return False
    with get_session() as session:
        row = session.get(Email, email_id)
        if row is None:
            return False
        old_v = row.is_check
        if old_v != is_check:
            row.is_check = is_check
            write_audit_logs(session, "email", email_id, [("is_check", old_v, is_check)], operator)
        session.commit()
        return True


_VALID_STATUSES = {"PENDING_TRACK", "COMPLETED", "FAILED"}

_UPDATABLE_FIELDS = {
    "mbl_number", "intent_type1", "subject", "intent_type2",
    "ordering_id", "email_summary", "is_done", "email_url", "status",
}


def write_audit_logs(
    session: Session,
    table_name: str,
    record_id: str,
    changes: list[tuple[str, object, object]],
    operator: str | None = None,
) -> None:
    for field_name, old_v, new_v in changes:
        session.add(AuditLog(
            table_name=table_name,
            record_id=record_id,
            field_name=field_name,
            old_value=None if old_v is None else str(old_v),
            new_value=None if new_v is None else str(new_v),
            operator=operator,
        ))


def update_email(email_id: str, fields: dict, operator: str | None = None, record_log: bool = True) -> bool:
    updates = {k: v for k, v in fields.items() if k in _UPDATABLE_FIELDS}
    if "status" in updates and updates["status"] and updates["status"] not in _VALID_STATUSES:
        raise ValueError(f"status 必须为 {_VALID_STATUSES} 之一")
    if not updates:
        return False
    with get_session() as session:
        row = session.get(Email, email_id)
        if row is None:
            return False
        changes = []
        for k, v in updates.items():
            old_v = getattr(row, k)
            if old_v == v:
                continue
            changes.append((k, old_v, v))
            setattr(row, k, v)
        if record_log:
            write_audit_logs(session, "email", email_id, changes, operator)
        session.commit()
        return True


def get_audit_logs(record_id: str, table_name: str = "email") -> list[dict]:
    with get_session() as session:
        rows = (
            session.query(AuditLog)
            .filter(AuditLog.table_name == table_name, AuditLog.record_id == record_id)
            .order_by(AuditLog.created_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "field_name": r.field_name,
                "old_value": r.old_value,
                "new_value": r.new_value,
                "operator": r.operator,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


def get_email_id_by_ordering_id(ordering_id: str) -> str | None:
    with get_session() as session:
        row = session.query(Email).filter(Email.ordering_id == "ordering_id:" + ordering_id).first()
        return row.id if row else None
