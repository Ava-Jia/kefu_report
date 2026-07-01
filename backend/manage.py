import sys
from werkzeug.security import generate_password_hash
from auth_model import get_session, User


def adduser(username: str, password: str):
    with get_session() as session:
        if session.query(User).filter_by(username=username).first():
            print(f"用户 '{username}' 已存在")
            sys.exit(1)
        session.add(User(
            username=username,
            hashed_password=generate_password_hash(password),
        ))
        session.commit()
    print(f"用户 '{username}' 创建成功")


USAGE = """
用法:
  python manage.py adduser <用户名> <密码>
"""

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(USAGE)
        sys.exit(1)

    cmd, *rest = args
    if cmd == "adduser":
        if len(rest) != 2:
            print("用法: python manage.py adduser <用户名> <密码>")
            sys.exit(1)
        adduser(rest[0], rest[1])
    else:
        print(f"未知命令: {cmd}{USAGE}")
        sys.exit(1)
