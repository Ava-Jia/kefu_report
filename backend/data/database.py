
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session

# 替换成你的真实配置
engine = create_engine(
    "mysql+pymysql://knowledge:Knowledge2026!@rm-uf6z630tr99ru97czoo.mysql.rds.aliyuncs.com/knowledge_base?charset=utf8mb4",
    pool_pre_ping=True,  # 自动检测断连
)

class Base(DeclarativeBase):
    pass
