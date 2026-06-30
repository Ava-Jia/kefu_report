"""查看指定 email_id 在 Redis 中的全部原始数据。"""
import json
from services.email_parser import _get_redis, _json_get

EMAIL_ID = "0d275c0f-ca2b-52cb-8bdb-16bdcf0748b7"

r = _get_redis()
key = f"email_id:{EMAIL_ID}"

raw = r.get(key)
if raw is None:
    print(f"[未找到] key={key} 不存在于 Redis")
else:
    try:
        data = json.loads(raw)
        print(f"[找到] key={key}\n")
        for k, v in data.items():
            val_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else repr(v)
            print(f"  {k}: {val_str}")
    except json.JSONDecodeError:
        print(f"[找到，非 JSON] raw value:\n{raw}")
