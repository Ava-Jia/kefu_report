"""
email_parser_result 表的数据库操作层（增删改查）。
解析结果的每个字段独立成列，出入库时在 camelCase JSON 与列之间做映射。
"""
import json
import logging

from models.email import EmailParserResult, get_session
from services.email_service import write_audit_logs, IS_DONE_VOIDED

logger = logging.getLogger(__name__)


# JSON key（camelCase） -> ORM 列属性（snake_case）
FIELD_MAP = {
    "masterBillNo": "master_bill_no",
    "masterBillNoFromEmail": "master_bill_no_from_email",
    "houseBillNo": "house_bill_no",
    "containerType": "container_type",
    "customerType": "customer_type",
    "collectItem": "collect_item",
    "expenseItem": "expense_item",
    "collectAmountUSD": "collect_amount_usd",
    "shipperName": "shipper_name",
    "shipperAddress": "shipper_address",
    "shipperTel": "shipper_tel",
    "shipperEmail": "shipper_email",
    "consigneeName": "consignee_name",
    "consigneeAddress": "consignee_address",
    "consigneeTel": "consignee_tel",
    "consigneeEmail": "consignee_email",
    "consigneeFromEmail": "consignee_from_email",
    "notifyName": "notify_name",
    "notifyAddress": "notify_address",
    "notifyTel": "notify_tel",
    "notifyEmails": "notify_emails",
    "mark": "mark",
    "pieces": "pieces",
    "descriptionOfGoods": "description_of_goods",
    "packageUnit": "package_unit",
    "grossWeight": "gross_weight",
    "volume": "volume",
    "ctrNumber": "ctr_number",
    "summary": "summary",
    "hblUrl": "hbl_url",
    "orderType": "order_type",
    "isSuspicious": "is_suspicious",
    "agentName": "agent_name",
    "agentEmail": "agent_email",
}
# expenseItem 是嵌套对象，整体以 JSON 字符串落库
_JSON_COLUMNS = {"expense_item"}


def _parse_result_input(parser_result) -> dict:
    """把解析结果（dict 或 JSON 字符串）拆成列属性 -> 值 的字典。"""
    if isinstance(parser_result, str):
        try:
            parser_result = json.loads(parser_result)
        except (TypeError, ValueError):
            parser_result = None
    if not isinstance(parser_result, dict):
        return {}
    fields = {}
    for json_key, column in FIELD_MAP.items():
        if json_key not in parser_result:
            continue
        value = parser_result[json_key]
        if column in _JSON_COLUMNS and value is not None and not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        fields[column] = value
    return fields

def _serialize_one(row: EmailParserResult) -> dict:
    """单条 ORM 转 dict。"""
    parser_result = {}

    for json_key, column in FIELD_MAP.items():
        value = getattr(row, column)

        if column in _JSON_COLUMNS and isinstance(value, str):
            try:
                value = json.loads(value)
            except (TypeError, ValueError):
                pass

        parser_result[json_key] = value

    return {
        "id": row.id,
        "ordering_id": row.ordering_id,
        "broker_name": row.broker_name,
        "is_done": row.is_done,
        "parser_result": parser_result,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _serialize(rows):
    """兼容单条和多条 ORM。"""
    if isinstance(rows, list):
        return [_serialize_one(row) for row in rows]

    return _serialize_one(rows)

def create_parser_result(ordering_id: str | None, parser_result) -> dict:
    with get_session() as session:
        row = EmailParserResult(
            ordering_id=ordering_id,
            **_parse_result_input(parser_result),
        )
        session.add(row)
        session.commit()
        return _serialize(row)


def get_parser_result_by_ordering_id(ordering_id: str) -> list[dict]:
    """按 ordering_id 查询解析结果；不存在返回 None。"""
    with get_session() as session:
        rows = (
            session.query(EmailParserResult)
            .filter(EmailParserResult.ordering_id == ordering_id)
            .order_by(EmailParserResult.id.desc())
            .all()
        )
        return _serialize(rows) if rows else None


def _filter_by_bill(query, master_bill_no: str | None, house_bill_no: str | None):
    """给查询追加 mbl/hbl 过滤：有值精确匹配，无值匹配 NULL/空串。"""
    if master_bill_no:
        query = query.filter(EmailParserResult.master_bill_no == master_bill_no)
    else:
        query = query.filter((EmailParserResult.master_bill_no.is_(None)) | (EmailParserResult.master_bill_no == ""))
    if house_bill_no:
        query = query.filter(EmailParserResult.house_bill_no == house_bill_no)
    else:
        query = query.filter((EmailParserResult.house_bill_no.is_(None)) | (EmailParserResult.house_bill_no == ""))
    return query


def _apply_field_changes(session, row: EmailParserResult, fields: dict, record_id: str, operator: str | None):
    """把 fields 写入 row，仅对有变化的列记审计日志。"""
    changes = []
    for column, value in fields.items():
        old_v = getattr(row, column)
        if old_v == value:
            continue
        changes.append((column, old_v, value))
        setattr(row, column, value)
    if changes:
        write_audit_logs(session, "email_parser_result", record_id, changes, operator)


def upsert_parser_result_in_session(
    session, ordering_id: str, parser_result, broker_name: str | None, is_done: int,
    master_bill_no: str | None = None, house_bill_no: str | None = None, operator: str | None = None,
) -> EmailParserResult:
    """在调用方给定的 session 内执行 upsert（不 commit），便于与其它写入共享同一事务。"""
    query = _filter_by_bill(
        session.query(EmailParserResult).filter(EmailParserResult.ordering_id == ordering_id),
        master_bill_no, house_bill_no,
    )
    row = query.order_by(EmailParserResult.id.desc()).first()

    fields = _parse_result_input(parser_result)
    fields.setdefault("master_bill_no", master_bill_no)
    fields.setdefault("house_bill_no", house_bill_no)
    fields["broker_name"] = broker_name
    fields["is_done"] = is_done
    if row is None:
        row = EmailParserResult(ordering_id=ordering_id, **fields)
        session.add(row)
    else:
        _apply_field_changes(session, row, fields, f"{ordering_id}_{master_bill_no}_{house_bill_no}", operator)
    return row


def upsert_parser_result_by_ordering_id(
    ordering_id: str, parser_result, broker_name: str | None, is_done: int,
    master_bill_no: str | None = None, house_bill_no: str | None = None, operator: str | None = None,
) -> dict:

    with get_session() as session:
        row = upsert_parser_result_in_session(
            session, ordering_id, parser_result, broker_name, is_done,
            master_bill_no = master_bill_no, house_bill_no = house_bill_no, operator = operator,
        )
        session.commit()
        return _serialize(row)

def create_parser_result_by_ordering_id(
    ordering_id, parser_result, broker_name: str | None = None, is_done: int = 0,
    master_bill_no: str | None = None, house_bill_no: str | None = None,
    operator: str | None = None,
):
    """
    如果二级意图是新建下单，就要写入一条parser-result
    并且要更新
    """
    with get_session() as session:
        fields = _parse_result_input(parser_result)
        fields.setdefault("master_bill_no", master_bill_no)
        fields.setdefault("house_bill_no", house_bill_no)
        fields["broker_name"] = broker_name
        fields["is_done"] = is_done
        row = EmailParserResult(ordering_id=ordering_id, **fields)
        session.add(row)
        session.commit()
        return _serialize(row)


def find_parser_result_by_bill(master_bill_no: str | None, house_bill_no: str | None) -> dict | None:
    """新建单前要找是否以前存过该mbl、hbl的订单"""
    if not master_bill_no and not house_bill_no:
        return None
    with get_session() as session:
        row = (
            _filter_by_bill(session.query(EmailParserResult), master_bill_no, house_bill_no)
            .order_by(EmailParserResult.id.desc())
            .first()
        )
        return _serialize(row) if row else None


def update_parser_result_by_bill(
    master_bill_no: str | None, house_bill_no: str | None, parser_result,
    broker_name: str | None, is_done: int, operator: str | None = None,
) -> dict | None:
    """修改单，需要根据mbl和hbl找到其新建单的解析结果"""
    if not master_bill_no and not house_bill_no:
        return None
    with get_session() as session:
        row = (
            _filter_by_bill(session.query(EmailParserResult), master_bill_no, house_bill_no)
            .order_by(EmailParserResult.id.desc())
            .first()
        )
        if row is None:
            logger.warning(
                "update_parser_result_by_bill: 未找到对应新建单，修改内容被丢弃 "
                "master_bill_no=%s house_bill_no=%s", master_bill_no, house_bill_no,
            )
            return None
        fields = _parse_result_input(parser_result)
        fields["broker_name"] = broker_name
        fields["is_done"] = is_done
        _apply_field_changes(
            session, row, fields, f"{row.ordering_id}_{master_bill_no}_{house_bill_no}", operator,
        )
        session.commit()
        return _serialize(row)


def void_parser_result_by_bill(
    master_bill_no: str | None, house_bill_no: str | None, operator: str | None = None,
) -> dict | None:
    """作废单，需要根据mbl和hbl找到新建单的解析结果"""
    if not master_bill_no and not house_bill_no:
        return None
    with get_session() as session:
        row = (
            _filter_by_bill(session.query(EmailParserResult), master_bill_no, house_bill_no)
            .order_by(EmailParserResult.id.desc())
            .first()
        )
        if row is None:
            logger.warning(
                "void_parser_result_by_bill: 未找到对应新建单，作废操作被丢弃 "
                "master_bill_no=%s house_bill_no=%s", master_bill_no, house_bill_no,
            )
            return None
        _apply_field_changes(
            session, row, {"is_done": IS_DONE_VOIDED},
            f"{row.ordering_id}_{master_bill_no}_{house_bill_no}", operator,
        )
        session.commit()
        return _serialize(row)


def update_parser_result(record_id: int, fields: dict) -> dict | None:
    with get_session() as session:
        row = session.get(EmailParserResult, record_id)
        if row is None:
            return None
        if "ordering_id" in fields:
            row.ordering_id = fields["ordering_id"]
        if "parser_result" in fields:
            for column, value in _parse_result_input(fields["parser_result"]).items():
                setattr(row, column, value)
        session.commit()
        return _serialize(row)


def delete_parser_result(record_id: int) -> bool:
    with get_session() as session:
        row = session.get(EmailParserResult, record_id)
        if row is None:
            return False
        session.delete(row)
        session.commit()
        return True

# MBL的解析信息
def get_mbl_order(mbl_number: str) -> list[dict]:
    with get_session() as session:
        rows = (
            session.query(EmailParserResult)
            .filter(EmailParserResult.master_bill_no == mbl_number)
            .all()
        )
        return _serialize(rows)


