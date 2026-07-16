"""
POST /api/email/create 集成测试：覆盖新建下单、修改下单、作废下单三种场景。

修改下单 / 作废下单在业务上都要"基于一个已存在的新建单"操作（同一个 mbl/hbl），
所以每种场景都先通过真实的 /email/create 接口新建一个基础订单（1 个 email 请求 +
1 个 order 请求），再针对同一个 mbl/hbl 发起真正要测试的修改/作废请求（同样是 1 个
email 请求 + 1 个 order 请求）。新建场景本身不需要额外基础订单。

三个场景各自独立（各用各的 mbl/hbl），不会相互影响：
    场景一 新建下单：1 组 email+order 请求
    场景二 修改下单：1 组基础新建 email+order 请求 + 1 组修改 email+order 请求
    场景三 作废下单：1 组基础新建 email+order 请求 + 1 组作废 email+order 请求
合计 5 个 email 请求 + 5 个 order 请求，全部通过 Create 接口真实入库
（email 表 + email_parser_result 表），使用 .env 当前配置的数据库（默认生产库）。

用法：
    python scripts/test_email_create_api.py            # 用 Flask test client 直接调用接口
    python scripts/test_email_create_api.py --base-url http://127.0.0.1:5008  # 走真实 HTTP
    python scripts/test_email_create_api.py --yes       # 跳过写库确认提示
"""
import argparse
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from services.email_parser import _get_redis
from services.email_service import get_email_detail
from services.parser_result_service import find_parser_result_by_bill

RUN_TAG = time.strftime("%Y%m%d%H%M%S")
BROKER_NAME = "QA_TEST_BROKER"

POST = None  # 运行时由 build_client() 注入


def _new_id(prefix: str) -> str:
    return f"{prefix}{RUN_TAG}{uuid.uuid4().hex[:6]}"


def _base_parser_result(mbl: str, hbl: str, **overrides) -> dict:
    """构造一份满足 is_done=1（下单成功）必填字段的测试解析结果。"""
    result = {
        "masterBillNo": mbl,
        "houseBillNo": hbl,
        "consigneeName": "TEST CONSIGNEE CO., LTD",
        "consigneeAddress": "1 Test Street, Test City",
        "consigneeTel": "+1-000-0000000",
        "consigneeEmail": "test-consignee@example.com",
        "consigneeFromEmail": "test-consignee@example.com",
        "notifyName": "TEST NOTIFY CO., LTD",
        "notifyAddress": "1 Test Street, Test City",
        "notifyTel": "+1-000-0000000",
        "notifyEmails": "test-notify@example.com",
        "shipperName": "TEST SHIPPER CO., LTD",
        "shipperAddress": "1 Shipper Road, Shipper City",
        "shipperTel": "+1-111-1111111",
        "shipperEmail": "test-shipper@example.com",
        "descriptionOfGoods": "TEST CARGO - AUTOMATED QA",
        "mark": "N/M",
        "pieces": "10",
        "packageUnit": "CTN",
        "grossWeight": "1000",
        "volume": "5",
        "containerType": "40HQ",
        "customerType": "TEST_QA",
        "orderType": "MASTER",
        "summary": "自动化测试数据（test_email_create_api.py 生成，可安全识别/清理）",
    }
    result.update(overrides)
    return result


def _seed_email(email_id: str, ordering_id: str, intent_type2: str, mbl: str) -> None:
    """在 Redis 里写入 /email/create 走 email_id 分支所需的邮件数据。"""
    r = _get_redis()
    record = {
        "id": email_id,
        "date": time.strftime("%a, %d %b %Y %H:%M:%S +0800"),
        "from": "qa-robot@example.com",
        "mbl_number": mbl,
        "intent_type1": "EXCHANGE_OF_PORT",
        "intent_type2": intent_type2,
        "subject": f"[QA] {intent_type2} test for {mbl}",
        "email_summary": f"自动化测试邮件 - {intent_type2}",
        "brokerName": BROKER_NAME,
        "message_id": f"<{uuid.uuid4().hex}@qa.test>",
        "ordering_id": f"ordering_id:{ordering_id}",
        "email_url": "https://example.com/qa-test.eml",
    }
    r.set(f"email_id:{email_id}", json.dumps(record, ensure_ascii=False))


def _seed_order(ordering_id: str, parser_result: dict) -> None:
    """在 Redis 里写入 /email/create 走 ordering_id 分支所需的解析结果。"""
    r = _get_redis()
    r.set(f"ordering_id:{ordering_id}", json.dumps({"result": parser_result}, ensure_ascii=False))


def _post_create(body: dict, label: str) -> dict:
    status, data = POST("/api/email/create", body)
    print(f"[{label}] POST /api/email/create body={body}")
    print(f"    -> status={status} resp={data}")
    assert status == 200, f"{label} 请求失败：status={status} resp={data}"
    assert data.get("code") == 200, f"{label} 业务失败：resp={data}"
    return data


def _create_new_order(mbl: str, hbl: str, tag: str, label: str) -> dict:
    """通过真实 /email/create 接口新建一个订单（1 个 email 请求 + 1 个 order 请求）。"""
    email_id = _new_id(f"qa-{tag}-email-")
    ordering_id = _new_id(f"qa-{tag}-order-")

    _seed_email(email_id, ordering_id, "PRE_ALERT_NEW", mbl)
    _post_create({"email_id": email_id}, f"{label}-email请求")

    _seed_order(ordering_id, _base_parser_result(mbl, hbl))
    _post_create({"ordering_id": ordering_id, "status": "COMPLETED"}, f"{label}-order请求")

    row = find_parser_result_by_bill(mbl, hbl)
    assert row is not None, f"{label} 未写入 email_parser_result"
    assert row["is_done"] == 1, f"{label} is_done 期望 1，实际 {row['is_done']}"
    assert get_email_detail(email_id) is not None, f"{label} 未写入 email 表"
    return {"email_id": email_id, "ordering_id": ordering_id}


def run_new_case() -> dict:
    """场景一：新建下单邮件 —— 1 个 email 请求 + 1 个 order 请求。"""
    print("\n==== 场景一：新建下单 ====")
    mbl = _new_id("TESTNEWMBL")
    hbl = _new_id("TESTNEWHBL")
    new_req = _create_new_order(mbl, hbl, "new", "新建")

    row = find_parser_result_by_bill(mbl, hbl)
    print(f"PASS 新建下单：mbl={mbl} hbl={hbl} is_done={row['is_done']}")
    return {"mbl": mbl, "hbl": hbl, **new_req}


def run_update_case() -> dict:
    """场景二：修改下单邮件 —— 基于同一 mbl/hbl 的新建单之上修改。
    先用真实接口新建基础订单（1 email + 1 order），再对同一 mbl/hbl 发起修改请求（1 email + 1 order）。
    """
    print("\n==== 场景二：修改下单 ====")
    mbl = _new_id("TESTUPDMBL")
    hbl = _new_id("TESTUPDHBL")
    base_req = _create_new_order(mbl, hbl, "upd-base", "修改-前置新建")
    print(f"  前置新建单就绪：mbl={mbl} hbl={hbl} is_done=1")

    email_id = _new_id("qa-upd-email-")
    ordering_id = _new_id("qa-upd-order-")
    _seed_email(email_id, ordering_id, "PRE_ALERT_UPDATE", mbl)
    _post_create({"email_id": email_id}, "修改-email请求")

    updated_result = _base_parser_result(
        mbl, hbl,
        consigneeName="TEST CONSIGNEE CO., LTD (UPDATED)",
        pieces="20",
    )
    _seed_order(ordering_id, updated_result)
    _post_create({"ordering_id": ordering_id, "status": "COMPLETED"}, "修改-order请求")

    row = find_parser_result_by_bill(mbl, hbl)
    assert row is not None, "修改下单未找到对应记录"
    assert row["is_done"] == 3, f"修改下单 is_done 期望 3，实际 {row['is_done']}"
    assert row["parser_result"]["consigneeName"] == "TEST CONSIGNEE CO., LTD (UPDATED)", "修改内容未写入"
    assert get_email_detail(email_id) is not None, "修改下单未写入 email 表"
    print(f"PASS 修改下单：mbl={mbl} hbl={hbl} is_done={row['is_done']}")
    return {"mbl": mbl, "hbl": hbl, "email_id": email_id, "ordering_id": ordering_id,
            "base_email_id": base_req["email_id"], "base_ordering_id": base_req["ordering_id"]}


def run_cancel_case() -> dict:
    """场景三：作废下单邮件 —— 基于同一 mbl/hbl 的新建单之上作废。
    先用真实接口新建基础订单（1 email + 1 order），再对同一 mbl/hbl 发起作废请求（1 email + 1 order）。
    """
    print("\n==== 场景三：作废下单 ====")
    mbl = _new_id("TESTCXLMBL")
    hbl = _new_id("TESTCXLHBL")
    base_req = _create_new_order(mbl, hbl, "cxl-base", "作废-前置新建")
    print(f"  前置新建单就绪：mbl={mbl} hbl={hbl} is_done=1")

    email_id = _new_id("qa-cxl-email-")
    ordering_id = _new_id("qa-cxl-order-")
    _seed_email(email_id, ordering_id, "PRE_ALERT_CANCEL", mbl)
    _post_create({"email_id": email_id}, "作废-email请求")

    _seed_order(ordering_id, _base_parser_result(mbl, hbl))
    _post_create({"ordering_id": ordering_id, "status": "COMPLETED"}, "作废-order请求")

    row = find_parser_result_by_bill(mbl, hbl)
    assert row is not None, "作废下单未找到对应记录"
    assert row["is_done"] == 4, f"作废下单 is_done 期望 4，实际 {row['is_done']}"
    assert get_email_detail(email_id) is not None, "作废下单未写入 email 表"
    print(f"PASS 作废下单：mbl={mbl} hbl={hbl} is_done={row['is_done']}")
    return {"mbl": mbl, "hbl": hbl, "email_id": email_id, "ordering_id": ordering_id,
            "base_email_id": base_req["email_id"], "base_ordering_id": base_req["ordering_id"]}


def build_client(base_url: str | None):
    """有 --base-url 走真实 HTTP；否则用 Flask test client 直接调用接口，无需另起服务进程。"""
    if base_url:
        import requests
        session = requests.Session()
        session.trust_env = False  # 避免走系统代理访问本地/内网服务

        def post(path: str, body: dict):
            resp = session.post(f"{base_url}{path}", json=body, timeout=30)
            try:
                data = resp.json()
            except ValueError:
                data = {"raw": resp.text}
            return resp.status_code, data
        return post

    from app import app as flask_app
    test_client = flask_app.test_client()

    def post(path: str, body: dict):
        resp = test_client.post(path, json=body)
        return resp.status_code, resp.get_json()
    return post


def main():
    parser = argparse.ArgumentParser(description="POST /api/email/create 集成测试（新建/修改/作废）")
    parser.add_argument("--base-url", default=None, help="走真实 HTTP 时的后端地址，如 http://127.0.0.1:5008；不传则用 Flask test client 直接调用")
    parser.add_argument("--yes", action="store_true", help="跳过写库确认提示")
    args = parser.parse_args()

    global POST
    POST = build_client(args.base_url)

    db_url = os.getenv("DATABASE_URL", "")
    db_display = db_url.split("@")[-1] if "@" in db_url else db_url
    print(f"调用方式: {'HTTP -> ' + args.base_url if args.base_url else 'Flask test client（进程内直调）'}")
    print(f"目标数据库: {db_display}")
    if not args.yes:
        confirm = input("即将写入以上数据库，确认继续？(yes/no): ").strip().lower()
        if confirm != "yes":
            print("已取消")
            return

    summary = {}
    try:
        summary["new"] = run_new_case()
        summary["update"] = run_update_case()
        summary["cancel"] = run_cancel_case()
    finally:
        print("\n---- 本次写入的测试数据（broker_name=QA_TEST_BROKER，可用于后续核对/清理）----")
        print(json.dumps(summary, ensure_ascii=False, indent=2))

    print("\n全部场景通过（共 5 个 email 请求 + 5 个 order 请求，含 2 组修改/作废的前置新建单）")


if __name__ == "__main__":
    main()
