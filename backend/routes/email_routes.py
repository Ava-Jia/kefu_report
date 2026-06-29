from flask import Blueprint, jsonify
from services.email_parser import get_email_parser
import logging

bp = Blueprint("email", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)

@bp.route("/email/<task_id>", methods=["GET"])
def get_email(task_id):
    """获取该解析任务的详情"""
    try:
        results, _ = get_email_parser(task_id)
        if results is None:
            return jsonify({
                "code": 404,
                "message": "数据不存在"
            }), 404
        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": results
        })
    except Exception as e:
        return jsonify({
            "code": 500,
            "message": "服务器错误",
            "error": str(e)
        }), 500