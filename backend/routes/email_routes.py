from flask import Blueprint, jsonify, request
from services.email_parser import get_email_id, get_html_content, _json_get, _get_redis, get_order_result
from models.email import upsert_emails, get_local_emails
import logging
import uuid

bp = Blueprint("email", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


@bp.route("/email/ids", methods=["GET"])
def list_email_ids():
    """获取全部 email_id 并同步保存到本地 SQLite。"""
    try:
        ids = get_email_id()

        r = _get_redis()
        records = []
        for email_id in ids:
            data = _json_get(r, f"email_id:{email_id}")
            if data:
                records.append(data)

        saved = upsert_emails(records)
        logger.info("同步完成：共 %d 条，新增 %d 条", len(records), saved)

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": {
                "total": len(ids),
                "saved": saved,
                "ids": ids,
            }
        })
    except Exception as e:
        logger.exception("list_email_ids error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/email/create", methods=["POST"])
def create_email():
    """手动写入一条邮件解析记录。id 不传则自动生成。"""
    try:
        body = request.get_json(force=True) or {}
        if not body.get("id"):
            body["id"] = str(uuid.uuid4())
        saved = upsert_emails([body])
        return jsonify({"code": 200, "message": "写入成功", "data": {"id": body["id"], "saved": saved}})
    except Exception as e:
        logger.exception("create_email error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


# 展示本地的email解析结果
@bp.route("/email/list", methods=["GET"])
def list_emails():
    """分页返回本地 SQLite 中的邮件解析结果。"""
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        intent_type1 = (request.args.get("intent_type1") or "").strip() or None
        date_from = (request.args.get("date_from") or "").strip() or None
        date_to = (request.args.get("date_to") or "").strip() or None
        data = get_local_emails(
            page=page, page_size=page_size,
            intent_type1=intent_type1,
            date_from=date_from, date_to=date_to,
        )
        return jsonify({"code": 200, "message": "查询成功", "data": data})
    except Exception as e:
        logger.exception("list_emails error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# 获取指定的html-content
@bp.route("/email/<email_id>/html", methods=["GET"])
def get_email_html(email_id):
    """从 Redis 获取指定邮件的 html_content。"""
    try:
        html = get_html_content(email_id)
        if html is None:
            return jsonify({"code": 404, "message": "未找到对应邮件或无 HTML 内容"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": {"html_content": html}})
    except Exception as e:
        logger.exception("get_email_html error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500
    

# 获取指定的result
@bp.route("/email/<ordering_id>/result", methods=["GET"])
def get_order(ordering_id):
    try:
        result = get_order_result(ordering_id)
        if result is None:
            return jsonify({"code": 404, "message": "未找到对解析结果"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": {"result": result}})
    except Exception as e:
        logger.exception("get_order_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500
            

