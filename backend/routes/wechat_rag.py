from flask import Blueprint, jsonify, request
from sqlalchemy import select, func, distinct
from sqlalchemy.orm import Session
from data.database import engine
from models import QaKnowledge, Todo
from models.wechat_rag_todo import (
    fetch_todos_grouped_by_action_type,
    list_todos,
    list_todos_by_action_type,
)
from schemas import QaKnowledgeItem, TodoItem
import logging

bp = Blueprint("wechatrag", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


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
            session.commit()
            session.refresh(item)

            return jsonify({
                "code": 200,
                "message": "增加成功"
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
            session.delete(item)
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
    """提取todos表中的数据"""
    """按 action_type 提取 todo 数据；不传 action_type 时返回 insert/update 分组结果。"""
    action_type = request.args.get("action_type", default=None, type=str)
    status = request.args.get("status", default=None, type=str)
    limit = request.args.get("limit", default=None, type=int)
    grouped = request.args.get("grouped", default="false", type=str).lower() == "true"

    try:
        if grouped or action_type is None:
            data = fetch_todos_grouped_by_action_type(status=status, limit=limit)
            serialized = {
                key: [TodoItem.model_validate(row).model_dump() for row in rows]
                for key, rows in data.items()
            }
        elif action_type in ("insert", "update"):
            rows = list_todos_by_action_type(action_type, status=status, limit=limit)
            serialized = [TodoItem.model_validate(row).model_dump() for row in rows]
        else:
            rows = list_todos(action_type=action_type, status=status, limit=limit)
            serialized = [TodoItem.model_validate(row).model_dump() for row in rows]

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": serialized,
        })
    except Exception as e:
        logger.exception("查询 todo 失败")
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

            if "status" in body:
                todo.status = body["status"]
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
