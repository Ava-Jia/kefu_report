from flask import Blueprint, jsonify, request
from services.email_parser import get_email_id, _json_get, _get_redis
from models.email import upsert_emails, get_local_emails
import logging

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

# 展示本地的email解析结果
@bp.route("/email/list", methods=["GET"])
def list_emails():
    """分页返回本地 SQLite 中的邮件解析结果。"""
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        data = get_local_emails(page=page, page_size=page_size)
        return jsonify({"code": 200, "message": "查询成功", "data": data})
    except Exception as e:
        logger.exception("list_emails error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500
