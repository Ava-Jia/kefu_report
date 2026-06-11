from flask import Blueprint, jsonify, request
from sqlalchemy import select, func, distinct
from sqlalchemy.orm import Session
from data.database import engine
from models import QaKnowledge
from schemas.wechat_schemas import QaKnowledgeItem
import logging

bp = Blueprint("wechatrag", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


@bp.route("/items", methods=["GET"])
def get_items():
    page = max(1, request.args.get("page", default=1, type=int))
    page_size = max(1, request.args.get("page_size", default=10, type=int))
    category = request.args.get("category", default=None, type=str)
    offset = (page - 1) * page_size

    try:
        with Session(engine) as session:
            stmt = select(QaKnowledge)
            count_stmt = select(func.count()).select_from(QaKnowledge)

            if category:
                stmt = stmt.where(QaKnowledge.category == category)
                count_stmt = count_stmt.where(QaKnowledge.category == category)

            stmt = stmt.order_by(QaKnowledge.id.desc()).offset(offset).limit(page_size)

            data = session.execute(stmt).scalars().all()
            total = session.execute(count_stmt).scalar()

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": {
                "list": [QaKnowledgeItem.model_validate(row).model_dump() for row in data],
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size
                }
            }
        })

    except Exception as e:
        logger.exception("查询失败")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/categories", methods=["GET"])
def get_categories():
    try:
        with Session(engine) as session:
            stmt = select(distinct(QaKnowledge.category)).where(
                QaKnowledge.category.isnot(None)).order_by(
                    QaKnowledge.category)

            categories = session.execute(stmt).scalars().all()

        return jsonify({
            "code": 200,
            "message": "success",
            "data": categories
        })
    except Exception as e:
        logger.exception("获取分类失败")
        return jsonify({"code":500, "message":"服务器错误", "error": str(e)}), 500
    
