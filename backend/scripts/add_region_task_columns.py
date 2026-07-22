"""Idempotent migration: add email.region / email.task columns if missing."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import inspect, text

from db.database import engine

_NEW_COLUMNS = {
    "region": "VARCHAR(255) NULL",
    "task": "VARCHAR(255) NULL",
}


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("email")}

    missing = {name: ddl for name, ddl in _NEW_COLUMNS.items() if name not in columns}
    if not missing:
        print("Columns 'region' and 'task' already exist, nothing to do.")
        return

    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE email ADD COLUMN `{name}` {ddl}"))
            print(f"Column '{name}' added successfully.")


if __name__ == "__main__":
    main()
