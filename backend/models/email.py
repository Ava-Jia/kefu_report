import datetime

from sqlalchemy import String, Text, DateTime, Integer, func, event, text
from sqlalchemy.orm import Mapped, mapped_column, Session

from db.database import Base, engine


class Email(Base):
    __tablename__ = "email"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    date: Mapped[str | None] = mapped_column(String(100))
    from_addr: Mapped[str | None] = mapped_column(Text)
    mbl_number: Mapped[str | None] = mapped_column(Text)
    intent_type1: Mapped[str | None] = mapped_column(String(100))
    subject: Mapped[str | None] = mapped_column(Text)
    intent_type2: Mapped[str | None] = mapped_column(Text)
    ordering_id: Mapped[str | None] = mapped_column(String(100))
    email_summary: Mapped[str | None] = mapped_column(Text)
    # 0=待处理 1=新建下单 2=新建失败 3=修改订单 4=作废
    is_done: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
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
    broker_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)


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


class CreateFailureLog(Base):
    """记录 /email/create 请求失败的详情，便于事后追溯。"""
    __tablename__ = "create_failure_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ordering_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())


class EmailDomainRole(Base):
    """邮件域名对应的 brokerName 和 role。"""
    __tablename__ = "email_domain_role"

    broker_name: Mapped[str | None] = mapped_column("brokerName", String(255), nullable=True)
    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)


class EmailParserResult(Base):
    """按 ordering_id 保存邮件解析结果，每个解析字段独立成列。"""
    __tablename__ = "email_parser_result"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ordering_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    master_bill_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    master_bill_no_from_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    house_bill_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    container_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    customer_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    collect_item: Mapped[str | None] = mapped_column(Text, nullable=True)
    # expenseItem 嵌套对象，整体存 JSON 字符串
    expense_item: Mapped[str | None] = mapped_column(Text, nullable=True)
    collect_amount_usd: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shipper_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipper_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipper_tel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shipper_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consignee_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    consignee_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    consignee_tel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    consignee_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consignee_from_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notify_tel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notify_emails: Mapped[str | None] = mapped_column(Text, nullable=True)
    mark: Mapped[str | None] = mapped_column(Text, nullable=True)
    pieces: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description_of_goods: Mapped[str | None] = mapped_column(Text, nullable=True)
    package_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gross_weight: Mapped[str | None] = mapped_column(String(50), nullable=True)
    volume: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ctr_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    hbl_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_suspicious: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agent_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    broker_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 0=待处理 1=新建下单 2=新建失败 3=修改订单 4=作废
    is_done: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

@event.listens_for(Email, 'before_insert')
def _assign_data_id(mapper, connection, target):
    if target.data_id is None:
        result = connection.execute(text("SELECT COALESCE(MAX(data_id), 0) + 1 FROM email"))
        target.data_id = result.scalar()


Email.__table__.create(bind=engine, checkfirst=True)
AuditLog.__table__.create(bind=engine, checkfirst=True)
CreateFailureLog.__table__.create(bind=engine, checkfirst=True)
EmailDomainRole.__table__.create(bind=engine, checkfirst=True)
EmailParserResult.__table__.create(bind=engine, checkfirst=True)


def get_session() -> Session:
    return Session(engine)
