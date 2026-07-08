import os
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from models.email import AuditLog, Email, get_session  # noqa: E402
from services.email_service import get_audit_logs, update_email  # noqa: E402
from utils.auth import generate_token  # noqa: E402


@pytest.fixture
def email_id():
    email_id = f"test-audit-{uuid.uuid4()}"
    with get_session() as session:
        session.add(Email(id=email_id, subject="old subject", email_summary="old summary"))
        session.commit()

    try:
        yield email_id
    finally:
        with get_session() as session:
            session.query(AuditLog).filter(AuditLog.record_id == email_id).delete()
            session.query(Email).filter(Email.id == email_id).delete()
            session.commit()


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_update_email_writes_audit_logs_for_changed_fields(email_id):
    ok = update_email(
        email_id,
        {"subject": "new subject", "email_summary": "new summary"},
        operator="alice",
    )

    assert ok is True
    logs = get_audit_logs(email_id)
    logs_by_field = {log["field_name"]: log for log in logs}

    assert set(logs_by_field) == {"subject", "email_summary"}
    assert logs_by_field["subject"]["old_value"] == "old subject"
    assert logs_by_field["subject"]["new_value"] == "new subject"
    assert logs_by_field["subject"]["operator"] == "alice"
    assert logs_by_field["email_summary"]["old_value"] == "old summary"
    assert logs_by_field["email_summary"]["new_value"] == "new summary"


def test_update_email_does_not_write_audit_log_when_value_is_unchanged(email_id):
    ok = update_email(email_id, {"subject": "old subject"}, operator="alice")

    assert ok is True
    assert get_audit_logs(email_id) == []


def test_get_audit_logs_returns_newest_first(email_id):
    now = datetime(2026, 7, 2, 10, 30, 0)
    rows = [
        AuditLog(
            table_name="email",
            record_id=email_id,
            field_name="oldest",
            old_value="a",
            new_value="b",
            created_at=now - timedelta(minutes=2),
        ),
        AuditLog(
            table_name="email",
            record_id=email_id,
            field_name="newest",
            old_value="a",
            new_value="b",
            created_at=now,
        ),
        AuditLog(
            table_name="email",
            record_id=email_id,
            field_name="middle",
            old_value="a",
            new_value="b",
            created_at=now - timedelta(minutes=1),
        ),
    ]
    with get_session() as session:
        session.add_all(rows)
        session.commit()

    logs = get_audit_logs(email_id)

    assert [log["field_name"] for log in logs] == ["newest", "middle", "oldest"]


def test_update_email_route_writes_operator_from_token(client, email_id):
    # /api/email/<id> 需鉴权，路由从 token 里取出用户名写入审计日志的 operator
    token = generate_token(user_id=1, username="token-user")

    response = client.put(
        f"/api/email/{email_id}",
        json={"subject": "route subject"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json()["code"] == 200

    logs = get_audit_logs(email_id)
    assert len(logs) == 1
    assert logs[0]["field_name"] == "subject"
    assert logs[0]["old_value"] == "old subject"
    assert logs[0]["new_value"] == "route subject"
    assert logs[0]["operator"] == "token-user"
