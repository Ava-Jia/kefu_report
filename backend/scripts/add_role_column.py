"""Idempotent migration: add email.role column if missing."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import inspect, text

from db.database import engine


def main():
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("email")}

    if "role" in columns:
        print("Column 'role' already exists, nothing to do.")
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE email ADD COLUMN role VARCHAR(50) NULL"))

    print("Column 'role' added successfully.")


if __name__ == "__main__":
    main()
