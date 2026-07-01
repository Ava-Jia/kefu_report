from sqlalchemy import String, Boolean, DateTime, func, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session
from werkzeug.security import generate_password_hash, check_password_hash

_engine = create_engine("sqlite:///./email.db", connect_args={"check_same_thread": False})


class _Base(DeclarativeBase):
    pass


class User(_Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_at: Mapped[str] = mapped_column(DateTime, server_default=func.now())


_Base.metadata.create_all(_engine)


def get_session() -> Session:
    return Session(_engine)


def verify_user(username: str, password: str) -> User | None:
    with get_session() as session:
        user = session.query(User).filter_by(username=username, is_active=True).first()
        if user and check_password_hash(user.hashed_password, password):
            session.expunge(user)
            return user
    return None
