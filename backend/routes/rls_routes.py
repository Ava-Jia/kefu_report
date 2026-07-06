import logging

from flask import Blueprint, jsonify, request

from services.rls_service import (
    list_rls_results,
    rls_get_task_result,
    rls_search_async,
)

bp = Blueprint("rls", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


@bp.route("/rls/search", methods=["POST"])
def rls_search():
    """提交 RLS 异步查询任务。"""
    try:
        body = request.get_json(force=True, silent=True)
        if not body:
            return jsonify({"code": 400, "message": "请求体必须为合法 JSON"}), 400
        scac_code = body.get("SCAC_Code")
        query_number = body.get("query_number")
        if not scac_code:
            return jsonify({"code": 400, "message": "缺少 SCAC_Code 参数"}), 400
        if not query_number or not isinstance(query_number, list):
            return jsonify({"code": 400, "message": "query_number 必须为非空数组"}), 400
        result = rls_search_async(scac_code, query_number)
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("rls_search error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/rls/task/<task_id>", methods=["GET"])
def rls_task_result(task_id):
    """根据 task_id 获取 RLS 查询结果。"""
    try:
        result = rls_get_task_result(task_id)
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("rls_task_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/rls/results", methods=["GET"])
def rls_results():
    """列出本地库中的 RLS 查询结果。"""
    try:
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
        result = list_rls_results(limit=limit, offset=offset)
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("rls_results error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500
