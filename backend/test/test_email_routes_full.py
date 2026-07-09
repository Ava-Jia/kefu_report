"""路由层完整覆盖测试：backend/routes/email_routes.py

策略：在 email_routes 模块命名空间上 monkeypatch 其引用的 service 函数，
只验证路由层的参数校验、分支走向、状态码与响应结构，不依赖真实 Redis / SQLite。

注意：/api/email/* 在 app.py 的 _PUBLIC_PATH_PREFIXES 中，属公开路由，无需 token。
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
    # /api/email/* 需鉴权，通过 environ_base 给该 client 的所有请求默认带上 token
    app = create_app()
    app.config["TESTING"] = True
    c = app.test_client()
    c.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {generate_token(user_id=1, username='tester')}"
    return c


def test_requires_auth_without_token():
    # 不带 token 的请求应被 before_request 拦截为 401（/api/email/create 除外）
    app = create_app()
    app.config["TESTING"] = True
    resp = app.test_client().get("/api/email/list")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/email/create —— email_id 分支
# ---------------------------------------------------------------------------
def test_create_invalid_json(client):
    resp = client.post("/api/email/create", data="not-json",
                       content_type="application/json")
    assert resp.status_code == 400


def test_create_missing_id(client):
    # 既无 ordering_id 也无 email_id
    resp = client.post("/api/email/create", json={"foo": "bar"})
    assert resp.status_code == 400


def test_create_by_email_id_success(client, monkeypatch):
    captured = {}
    monkeypatch.setattr(er, "get_email_result", lambda eid: {"id": eid, "subject": "s"})
    monkeypatch.setattr(er, "upsert_emails",
                        lambda records: captured.update(records=records) or len(records))

    resp = client.post("/api/email/create", json={"email_id": "mail-1"})

    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == "mail-1"
    assert captured["records"][0]["id"] == "mail-1"


def test_create_by_email_id_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_result", lambda eid: None)
    resp = client.post("/api/email/create", json={"email_id": "missing"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/email/create —— ordering_id 分支
# ---------------------------------------------------------------------------
def test_create_by_ordering_id_success(client, monkeypatch):
    called = {}
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: "email-1")
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"broker_name": "Broker A"})
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    monkeypatch.setattr(er, "compute_is_done", lambda result: 1)
    monkeypatch.setattr(er, "_merge_mbl_number", lambda eid, mbl: f"OLD,{mbl}")
    monkeypatch.setattr(er, "update_email",
                        lambda eid, fields, operator=None: called.update(
                            eid=eid, fields=fields, operator=operator) or True)
    monkeypatch.setattr(er, "upsert_parser_result_by_ordering_id",
                        lambda oid, pr, **kw: called.update(
                            parser_oid=oid, parser_kwargs=kw) or {})

    resp = client.post("/api/email/create",
                       json={"ordering_id": "o1", "status": "COMPLETED"})

    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body == {"ordering_id": "o1", "email_id": "email-1", "status": "COMPLETED"}
    assert called["fields"] == {"status": "COMPLETED", "is_done": 1, "mbl_number": "OLD,M1"}
    assert called["operator"] == "order_callback"
    assert called["parser_oid"] == "o1"
    assert called["parser_kwargs"]["broker_name"] == "Broker A"
    assert called["parser_kwargs"]["is_done"] == 1
    assert called["parser_kwargs"]["master_bill_no"] == "M1"


def test_create_by_ordering_id_missing_status(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: "email-1")
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"broker_name": "B"})
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    resp = client.post("/api/email/create", json={"ordering_id": "o1"})
    assert resp.status_code == 400


def test_create_by_ordering_id_missing_result(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: "email-1")
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"broker_name": "B"})
    monkeypatch.setattr(er, "get_order_result", lambda oid: None)
    resp = client.post("/api/email/create",
                       json={"ordering_id": "o1", "status": "COMPLETED"})
    assert resp.status_code == 400


def test_create_by_ordering_id_email_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_id_by_ordering_id", lambda oid: None)
    monkeypatch.setattr(er, "get_order_result",
                        lambda oid: {"result": {"masterBillNo": "M1"}})
    resp = client.post("/api/email/create",
                       json={"ordering_id": "o1", "status": "COMPLETED"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/email/upload
# ---------------------------------------------------------------------------
def test_upload_no_file(client):
    resp = client.post("/api/email/upload", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_upload_non_eml(client):
    from io import BytesIO
    data = {"file": (BytesIO(b"x"), "a.txt")}
    resp = client.post("/api/email/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_upload_success(client, monkeypatch):
    from io import BytesIO
    monkeypatch.setattr(er, "upload_file_to_oss", lambda name, content: "https://oss/a.eml")
    monkeypatch.setattr(er, "submit_parse_async", lambda url: {"task_id": "t-1"})

    data = {"file": (BytesIO(b"raw-eml"), "a.eml")}
    resp = client.post("/api/email/upload", data=data, content_type="multipart/form-data")

    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body == {"task_id": "t-1", "eml_url": "https://oss/a.eml"}


def test_upload_submit_failed(client, monkeypatch):
    from io import BytesIO
    monkeypatch.setattr(er, "upload_file_to_oss", lambda name, content: "https://oss/a.eml")
    monkeypatch.setattr(er, "submit_parse_async", lambda url: None)

    data = {"file": (BytesIO(b"raw-eml"), "a.eml")}
    resp = client.post("/api/email/upload", data=data, content_type="multipart/form-data")

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/email/status/<task_id>
# ---------------------------------------------------------------------------
def test_status_success(client, monkeypatch):
    monkeypatch.setattr(er, "email_parse_status", lambda tid: {"status": "done"})
    resp = client.get("/api/email/status/t-1")
    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "done"


def test_status_no_response(client, monkeypatch):
    monkeypatch.setattr(er, "email_parse_status", lambda tid: None)
    resp = client.get("/api/email/status/t-1")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/email/list
# ---------------------------------------------------------------------------
def test_list_success_with_params(client, monkeypatch):
    captured = {}
    monkeypatch.setattr(er, "get_local_emails",
                        lambda **kw: captured.update(kw) or {"total": 0, "items": []})

    resp = client.get("/api/email/list"
                      "?page=2&page_size=10&intent_type1=x&is_check=1&mbl_number=M1&order=asc")

    assert resp.status_code == 200
    assert captured["page"] == 2
    assert captured["page_size"] == 10
    assert captured["intent_type1"] == "x"
    assert captured["is_check"] == 1
    assert captured["mbl_number"] == "M1"
    assert captured["order"] == "asc"


def test_list_defaults(client, monkeypatch):
    captured = {}
    monkeypatch.setattr(er, "get_local_emails",
                        lambda **kw: captured.update(kw) or {"items": []})

    resp = client.get("/api/email/list")

    assert resp.status_code == 200
    assert captured["page"] == 1
    assert captured["page_size"] == 50
    assert captured["is_check"] is None
    assert captured["intent_type1"] is None
    assert captured["order"] == "desc"


# ---------------------------------------------------------------------------
# GET /api/email/<id>/preview
# ---------------------------------------------------------------------------
def test_preview_success(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {
        "ordering_id": "o1", "data_id": 12, "is_check": 1, "subject": "s"})
    monkeypatch.setattr(er, "email_html_attachment", lambda eid: {
        "html_content": "<p>hi</p>", "attachments": [{"name": "a.pdf"}]})
    monkeypatch.setattr(er, "get_parser_result_by_ordering_id",
                        lambda oid: {"parser_result": {"masterBillNo": "M1"}})

    resp = client.get("/api/email/abc/preview")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["html_content"] == "<p>hi</p>"
    assert data["attachments"] == [{"name": "a.pdf"}]
    # 解析结果来自 parser 表，而非邮件行
    assert data["result"] == {"masterBillNo": "M1"}
    assert data["data_id"] == 12
    assert data["subject"] == "s"


def test_preview_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_detail", lambda eid: None)
    resp = client.get("/api/email/missing/preview")
    assert resp.status_code == 404


def test_preview_no_ordering_id_result_none(client, monkeypatch):
    # 邮件没有 ordering_id 时不查 parser 表，result 为 None
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {
        "ordering_id": None, "data_id": 1, "is_check": 0, "subject": "s"})
    monkeypatch.setattr(er, "email_html_attachment", lambda eid: {
        "html_content": None, "attachments": []})

    resp = client.get("/api/email/abc/preview")

    assert resp.status_code == 200
    assert resp.get_json()["data"]["result"] is None


# ---------------------------------------------------------------------------
# GET /api/email/<id>/adjacent
# ---------------------------------------------------------------------------
def test_adjacent_success(client, monkeypatch):
    monkeypatch.setattr(er, "get_next_email_id", lambda data_id, direction: "next-id")
    resp = client.get("/api/email/abc/adjacent?direction=next&data_id=5")
    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == "next-id"


def test_adjacent_invalid_direction(client):
    resp = client.get("/api/email/abc/adjacent?direction=up&data_id=5")
    assert resp.status_code == 400


def test_adjacent_missing_data_id(client):
    resp = client.get("/api/email/abc/adjacent?direction=next")
    assert resp.status_code == 400


def test_adjacent_data_id_not_int(client):
    resp = client.get("/api/email/abc/adjacent?direction=next&data_id=xx")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# PUT /api/email/<id>
# ---------------------------------------------------------------------------
def test_update_empty_body(client):
    resp = client.put("/api/email/abc", json={})
    assert resp.status_code == 400


def test_update_plain_field_success(client, monkeypatch):
    monkeypatch.setattr(er, "update_email", lambda eid, body, operator=None: True)
    resp = client.put("/api/email/abc", json={"subject": "new"})
    assert resp.status_code == 200
    assert resp.get_json()["code"] == 200


def test_update_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "update_email", lambda eid, body, operator=None: False)
    resp = client.put("/api/email/abc", json={"subject": "new"})
    assert resp.status_code == 404


def test_update_parser_result_patch(client, monkeypatch):
    called = {}
    monkeypatch.setattr(er, "get_email_detail",
                        lambda eid: {"ordering_id": "o1", "broker_name": "B"})
    monkeypatch.setattr(er, "get_parser_result_by_ordering_id",
                        lambda oid: {"parser_result": {"masterBillNo": "M1"}})
    monkeypatch.setattr(er, "compute_is_done", lambda merged: 1)
    monkeypatch.setattr(er, "update_email",
                        lambda eid, body, operator=None: called.update(body=body) or True)
    monkeypatch.setattr(er, "upsert_parser_result_by_ordering_id",
                        lambda oid, patch, **kw: called.update(
                            oid=oid, patch=patch, kwargs=kw) or {})

    resp = client.put("/api/email/abc",
                      json={"parser_result": {"grossWeight": "1000 KG"}})

    assert resp.status_code == 200
    assert called["oid"] == "o1"
    assert called["patch"] == {"grossWeight": "1000 KG"}
    assert called["kwargs"]["broker_name"] == "B"
    assert called["kwargs"]["is_done"] == 1
    # 用改动前的 masterBillNo 定位记录，避免定位错行
    assert called["kwargs"]["master_bill_no"] == "M1"
    # 计算出的 is_done 一并写回 email 表
    assert called["body"]["is_done"] == 1


def test_update_parser_result_without_ordering_id(client, monkeypatch):
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"ordering_id": None})
    resp = client.put("/api/email/abc",
                      json={"parser_result": {"grossWeight": "1000 KG"}})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/email/<id>/logs
# ---------------------------------------------------------------------------
def test_logs_success(client, monkeypatch):
    monkeypatch.setattr(er, "get_audit_logs",
                        lambda rid, table_name="email": [{"field_name": "subject"}])
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"ordering_id": None})

    resp = client.get("/api/email/abc/logs")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["code"] == 200
    assert body["data"][0]["field_name"] == "subject"


def test_logs_merges_parser_result_logs(client, monkeypatch):
    def fake_logs(rid, table_name="email"):
        if table_name == "email_parser_result":
            return [{"field_name": "gross_weight", "created_at": "2026-01-02"}]
        return [{"field_name": "subject", "created_at": "2026-01-01"}]

    monkeypatch.setattr(er, "get_audit_logs", fake_logs)
    monkeypatch.setattr(er, "get_email_detail", lambda eid: {"ordering_id": "o1"})

    resp = client.get("/api/email/abc/logs")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert len(data) == 2
    # 按 created_at 倒序合并
    assert data[0]["field_name"] == "gross_weight"


# ---------------------------------------------------------------------------
# PATCH /api/email/<id>/check
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("value", [0, 1, 2])
def test_check_valid(client, monkeypatch, value):
    monkeypatch.setattr(er, "update_email_check", lambda eid, v, operator=None: True)
    resp = client.patch("/api/email/abc/check", json={"is_check": value})
    assert resp.status_code == 200


@pytest.mark.parametrize("value", [3, -1, None])
def test_check_invalid(client, value):
    resp = client.patch("/api/email/abc/check", json={"is_check": value})
    assert resp.status_code == 400


def test_check_not_found(client, monkeypatch):
    monkeypatch.setattr(er, "update_email_check", lambda eid, v, operator=None: False)
    resp = client.patch("/api/email/abc/check", json={"is_check": 1})
    assert resp.status_code == 404
