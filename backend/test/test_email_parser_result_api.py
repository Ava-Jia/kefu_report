import json
from datetime import datetime, timedelta

import pytest

import routes.email_routes as email_routes
from models.email import AuditLog, Email, EmailParserResult, get_session
from services.email_service import IS_DONE_CREATED, IS_DONE_CREATE_FAILED
from services.parser_result_service import upsert_parser_result_by_ordering_id


def complete_parser_result(**overrides):
    data = {
        "masterBillNo": "MBL-001",
        "masterBillNoFromEmail": "MBL-EMAIL-001",
        "houseBillNo": "HBL-001",
        "containerType": "40HQ",
        "customerType": "direct",
        "collectItem": "ocean freight",
        "expenseItem": {"oceanFreight": "100.00", "docFee": "20.00"},
        "collectAmountUSD": "120.00",
        "shipperName": "Shipper Ltd",
        "shipperAddress": "1 Shipper Road",
        "shipperTel": "123456",
        "shipperEmail": "shipper@example.com",
        "consigneeName": "Consignee Ltd",
        "consigneeAddress": "2 Consignee Road",
        "consigneeTel": "654321",
        "consigneeEmail": "consignee@example.com",
        "notifyName": "Notify Ltd",
        "notifyAddress": "3 Notify Road",
        "notifyTel": "999999",
        "notifyEmails": "notify@example.com",
        "mark": "N/M",
        "pieces": "10",
        "descriptionOfGoods": "Auto parts",
        "packageUnit": "CTNS",
        "grossWeight": "1000 KG",
        "volume": "12 CBM",
        "ctrNumber": "CONT001",
        "summary": "Booking summary",
        "hblUrl": "https://example.com/hbl.pdf",
        "orderType": "new",
        "isSuspicious": 0,
        "agentName": "Agent Ltd",
        "agentEmail": "agent@example.com",
    }
    data.update(overrides)
    return data


def add_email(email_id="email-1", **overrides):
    fields = {
        "id": email_id,
        "date": "2026-07-07 10:00:00",
        "from_addr": "sender@example.com",
        "mbl_number": None,
        "intent_type1": "booking",
        "subject": "Booking request",
        "intent_type2": None,
        "ordering_id": None,
        "email_summary": "summary",
        "is_done": 0,
        "is_check": 0,
        "email_url": "https://example.com/email",
        "status": None,
        "html_content": "<p>Hello</p>",
        "attachments": None,
        "parser_result": None,
        "broker_name": "Broker A",
        "role": "agent",
    }
    fields.update(overrides)
    with get_session() as session:
        session.add(Email(**fields))
        session.commit()
    return email_id


def get_email_values(email_id):
    with get_session() as session:
        row = session.get(Email, email_id)
        return {
            "id": row.id,
            "ordering_id": row.ordering_id,
            "mbl_number": row.mbl_number,
            "status": row.status,
            "is_done": row.is_done,
            "parser_result": json.loads(row.parser_result) if row.parser_result else None,
        }


def get_parser_row(ordering_id, master_bill_no=None):
    with get_session() as session:
        query = session.query(EmailParserResult).filter(
            EmailParserResult.ordering_id == ordering_id
        )
        if master_bill_no is not None:
            query = query.filter(EmailParserResult.master_bill_no == master_bill_no)
        row = query.order_by(EmailParserResult.id.desc()).first()
        return {
            "ordering_id": row.ordering_id,
            "master_bill_no": row.master_bill_no,
            "house_bill_no": row.house_bill_no,
            "gross_weight": row.gross_weight,
            "expense_item": json.loads(row.expense_item) if row.expense_item else None,
            "broker_name": row.broker_name,
            "is_done": row.is_done,
        }


def get_logs(table_name, record_id):
    with get_session() as session:
        rows = (
            session.query(AuditLog)
            .filter(AuditLog.table_name == table_name, AuditLog.record_id == record_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .all()
        )
        return [
            {
                "field_name": row.field_name,
                "old_value": row.old_value,
                "new_value": row.new_value,
                "operator": row.operator,
            }
            for row in rows
        ]


def test_parser_result_crud_round_trip(client):
    payload = complete_parser_result(masterBillNo="MBL-PR-1")

    create_resp = client.post(
        "/api/parser_result",
        json={"ordering_id": "ord-pr-1", "parser_result": payload},
    )

    assert create_resp.status_code == 200
    created = create_resp.get_json()["data"]
    assert created["ordering_id"] == "ord-pr-1"
    assert created["is_done"] == 0
    assert created["parser_result"]["masterBillNo"] == "MBL-PR-1"
    assert created["parser_result"]["expenseItem"] == {
        "oceanFreight": "100.00",
        "docFee": "20.00",
    }

    record_id = created["id"]
    get_resp = client.get("/api/parser_result/by_ordering/ord-pr-1")
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["id"] == record_id

    update_resp = client.put(
        f"/api/parser_result/{record_id}",
        json={
            "ordering_id": "ord-pr-2",
            "parser_result": {
                "houseBillNo": "HBL-UPDATED",
                "expenseItem": {"amsFee": "35.00"},
            },
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["ordering_id"] == "ord-pr-2"
    assert updated["parser_result"]["masterBillNo"] == "MBL-PR-1"
    assert updated["parser_result"]["houseBillNo"] == "HBL-UPDATED"
    assert updated["parser_result"]["expenseItem"] == {"amsFee": "35.00"}

    delete_resp = client.delete(f"/api/parser_result/{record_id}")
    assert delete_resp.status_code == 200
    assert client.get("/api/parser_result/by_ordering/ord-pr-2").status_code == 404


def test_parser_result_not_found_responses(client):
    assert client.get("/api/parser_result/by_ordering/missing").status_code == 404
    assert client.put("/api/parser_result/999999", json={"ordering_id": "x"}).status_code == 404
    assert client.delete("/api/parser_result/999999").status_code == 404


def test_email_create_by_email_id_writes_local_email_and_computes_status(client, monkeypatch):
    record = {
        "id": "email-create-1",
        "date": "Tue, 07 Jul 2026 05:00:00 +0000",
        "from": "sender@example.com",
        "mbl_number": "MBL-CREATE",
        "intent_type1": "booking",
        "subject": "Create booking",
        "email_summary": "summary",
        "brokerName": "Broker A",
        "html_content": ["<p>Mail</p>"],
        "attachments": [{"name": "booking.pdf"}],
        "ordering_id": "ordering_id:ord-create-1",
        "email_url": "https://example.com/email-create-1",
    }

    monkeypatch.setattr(
        email_routes,
        "get_email_detail",
        lambda email_id: record if email_id == "email-create-1" else None,
    )
    monkeypatch.setattr(
        "services.email_service.get_order_result",
        lambda ordering_id: {"result": complete_parser_result(masterBillNo="MBL-CREATE")},
    )

    resp = client.post("/api/email/create", json={"email_id": "email-create-1"})

    assert resp.status_code == 200
    assert resp.get_json()["data"]["id"] == "email-create-1"
    saved = get_email_values("email-create-1")
    assert saved["ordering_id"] == "ord-create-1"
    assert saved["is_done"] == IS_DONE_CREATED
    assert saved["parser_result"]["masterBillNo"] == "MBL-CREATE"


def test_email_create_ordering_callback_updates_email_and_parser_result(client, monkeypatch):
    add_email(
        "email-callback-1",
        ordering_id="ord-callback-1",
        mbl_number="MBL-OLD",
        broker_name="Broker Callback",
    )
    parser_result = complete_parser_result(masterBillNo="MBL-NEW")

    monkeypatch.setattr(
        email_routes,
        "get_email_detail",
        lambda email_id: {"mbl_number": "MBL-OLD", "brokerName": "Broker Callback"},
    )
    monkeypatch.setattr(
        email_routes,
        "get_order_result",
        lambda ordering_id: {"result": [parser_result]},
    )

    resp = client.post(
        "/api/email/create",
        json={"ordering_id": "ord-callback-1", "status": "COMPLETED"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"] == {
        "ordering_id": "ord-callback-1",
        "email_id": "email-callback-1",
        "status": "COMPLETED",
    }
    saved_email = get_email_values("email-callback-1")
    assert saved_email["status"] == "COMPLETED"
    assert saved_email["is_done"] == IS_DONE_CREATED
    assert saved_email["mbl_number"] == "MBL-OLD,MBL-NEW"

    saved_parser = get_parser_row("ord-callback-1", "MBL-NEW")
    assert saved_parser["house_bill_no"] == "HBL-001"
    assert saved_parser["broker_name"] == "Broker Callback"
    assert saved_parser["is_done"] == IS_DONE_CREATED


def test_email_preview_reads_parser_result_table_instead_of_stale_email_json(client, auth_headers):
    add_email(
        "email-preview-1",
        ordering_id="ord-preview-1",
        parser_result=json.dumps({"masterBillNo": "STALE"}),
        attachments=json.dumps(
            [
                {"name": "visible.pdf"},
                {"name": "inline.png", "content_id": "cid-inline"},
            ]
        ),
    )
    upsert_parser_result_by_ordering_id(
        "ord-preview-1",
        complete_parser_result(masterBillNo="FRESH"),
        broker_name="Broker A",
        is_done=IS_DONE_CREATED,
        master_bill_no="FRESH",
    )

    resp = client.get("/api/email/email-preview-1/preview", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["result"]["masterBillNo"] == "FRESH"
    assert data["attachments"] == [{"name": "visible.pdf"}]


def test_email_update_parser_result_patch_updates_parser_table_and_email_status(
    client, auth_headers
):
    add_email(
        "email-update-1",
        ordering_id="ord-update-1",
        is_done=IS_DONE_CREATE_FAILED,
        broker_name="Broker Update",
    )
    existing = complete_parser_result(masterBillNo="MBL-UP", grossWeight="")
    upsert_parser_result_by_ordering_id(
        "ord-update-1",
        existing,
        broker_name="Broker Update",
        is_done=IS_DONE_CREATE_FAILED,
        master_bill_no="MBL-UP",
    )

    resp = client.put(
        "/api/email/email-update-1",
        json={"parser_result": {"grossWeight": "1000 KG"}},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert get_email_values("email-update-1")["is_done"] == IS_DONE_CREATED

    saved_parser = get_parser_row("ord-update-1", "MBL-UP")
    assert saved_parser["gross_weight"] == "1000 KG"
    assert saved_parser["broker_name"] == "Broker Update"
    assert saved_parser["is_done"] == IS_DONE_CREATED

    parser_logs = {
        log["field_name"]: log
        for log in get_logs("email_parser_result", "ord-update-1")
    }
    assert parser_logs["gross_weight"]["old_value"] == ""
    assert parser_logs["gross_weight"]["new_value"] == "1000 KG"
    assert parser_logs["gross_weight"]["operator"] == "tester"
    assert parser_logs["is_done"]["old_value"] == str(IS_DONE_CREATE_FAILED)
    assert parser_logs["is_done"]["new_value"] == str(IS_DONE_CREATED)

    email_logs = {log["field_name"]: log for log in get_logs("email", "email-update-1")}
    assert email_logs["is_done"]["old_value"] == str(IS_DONE_CREATE_FAILED)
    assert email_logs["is_done"]["new_value"] == str(IS_DONE_CREATED)
    assert email_logs["is_done"]["operator"] == "tester"


def test_email_update_parser_result_without_ordering_id_returns_400(client, auth_headers):
    add_email("email-no-ordering", ordering_id=None)

    resp = client.put(
        "/api/email/email-no-ordering",
        json={"parser_result": {"grossWeight": "1000 KG"}},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.get_json()["code"] == 400


def test_email_logs_merge_email_and_parser_result_logs_newest_first(client, auth_headers):
    add_email("email-logs-1", ordering_id="ord-logs-1")
    now = datetime(2026, 7, 7, 10, 0, 0)
    with get_session() as session:
        session.add_all(
            [
                AuditLog(
                    table_name="email",
                    record_id="email-logs-1",
                    field_name="subject",
                    old_value="old",
                    new_value="new",
                    operator="alice",
                    created_at=now,
                ),
                AuditLog(
                    table_name="email_parser_result",
                    record_id="ord-logs-1",
                    field_name="gross_weight",
                    old_value="",
                    new_value="1000 KG",
                    operator="bob",
                    created_at=now + timedelta(minutes=1),
                ),
            ]
        )
        session.commit()

    resp = client.get("/api/email/email-logs-1/logs", headers=auth_headers)

    assert resp.status_code == 200
    logs = resp.get_json()["data"]
    assert [log["field_name"] for log in logs] == ["gross_weight", "subject"]
    assert [log["operator"] for log in logs] == ["bob", "alice"]


def test_email_list_filters_by_date_check_intent_and_mbl(client, auth_headers):
    add_email(
        "email-list-1",
        date="2026-07-07 10:00:00",
        intent_type1="booking",
        is_check=1,
        mbl_number="MBL-LIST-1",
    )
    add_email(
        "email-list-2",
        date="2026-07-06 10:00:00",
        intent_type1="quote",
        is_check=0,
        mbl_number="MBL-LIST-2",
    )

    resp = client.get(
        "/api/email/list"
        "?date_from=2026-07-07"
        "&date_to=2026-07-07"
        "&intent_type1=book"
        "&is_check=1"
        "&mbl_number=LIST-1",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["total"] == 1
    assert [item["id"] for item in data["items"]] == ["email-list-1"]


def test_email_list_requires_auth(client):
    resp = client.get("/api/email/list")

    assert resp.status_code == 401


@pytest.mark.xfail(
    strict=True,
    reason="当前 email update 会把 JSON 解析错误捕获成 500，接口契约更适合返回 400。",
)
def test_potential_issue_email_update_invalid_json_should_return_400(client, auth_headers):
    resp = client.put(
        "/api/email/email-invalid-json",
        data="{bad-json",
        content_type="application/json",
        headers=auth_headers,
    )

    assert resp.status_code == 400


@pytest.mark.xfail(
    strict=True,
    reason="当前 parser_result create 允许空 body 创建空记录，缺少必填字段校验。",
)
def test_potential_issue_parser_result_create_empty_body_should_return_400(client):
    resp = client.post("/api/parser_result", json={})

    assert resp.status_code == 400


@pytest.mark.xfail(
    strict=True,
    reason="当前 email list 查询参数转换失败会返回 500，接口契约更适合返回 400。",
)
def test_potential_issue_email_list_invalid_is_check_should_return_400(
    client, auth_headers
):
    resp = client.get("/api/email/list?is_check=bad", headers=auth_headers)

    assert resp.status_code == 400
