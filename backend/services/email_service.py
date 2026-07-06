"""
Email 表的数据库操作层（查询 / 写入 / 审计日志）。
"""
import datetime
import email.utils
import json

from sqlalchemy.orm import Session

from models.email import Email, AuditLog, get_session
from services.email_parser import get_order_result

_VALID_STATUSES = {"PENDING_TRACK", "COMPLETED", "FAILED"}

_UPDATABLE_FIELDS = {
    "mbl_number", "intent_type1", "subject", "intent_type2",
    "ordering_id", "email_summary", "is_done", "email_url", "status",
    "html_content", "attachments", "parser_result", "broker_name",
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


def _normalize_html_content(html) -> str | None:
    if isinstance(html, list) and html:
        return html[0]
    if isinstance(html, str):
        return html
    return None


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
                    "broker_name": e.broker_name,
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


def upsert_emails(records: list[dict]) -> int:
    if not records:
        return 0
    with get_session() as session:
        for r in records:
            if not r.get("id"):
                continue
            is_done = 1 if r.get("intent_type1") == "EXCHANGE_OF_PORT" else 0
            attachments = r.get("attachments")
            # 获取 parser_result
            ordering_id = r.get("ordering_id") or None
            if ordering_id:
                parser_result = get_order_result(ordering_id)
                parser_result = parser_result.get("result") if parser_result else None
            else:
                parser_result = None
            session.merge(Email(
                id=r["id"],
                date=_to_bjt(r.get("date")),
                from_addr=r.get("from"),
                mbl_number=r.get("mbl_number"),
                intent_type1=r.get("intent_type1"),
                subject=r.get("subject"),
                email_summary=r.get("email_summary"),
                html_content=_normalize_html_content(r.get("html_content")),
                attachments=json.dumps(attachments, ensure_ascii=False) if attachments else None,
                parser_result=json.dumps(parser_result, ensure_ascii=False) if parser_result else None,
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


def _attachment_filter(attachments: list[dict]) -> list[dict]:
    """如果 attachment 中record_id是空，则展示"""
    results = []
    for attachment in attachments:

        if not attachment.get("content_id"):
            results.append(attachment)
    return results


def get_email_detail(email_id: str) -> dict | None:
    with get_session() as session:
        row = session.get(Email, email_id)
        if row is None:
            return None
        attachments = json.loads(row.attachments) if row.attachments else []
        attachments = _attachment_filter(attachments)
        return {
            "id": row.id,
            "data_id": row.data_id,
            "date": row.date,
            "from": row.from_addr,
            "mbl_number": row.mbl_number,
            "intent_type1": row.intent_type1,
            "subject": row.subject,
            "intent_type2": row.intent_type2,
            "ordering_id": row.ordering_id,
            "email_summary": row.email_summary,
            "is_done": row.is_done,
            "is_check": row.is_check,
            "data_id": row.data_id,
            "email_url": row.email_url,
            "status": row.status,
            "html_content": row.html_content,
            "attachments": attachments,
            "parser_result": json.loads(row.parser_result) if row.parser_result else None,
        }

# data_id 是全局唯一的自增排序号，根据当前 data_id 找排序上更靠后/靠前的一条邮件
def get_next_email_id(data_id: int, direction: str) -> str | None:
    with get_session() as session:
        if direction == "next":
            row = (
                session.query(Email)
                .filter(Email.data_id > data_id)
                .order_by(Email.data_id.asc())
                .first()
            )
        elif direction == "prev":
            row = (
                session.query(Email)
                .filter(Email.data_id < data_id)
                .order_by(Email.data_id.desc())
                .first()
            )
        else:
            raise ValueError("direction must be 'next' or 'prev'")
        return row.id if row else None
