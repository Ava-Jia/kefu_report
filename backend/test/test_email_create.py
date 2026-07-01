"""
测试 POST /api/email/create 的各种场景。
运行前确保 Flask 服务已启动（默认 http://127.0.0.1:5000）。

真实数据：
  email_id     = 1c09ed38-d6b2-5806-b1c6-fcd15ece1873
  ordering_id  = 123（数据库中存为 ordering_id:123）
"""
import requests

BASE_URL = "http://127.0.0.1:5000/api"

REAL_EMAIL_ID    = "1c09ed38-d6b2-5806-b1c6-fcd15ece1873"
REAL_ORDERING_ID = "123"


def _print(label: str, resp: requests.Response):
    print(f"\n{'='*50}")
    print(f"[{label}]  {resp.status_code}")
    print(resp.json())


# ── 场景 1：缺少请求体 → 400 ────────────────────────
resp = requests.post(f"{BASE_URL}/email/create")
_print("缺少请求体 → 400", resp)

# ── 场景 2：空 JSON，两个参数都不传 → 400 ───────────
resp = requests.post(f"{BASE_URL}/email/create", json={})
_print("空 JSON → 400", resp)

# ── 场景 3：email_id 不存在于 Redis → 404 ───────────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"email_id": "00000000-0000-0000-0000-000000000000"},
)
_print("email_id 不存在 → 404", resp)

# ── 场景 4：email_id 正常写入 → 200 ─────────────────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"email_id": REAL_EMAIL_ID},
)
_print("email_id 正常写入 → 200", resp)

# ── 场景 5：ordering_id 不传 status → 400 ───────────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"ordering_id": REAL_ORDERING_ID},
)
_print("ordering_id 缺少 status → 400", resp)

# ── 场景 6：ordering_id 不存在 → 404 ────────────────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"ordering_id": "999999999", "status": "COMPLETED"},
)
_print("ordering_id 不存在 → 404", resp)

# ── 场景 7：ordering_id 正常更新 status=COMPLETED ────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"ordering_id": REAL_ORDERING_ID, "status": "COMPLETED"},
)
_print("ordering_id 更新 COMPLETED → 200", resp)

# ── 场景 8：ordering_id 更新 status=FAILED ───────────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"ordering_id": REAL_ORDERING_ID, "status": "FAILED"},
)
_print("ordering_id 更新 FAILED → 200", resp)

# ── 场景 9：ordering_id 更新 status=PENDING_TRACK ────
resp = requests.post(
    f"{BASE_URL}/email/create",
    json={"ordering_id": REAL_ORDERING_ID, "status": "PENDING_TRACK"},
)
_print("ordering_id 更新 PENDING_TRACK → 200", resp)
