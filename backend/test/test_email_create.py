"""手动探测 POST /api/email/create。

运行前确保 Flask 服务已启动（默认 http://127.0.0.1:5000）：

    python backend/test/test_email_create.py
"""
import requests

BASE_URL = "http://127.0.0.1:5000/api"

REAL_EMAIL_ID = "1c09ed38-d6b2-5806-b1c6-fcd15ece1873"
REAL_ORDERING_ID = "123"


def _print(label: str, resp: requests.Response):
    print(f"\n{'='*50}")
    print(f"[{label}]  {resp.status_code}")
    print(resp.json())


def main():
    cases = [
        ("缺少请求体 → 400", {}),
        ("空 JSON → 400", {"json": {}}),
        (
            "email_id 不存在 → 404",
            {"json": {"email_id": "00000000-0000-0000-0000-000000000000"}},
        ),
        ("email_id 正常写入 → 200", {"json": {"email_id": REAL_EMAIL_ID}}),
        (
            "ordering_id 缺少 status → 400",
            {"json": {"ordering_id": REAL_ORDERING_ID}},
        ),
        (
            "ordering_id 不存在 → 404",
            {"json": {"ordering_id": "999999999", "status": "COMPLETED"}},
        ),
        (
            "ordering_id 更新 COMPLETED → 200",
            {"json": {"ordering_id": REAL_ORDERING_ID, "status": "COMPLETED"}},
        ),
        (
            "ordering_id 更新 FAILED → 200",
            {"json": {"ordering_id": REAL_ORDERING_ID, "status": "FAILED"}},
        ),
        (
            "ordering_id 更新 PENDING_TRACK → 200",
            {"json": {"ordering_id": REAL_ORDERING_ID, "status": "PENDING_TRACK"}},
        ),
    ]
    for label, kwargs in cases:
        _print(label, requests.post(f"{BASE_URL}/email/create", **kwargs))


if __name__ == "__main__":
    main()
