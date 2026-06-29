from flask import Blueprint, jsonify, request
from sqlalchemy import select, func, distinct, or_
from sqlalchemy.orm import Session
from db.database import engine
from models import QaKnowledge, Todo
from models.wechat_rag_todo import (
    fetch_todos_grouped_by_action_type,
    list_todos,
    list_todos_by_action_type,
    list_todos_paginated,
)
from schemas import QaKnowledgeItem, TodoItem
from services.faiss_client import (
    delete_vector_by_id,
    insert_vector_by_id,
    update_vector_by_id,
)
import logging
import requests

bp = Blueprint("wechatrag", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


def serialize_todos(rows: list[Todo]) -> list[dict]:
    """序列化 todo 列表。"""
    return [TodoItem.model_validate(row).model_dump() for row in rows]


def _split_query_values(value: str | None) -> list[str]:
    """解析逗号分隔的查询参数，过滤空值。"""
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _insert_qa_to_faiss(item: QaKnowledge) -> None:
    """将新增 QaKnowledge 条目写入远程 FAISS 向量库。"""
    insert_vector_by_id(
        item_id=item.id,
        question=(item.question or "").strip(),
        answer=(item.answer or "").strip(),
        category=(item.category or "").strip(),
    )


def _update_qa_to_faiss(item: QaKnowledge) -> None:
    """将已存在 QaKnowledge 条目更新到远程 FAISS 向量库。"""
    update_vector_by_id(
        item_id=item.id,
        question=(item.question or "").strip(),
        answer=(item.answer or "").strip(),
        category=(item.category or "").strip(),
    )


def _remove_qa_from_faiss(item_id: int) -> None:
    """从远程 FAISS 向量库删除条目；不存在时仅记录日志。"""
    try:
        delete_vector_by_id(item_id)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            logger.warning("FAISS 中不存在 id=%s，跳过删除", item_id)
            return
        raise
    except RuntimeError as e:
        if "不存在" in str(e) or "404" in str(e):
            logger.warning("FAISS 中不存在 id=%s，跳过删除", item_id)
            return
        raise


@bp.route("/items", methods=["GET"])
def get_items():
    """获取QaKnowledge全部"""
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
    """获取QaKnowledge的全部类别"""
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


@bp.route("/todos/categories", methods=["GET"])
def get_todo_categories():
    """获取Todo中某action_type的全部类别，action_type取值为 insert 或 update"""
    action_type = request.args.get("action_type", default=None, type=str)
    if action_type not in ("insert", "update"):
        return jsonify({"code": 400, "message": "action_type 必须是 insert 或 update"}), 400

    try:
        with Session(engine) as session:
            stmt = (
                select(distinct(Todo.category))
                .where(Todo.action_type == action_type)
                .where(Todo.category.isnot(None))
                .where(Todo.is_write != 1)
                .order_by(Todo.category)
            )
            categories = session.execute(stmt).scalars().all()

        return jsonify({
            "code": 200,
            "message": "success",
            "data": categories,
        })
    except Exception as e:
        logger.exception("获取Todo分类失败")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


# 增加一个条目
@bp.route("/items", methods=["POST"])
def add_item():
    """ add QaKnowledge item"""
    try:
        body = request.get_json(silent=True)

        if not body:
            return jsonify({
                "code": 400,
                "message": "请求体必须是JSON"
            }), 400
        
        question = body.get("question")
        answer = body.get("answer")
        category = body.get("category")
        embedding = body.get("embedding")
        status = body.get("status") or "new"

        if not question:
            return jsonify({
                "code": 400,
                "message": "question 不能为空"
            }),400
        
        with Session(engine) as session:
            item = QaKnowledge(
                question = question,
                answer = answer,
                category = category,
                embedding = embedding,
                status = status
            )

            session.add(item)
            session.flush()
            _insert_qa_to_faiss(item)
            session.commit()
            session.refresh(item)

            data = QaKnowledgeItem.model_validate(item).model_dump()

            return jsonify({
                "code": 200,
                "message": "增加成功",
                "data": data,
            })
    except Exception as e:
        logger.exception("增加失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500




# 删除某个条目
@bp.route("/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    """删除QaKnowledge的某个条目"""
    try:
        with Session(engine) as session:
            item = session.get(QaKnowledge, item_id)
            # 没有返回错误
            if item is None:
                return jsonify({
                    "code": 404,
                    "message": "数据不存在"
                }), 404
            
            # 如果有，就删除
            item_id = item.id
            session.delete(item)
            session.commit()

        _remove_qa_from_faiss(item_id)
        return jsonify({
            "code": 200,
            "message": "删除成功"
        })

    except Exception as e:
        logger.exception("删除失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500

# 修改某个条目

@bp.route("/items/<item_id>", methods=["PUT"])
def update_item(item_id):
    """修改QaKnowledge的某个条目"""
    try:
        # body不能为空
        body = request.get_json()
        if not body:
            return jsonify({
                "code": 400,
                "message": "请求体不能为空"
            }), 400
        
        with Session(engine) as session:
            item = session.get(QaKnowledge, item_id)
            # 没有返回错误
            if item is None:
                return jsonify({
                    "code": 404,
                    "message": "数据不存在"
                }), 404
            
            # 如果有，就修改
            if "question" in body:
                item.question = body["question"]
            
            if "answer" in body:
                item.answer = body["answer"]
            if "category" in body:
                item.category = body["category"]

            # 更新状态
            item.status = "updated"
            session.flush()
            _update_qa_to_faiss(item)
            session.commit()
            session.refresh(item)

            data = QaKnowledgeItem.model_validate(item).model_dump()

        return jsonify({
            "code": 200,
            "message": "修改成功",
            "data": data
        })
    
    except Exception as e:
        logger.exception("修改失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500


@bp.route("/todos", methods=["GET"])
def get_todos():
    """按 action_type 提取 todo 数据；支持分页；不传 action_type 时返回 insert/update 分组结果。"""
    action_type = request.args.get("action_type", default=None, type=str)
    status = request.args.get("status", default=None, type=str)
    category = request.args.get("category", default=None, type=str)
    limit = request.args.get("limit", default=None, type=int)
    grouped = request.args.get("grouped", default="false", type=str).lower() == "true"
    page = request.args.get("page", default=None, type=int)
    page_size = request.args.get("page_size", default=None, type=int)

    try:
        if action_type in ("insert", "update") and (page is not None or page_size is not None):
            page = max(1, page or 1)
            page_size = max(1, page_size or 10)
            rows, total = list_todos_paginated(
                action_type,
                page=page,
                page_size=page_size,
                status=status,
                category=category,
            )
            return jsonify({
                "code": 200,
                "message": "查询成功",
                "data": {
                    "list": serialize_todos(rows),
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total": total,
                        "total_pages": (total + page_size - 1) // page_size,
                    },
                },
            })

        if grouped or action_type is None:
            data = fetch_todos_grouped_by_action_type(status=status, limit=limit)
            serialized = {
                key: serialize_todos(rows)
                for key, rows in data.items()
            }
        elif action_type in ("insert", "update"):
            rows = list_todos_by_action_type(action_type, status=status, category=category, limit=limit)
            serialized = serialize_todos(rows)
        else:
            rows = list_todos(action_type=action_type, status=status, category=category, limit=limit)
            serialized = serialize_todos(rows)

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": serialized,
        })
    except Exception as e:
        logger.exception("查询 todo 失败")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/todos/search", methods=["GET"])
def search_todos():
    """按关键词模糊搜索 todo 问题，支持 action_type/status/category 与分页过滤。"""
    keyword = (request.args.get("keyword") or request.args.get("q") or "").strip()
    action_type = (
        request.args.get("action_type")
        or request.args.get("action-type")
        or request.args.get("type")
    )
    category = request.args.get("category", default=None, type=str)
    page = max(1, request.args.get("page", default=1, type=int))
    page_size = max(1, request.args.get("page_size", default=10, type=int))
    offset = (page - 1) * page_size

    statuses = request.args.getlist("status")
    statuses.extend(request.args.getlist("statuses"))
    if not statuses:
        statuses = _split_query_values(request.args.get("status") or request.args.get("statuses"))
    else:
        statuses = [
            value
            for raw in statuses
            for value in _split_query_values(raw)
        ]

    if not keyword:
        return jsonify({"code": 400, "message": "keyword 不能为空"}), 400

    if action_type is not None:
        action_type = action_type.strip()
        if action_type not in ("insert", "update"):
            return jsonify({"code": 400, "message": "action_type 必须是 insert 或 update"}), 400

    try:
        with Session(engine) as session:
            filters = [
                or_(
                    Todo.question.ilike(f"%{keyword}%"),
                    Todo.similar_question.ilike(f"%{keyword}%"),
                )
            ]

            if action_type:
                filters.append(Todo.action_type == action_type)
            if statuses:
                filters.append(Todo.status.in_(statuses))
            if category:
                filters.append(Todo.category == category)
            filters.append(Todo.is_write != 1)

            stmt = (
                select(Todo)
                .where(*filters)
                .order_by(Todo.id.desc())
                .offset(offset)
                .limit(page_size)
            )
            count_stmt = select(func.count()).select_from(Todo).where(*filters)

            rows = session.execute(stmt).scalars().all()
            total = int(session.execute(count_stmt).scalar() or 0)

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": {
                "list": serialize_todos(rows),
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size,
                },
            },
        })
    except Exception as e:
        logger.exception("搜索 todo 失败")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

   
# 删除某个条目
@bp.route("/todos/<todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    """删除todos的某个条目"""
    try:
        with Session(engine) as session:
            todo = session.get(Todo, todo_id)
            # 没有返回错误
            if todo is None:
                return jsonify({
                    "code": 404,
                    "message": "数据不存在"
                }), 404
            
            # 如果有，就删除
            session.delete(todo)
            session.commit()
        return jsonify({
            "code": 200,
            "message": "删除成功"
        })

    except Exception as e:
        logger.exception("删除失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500

# 修改某个条目

@bp.route("/todos/<todo_id>", methods=["PUT"])
def update_todo(todo_id):
    """修改todos的某个条目"""
    try:
        # body不能为空
        body = request.get_json()
        if not body:
            return jsonify({
                "code": 400,
                "message": "请求体不能为空"
            }), 400
        
        with Session(engine) as session:
            todo = session.get(Todo, todo_id)
            # 没有返回错误
            if todo is None:
                return jsonify({
                    "code": 404,
                    "message": "数据不存在"
                }), 404
            
            # 如果有，就修改
            if "question" in body:
                todo.question = body["question"]
            
            if "answer" in body:
                todo.answer = body["answer"]
            if "category" in body:
                todo.category = body["category"]
            if "similar_question" in body:
                todo.similar_question = body["similar_question"]
            if "similar_answer" in body:
                todo.similar_answer = body["similar_answer"]

            session.commit()
            session.refresh(todo)

            data = TodoItem.model_validate(todo).model_dump()

        return jsonify({
            "code": 200,
            "message": "修改成功",
            "data": data
        })
    
    except Exception as e:
        logger.exception("修改失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500

# 将todo中的条目写入到QaKnowledge中
@bp.route("/todos/<todo_id>/writetoqa", methods=["POST"])
def write_todo_to_qa(todo_id):
    """将 todo 条目 写入Qa"""
    try:
        with Session(engine) as session:
            todo = session.get(Todo, todo_id)

            if todo is None:
                return jsonify({
                    "code": 404,
                    "message": "Todo数据不存在"
                }), 404

            if todo.action_type == "update":
                if not todo.qa_id:
                    return jsonify({
                        "code": 400,
                        "message": "待更新条目缺少关联 QA ID"
                    }), 400

                item = session.get(QaKnowledge, todo.qa_id)
                if item is None:
                    return jsonify({
                        "code": 404,
                        "message": "关联的知识库条目不存在"
                    }), 404

                item.question = todo.question
                item.answer = todo.answer
                item.category = todo.category
                if todo.embedding is not None:
                    item.embedding = todo.embedding
                item.status = "updated"
            else:
                item = QaKnowledge(
                    question=todo.question,
                    answer=todo.answer,
                    category=todo.category,
                    embedding=todo.embedding,
                    status="new",
                )
                session.add(item)
                session.flush()
                todo.qa_id = item.id

            todo.is_write = 1
            session.flush()
            if todo.action_type == "update":
                _update_qa_to_faiss(item)
            else:
                _insert_qa_to_faiss(item)
            session.commit()
            session.refresh(item)

            data = QaKnowledgeItem.model_validate(item).model_dump()

            return jsonify({
                "code": 200,
                "message": "写入成功",
                "data": data,
            })
    except Exception as e:
        logger.exception("写入失败")
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500
