import os
import sys
import tempfile
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"sqlite:///{Path(tempfile.gettempdir()) / f'kefu_report_pytest_{os.getpid()}.sqlite'}",
)
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault(
    "LOG_DIR",
    str(Path(tempfile.gettempdir()) / "kefu_report_test_logs"),
)

from app import create_app  # noqa: E402
from utils.auth import generate_token  # noqa: E402


@pytest.fixture(autouse=True)
def clean_email_tables():
    from models.email import (  # noqa: E402
        AuditLog,
        CreateFailureLog,
        Email,
        EmailParserResult,
        get_session,
    )

    def clean():
        with get_session() as session:
            session.query(AuditLog).delete()
            session.query(CreateFailureLog).delete()
            session.query(EmailParserResult).delete()
            session.query(Email).delete()
            session.commit()

    clean()
    try:
        yield
    finally:
        clean()


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture
def auth_headers():
    token = generate_token(user_id=1, username="tester")
    return {"Authorization": f"Bearer {token}"}
