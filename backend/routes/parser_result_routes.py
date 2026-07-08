"""email_parser_result 表的增删改查接口。"""
import logging

from flask import Blueprint, jsonify, request

from services.parser_result_service import (
    create_parser_result,
    update_parser_result,
    delete_parser_result,
    get_parser_result_by_ordering_id,
)

bp = Blueprint("parser_result", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


# POST /api/parser_result：新增一条解析结果
@bp.route("/parser_result", methods=["POST"])
def create():
    try:
        body = request.get_json(force=True, silent=True) or {}
        row = create_parser_result(
            ordering_id=body.get("ordering_id"),
            parser_result=body.get("parser_result"),
        )
        return jsonify({"code": 200, "message": "创建成功", "data": row})
    except Exception as e:
        logger.exception("create parser_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


# GET /api/parser_result/by_ordering/<ordering_id>：按 ordering_id 查询解析结果
@bp.route("/parser_result/by_ordering/<ordering_id>", methods=["GET"])
def get_by_ordering(ordering_id):
    try:
        row = get_parser_result_by_ordering_id(ordering_id)
        if row is None:
            return jsonify({"code": 404, "message": "记录不存在"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": row})
    except Exception as e:
        logger.exception("get parser_result by ordering_id error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


# PUT /api/parser_result/<id>：更新 ordering_id / parser_result
@bp.route("/parser_result/<int:record_id>", methods=["PUT"])
def update(record_id):
    try:
        body = request.get_json(force=True, silent=True) or {}
        row = update_parser_result(record_id, body)
        if row is None:
            return jsonify({"code": 404, "message": "记录不存在"}), 404
        return jsonify({"code": 200, "message": "更新成功", "data": row})
    except Exception as e:
        logger.exception("update parser_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


# DELETE /api/parser_result/<id>：删除单条
@bp.route("/parser_result/<int:record_id>", methods=["DELETE"])
def delete(record_id):
    try:
        ok = delete_parser_result(record_id)
        if not ok:
            return jsonify({"code": 404, "message": "记录不存在"}), 404
        return jsonify({"code": 200, "message": "删除成功"})
    except Exception as e:
        logger.exception("delete parser_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500
