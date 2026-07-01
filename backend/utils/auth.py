import os

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

_SECRET_KEY = os.getenv("SECRET_KEY", "kefu-report-secret-key-change-in-prod")
_SERIALIZER = URLSafeTimedSerializer(_SECRET_KEY)
_TOKEN_MAX_AGE = 7 * 24 * 3600  # 7 天


def generate_token(user_id: int, username: str) -> str:
    return _SERIALIZER.dumps({"id": user_id, "username": username})


def verify_token(token: str) -> dict | None:
    try:
        return _SERIALIZER.loads(token, max_age=_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
