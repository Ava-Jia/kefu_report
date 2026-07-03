"""Smoke test: write broker_name via update_email and verify persistence."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from models.email import Email, get_session
from services.email_service import update_email


def main():
    with get_session() as session:
        row = session.query(Email).first()
        if row is None:
            print("No email rows to test against.")
            return
        email_id = row.id
        old = row.broker_name

    new_value = "TEST_BROKER_" + os.urandom(3).hex()
    ok = update_email(email_id, {"broker_name": new_value}, operator="test")
    print(f"update_email returned: {ok}")

    with get_session() as session:
        row = session.get(Email, email_id)
        print(f"persisted broker_name: {row.broker_name!r} (expected {new_value!r})")
        assert row.broker_name == new_value, "broker_name did not persist!"

    # restore original value to avoid polluting data
    update_email(email_id, {"broker_name": old}, operator="test", record_log=False)
    print(f"restored broker_name to original: {old!r}")
    print("PASS")


if __name__ == "__main__":
    main()
