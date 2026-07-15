"""
Email 表的数据库操作层（查询 / 写入 / 审计日志）。
"""
import datetime
import email.utils
import json
import logging

from sqlalchemy.orm import Session

from models.email import Email, AuditLog, CreateFailureLog, get_session
from services.email_parser import get_order_result

_VALID_STATUSES = {"PENDING_TRACK", "COMPLETED", "FAILED"}

_UPDATABLE_FIELDS = {
    "mbl_number", "intent_type1", "subject", "intent_type2",
    "ordering_id", "email_summary", "is_done", "email_url", "status",
    "broker_name", "role",
}

_BJT = datetime.timezone(datetime.timedelta(hours=8))

_IS_DONE_REQUIRED_FIELDS = (
    'masterBillNo', 'houseBillNo',
    'consigneeName', 'consigneeAddress',
  'notifyName', 'notifyAddress',
  'shipperName', 'shipperAddress',
  'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume',
)
_IS_DONE_OTHERS_EMAIL = (
    'consigneeEmail', 'consigneeFromEmail',
)

# is_done 取值：0=待处理 1=新建下单 2=新建失败 3=修改订单 4=作废
IS_DONE_PENDING = 0
IS_DONE_CREATED = 1
IS_DONE_CREATE_FAILED = 2
IS_DONE_MODIFIED = 3
IS_DONE_VOIDED = 4


def normalize_parser_result(parser_result: dict | list | None) -> dict | None:
    """Redis 里的 result 有时是一个只含单个元素的 list，统一拆包成 dict。"""
    if isinstance(parser_result, list):
        return parser_result[0] if parser_result else None
    return parser_result or None


def normalize_parser_results(parser_result: dict | list | None) -> list[dict]:
    """把 Redis 里的 result 统一成 dict 列表：一个 ordering 可能解析出多份结果。"""
    if isinstance(parser_result, list):
        return [r for r in parser_result if isinstance(r, dict)]
    return [parser_result] if isinstance(parser_result, dict) else []


def _is_field_present(value) -> bool:
    if value is None:
        return False
    return str(value).strip() != ""


def compute_is_done(parser_result: dict | list | None) -> int:
    """根据 parser_result 是否已解析出全部关键字段，判定新建下单是否成功。"""
    parser_result = normalize_parser_result(parser_result)
    if not parser_result:
        return IS_DONE_PENDING
    # 先判断必填字段是否全部非缺失值
    ok = True
    for f in _IS_DONE_REQUIRED_FIELDS:
        if not _is_field_present(parser_result.get(f)):
            ok = False
            break
    # 必填字段都不缺时，再要求两个邮件字段至少有一个非空
    if ok:
        has_email = False
        for f in _IS_DONE_OTHERS_EMAIL:
            if _is_field_present(parser_result.get(f)):
                has_email = True
                break
        ok = has_email
    return IS_DONE_CREATED if ok else IS_DONE_CREATE_FAILED


def compute_is_done_multi(results: list[dict]) -> int:
    """多条解析结果汇总到 email 表单行：无结果=待处理，全部齐全=成功，否则失败。"""
    if not results:
        return IS_DONE_PENDING
    for r in results:
        if compute_is_done(r) != IS_DONE_CREATED:
            return IS_DONE_CREATE_FAILED
    return IS_DONE_CREATED

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
    broker_name: str | None = None,
    order: str = "desc",
) -> dict:
    with get_session() as session:
        query = session.query(Email)
        if intent_type1:
            query = query.filter(Email.intent_type1.contains(intent_type1))
        if broker_name:
            query = query.filter(Email.broker_name.contains(broker_name))
        if date_from:
            query = query.filter(Email.date >= date_from)
        if date_to:
            query = query.filter(Email.date <= date_to + " 23:59:59")
        if is_check is not None:
            query = query.filter(Email.is_check == is_check)
        if mbl_number:
            query = query.filter(Email.mbl_number.contains(mbl_number))

        date_order = Email.date.asc() if order == "asc" else Email.date.desc()
        total = query.count()
        items = (
            query
            .order_by(date_order)
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
                    "role": e.role,
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
                    "message_id": e.message_id,
                }
                for e in items
            ],
        }


def upsert_emails(records: list[dict]) -> int:
    if not records:
        return 0
    # 局部导入避免 parser_result_service -> email_service 的循环导入问题。
    from services.parser_result_service import upsert_parser_result_in_session
    parser_result_rows = []
    with get_session() as session:
        for r in records:
            if not r.get("id"):
                continue
            # 获取 parser_result
            raw = r.get("ordering_id") or ""
            ordering_id = raw[12:] or None          # 裸 UUID，移除 ordeing_id:
            if ordering_id:
                parser_result = get_order_result(ordering_id)
                parser_result = parser_result.get("result") if parser_result else None
                results = normalize_parser_results(parser_result)  # 一个 ordering 可能有多份结果
            else:
                results = []
            # email 表单行的 is_done 由多条结果汇总
            is_done = compute_is_done_multi(results)
            broker_name = r.get("brokerName")
            # 每份解析结果单独入库；同一 ordering 下按 (mbl, hbl) 区分为多行
            for one in results:
                parser_result_rows.append({
                    "ordering_id": ordering_id,
                    "parser_result": one,
                    "broker_name": broker_name,
                    "is_done": compute_is_done(one),
                    "master_bill_no": one.get("masterBillNo"),
                    "house_bill_no": one.get("houseBillNo"),
                })
            session.merge(Email(
                id=r["id"],
                date=_to_bjt(r.get("date")),
                from_addr=r.get("from"),
                mbl_number=r.get("mbl_number"),
                intent_type1=r.get("intent_type1"),
                subject=r.get("subject"),
                email_summary=r.get("email_summary"),
                broker_name=broker_name,
                message_id=r.get("message_id") or r.get("messageId"),
                html_content=None,
                attachments=None,
                parser_result=None,
                intent_type2=str(r.get("intent_type2")) if r.get("intent_type2") else None,
                ordering_id=ordering_id,
                email_url=r.get("email_url") or None,
                is_done=is_done,
            ))
        for row in parser_result_rows:
            upsert_parser_result_in_session(
                session,
                row["ordering_id"],
                row["parser_result"],
                broker_name=row["broker_name"],
                is_done=row["is_done"],
                master_bill_no=row["master_bill_no"],
                house_bill_no=row["house_bill_no"],
                operator="email_create",
            )
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


def log_create_failure(
    reason: str,
    status_code: int | None = None,
    ordering_id: str | None = None,
    email_id: str | None = None,
    request_body: dict | None = None,
) -> None:
    """记录一次 /email/create 失败。独立 session 提交，且吞掉自身异常，避免影响主流程返回。"""
    try:
        with get_session() as session:
            session.add(CreateFailureLog(
                ordering_id=ordering_id,
                email_id=email_id,
                request_body=json.dumps(request_body, ensure_ascii=False) if request_body else None,
                reason=reason,
                status_code=status_code,
            ))
            session.commit()
    except Exception:
        logging.getLogger(__name__).exception("log_create_failure error")


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


def get_email_id_by_ordering_id(ordering_id: str):
    """从order-id找到其email解析结果"""
    with get_session() as session:
        row = session.query(Email).filter(Email.ordering_id == ordering_id).first()
        if row is None:
            return None
        return {
            "id": row.id,
            "data_id": row.data_id,
            "date": row.date,
            "role": row.role,
            "from": row.from_addr,
            "mbl_number": row.mbl_number,
            "intent_type1": row.intent_type1,
            "subject": row.subject,
            "intent_type2": row.intent_type2,
            "ordering_id": row.ordering_id,
            "email_summary": row.email_summary,
            "is_done": row.is_done,
            "is_check": row.is_check,
            "email_url": row.email_url,
            "status": row.status,
            "broker_name": row.broker_name,
            "message_id": row.message_id,
        }


def get_email_detail(email_id: str) -> dict | None:
    with get_session() as session:
        row = session.get(Email, email_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "data_id": row.data_id,
            "date": row.date,
            "role": row.role,
            "from": row.from_addr,
            "mbl_number": row.mbl_number,
            "intent_type1": row.intent_type1,
            "subject": row.subject,
            "intent_type2": row.intent_type2,
            "ordering_id": row.ordering_id,
            "email_summary": row.email_summary,
            "is_done": row.is_done,
            "is_check": row.is_check,
            "email_url": row.email_url,
            "status": row.status,
            "broker_name": row.broker_name,
            "message_id": row.message_id,
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

