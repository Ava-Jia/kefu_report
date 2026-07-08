"""路由层接口测试：backend/routes/email_routes.py

策略：通过 monkeypatch 替换 email_routes 模块内引用的 service 函数，
只验证路由层的参数校验、状态码与响应结构，不依赖真实 Redis / SQLite 数据。
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
import routes.email_routes as er  # noqa: E402
from utils.auth import generate_token  # noqa: E402


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture
def auth_headers():
    token = generate_token(user_id=1, username="tester")
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def test_requires_auth(client):
    resp = client.get("/api/email/list")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/email/create  (公开接口，无需 token)
# ---------------------------------------------------------------------------
def test_create_email_by_email_id(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"id": eid})
    monkeypatch.setattr(er, "upsert_emails", lambda records: len(records))

    resp = client.post("/api/email/create", json={"email_id": "abc"})

    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == "abc"


def test_create_email_missing_email_id(client):
    resp = client.post("/api/email/create", json={})
    assert resp.status_code == 400


def test_create_email_invalid_json(client):
    resp = client.post("/api/email/create", data="not-json",
                       content_type="application/json")
    assert resp.status_code == 400


def test_create_email_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_detail", lambda eid: None)
    resp = client.post("/api/email/create", json={"email_id": "missing"})
    assert resp.status_code == 404


def test_create_email_by_ordering_id_success(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: "email-1")
    monkeypatch.setattr(er, "get_email_detail",
                        lambda eid: {"mbl_number": "OLD", "brokerName": "Broker A"})
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    monkeypatch.setattr(er, "compute_is_done", lambda result: 1)
    monkeypatch.setattr(er, "_merge_mbl_number", lambda eid, mbl: f"OLD,{mbl}")
    called = {}

    def fake_update_email(eid, fields, operator=None, record_log=True):
        called.update(eid=eid, fields=fields, operator=operator, record_log=record_log)
        return True

    def fake_upsert(ordering_id, parser_result, **kwargs):
        called.update(
            parser_ordering_id=ordering_id,
            parser_result=parser_result,
            parser_kwargs=kwargs,
        )
        return {}

    monkeypatch.setattr(er, "update_email", fake_update_email)
    monkeypatch.setattr(er, "upsert_parser_result_by_ordering_id", fake_upsert)

    resp = client.post("/api/email/create",
                       json={"ordering_id": "o1", "status": "done"})

    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["ordering_id"] == "o1"
    assert body["email_id"] == "email-1"
    assert called["fields"] == {"status": "done", "is_done": 1, "mbl_number": "OLD,M1"}
    assert called["operator"] == "order_callback"
    assert called["parser_ordering_id"] == "o1"
    assert called["parser_kwargs"]["broker_name"] == "Broker A"
    assert called["parser_kwargs"]["is_done"] == 1


def test_create_email_ordering_id_missing_status(client, monkeypatch):
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    resp = client.post("/api/email/create", json={"ordering_id": "o1"})
    assert resp.status_code == 400


def test_create_email_ordering_id_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: None)
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    resp = client.post("/api/email/create",
                       json={"ordering_id": "o1", "status": "done"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/email/list
# ---------------------------------------------------------------------------
def test_list_emails_success(client, auth_headers, monkeypatch):
    captured = {}

    def fake_get_local_emails(**kwargs):
        captured.update(kwargs)
        return {"total": 0, "items": []}

    monkeypatch.setattr(er, "get_local_emails", fake_get_local_emails)

    resp = client.get(
        "/api/email/list?page=2&page_size=10&intent_type1=x&is_check=1&mbl_number=M1",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.get_json()["code"] == 200
    assert captured["page"] == 2
    assert captured["page_size"] == 10
    assert captured["intent_type1"] == "x"
    assert captured["is_check"] == 1
    assert captured["mbl_number"] == "M1"


def test_list_emails_defaults(client, auth_headers, monkeypatch):
    captured = {}
    monkeypatch.setattr(er, "get_local_emails",
                        lambda **kw: captured.update(kw) or {"items": []})

    resp = client.get("/api/email/list", headers=auth_headers)

    assert resp.status_code == 200
    assert captured["page"] == 1
    assert captured["page_size"] == 50
    assert captured["is_check"] is None
    assert captured["intent_type1"] is None


# ---------------------------------------------------------------------------
# GET /api/email/<id>/preview
# ---------------------------------------------------------------------------
def test_get_email_preview_success(client, auth_headers, monkeypatch):
    detail = {
        "html_content": "<p>hi</p>",
        "attachments": [{"name": "a.pdf"}],
        "parser_result": {"k": "v"},
        "ordering_id": "order-preview",
        "data_id": 12,
        "is_check": 1,
        "subject": "s",
    }
    monkeypatch.setattr(er, "get_email_full_detail", lambda eid: detail)
    monkeypatch.setattr(
        er,
        "get_parser_result_by_ordering_id",
        lambda oid: {"parser_result": {"k": "v2"}},
    )

    resp = client.get("/api/email/abc/preview", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["html_content"] == "<p>hi</p>"
    assert data["result"] == {"k": "v2"}
    assert data["data_id"] == 12
    assert data["subject"] == "s"


def test_get_email_preview_not_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "get_email_full_detail", lambda eid: None)
    resp = client.get("/api/email/missing/preview", headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/email/<id>/adjacent
# ---------------------------------------------------------------------------
def test_get_adjacent_email_success(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "get_next_email_id", lambda data_id, direction: 99)
    resp = client.get("/api/email/abc/adjacent?direction=next&data_id=5",
                     headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == 99


def test_get_adjacent_email_invalid_direction(client, auth_headers):
    resp = client.get("/api/email/abc/adjacent?direction=up&data_id=5",
                     headers=auth_headers)
    assert resp.status_code == 400


def test_get_adjacent_email_missing_data_id(client, auth_headers):
    resp = client.get("/api/email/abc/adjacent?direction=next",
                     headers=auth_headers)
    assert resp.status_code == 400


def test_get_adjacent_email_data_id_not_int(client, auth_headers):
    resp = client.get("/api/email/abc/adjacent?direction=next&data_id=abc",
                     headers=auth_headers)
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# PUT /api/email/<id>
# ---------------------------------------------------------------------------
def test_update_email_route_success(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "update_email", lambda eid, body, operator=None: True)
    resp = client.put("/api/email/abc", json={"subject": "new"},
                     headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["code"] == 200


def test_update_email_route_not_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "update_email", lambda eid, body, operator=None: False)
    resp = client.put("/api/email/abc", json={"subject": "new"},
                     headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/email/<id>/logs
# ---------------------------------------------------------------------------
def test_get_email_logs_success(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "get_audit_logs", lambda eid: [{"field_name": "subject"}])
    resp = client.get("/api/email/abc/logs", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["code"] == 200
    assert body["data"][0]["field_name"] == "subject"


# ---------------------------------------------------------------------------
# PATCH /api/email/<id>/check
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("value", [0, 1, 2])
def test_update_check_valid_values(client, auth_headers, monkeypatch, value):
    monkeypatch.setattr(er, "update_email_check", lambda eid, v, operator=None: True)
    resp = client.patch("/api/email/abc/check", json={"is_check": value},
                       headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.parametrize("value", [3, -1, None])
def test_update_check_invalid_values(client, auth_headers, value):
    resp = client.patch("/api/email/abc/check", json={"is_check": value},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_update_check_not_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr(er, "update_email_check", lambda eid, v, operator=None: False)
    resp = client.patch("/api/email/abc/check", json={"is_check": 1},
                       headers=auth_headers)
    assert resp.status_code == 404
