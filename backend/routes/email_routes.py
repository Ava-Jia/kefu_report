from flask import Blueprint, jsonify, request, g
from services.email_parser import get_email_id, _json_get, _get_redis, get_email_detail, get_order_result
from services.email_service import (
    upsert_emails, get_local_emails, update_email_check, update_email,
    get_email_id_by_ordering_id, get_audit_logs,
    get_email_detail as get_email_full_detail,
    get_next_email_id, compute_is_done, normalize_parser_result,
    log_create_failure,
)
from services.parser_result_service import upsert_parser_result_by_ordering_id
import json
import logging

bp = Blueprint("email", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)

# POST /api/email/create：按 email_id 或 ordering_id 写入/更新本地邮件记录。
@bp.route("/email/create", methods=["POST"])
def create_email():
    """
    从 Redis 获取指定 email_id 的邮件详情，并写入本地 SQLite。
    如果传的是 ordering_id, 则不仅要拿解析结果，还要将order_id写到对应的email_id的记录中。
    """
    body = None
    try:
        body = request.get_json(force=True, silent=True)
        if not body:
            log_create_failure("请求体必须为合法 JSON", status_code=400)
            return jsonify({"code": 400, "message": "请求体必须为合法 JSON"}), 400
        # 处理 ordering_id 的情况
        ordering_id = body.get("ordering_id")
        if ordering_id:
            return _create_by_ordering_id(body, ordering_id)

        # 处理 email_id 的情况
        email_id = body.get("email_id")
        if not email_id:
            log_create_failure("缺少 email_id 参数", status_code=400, request_body=body)
            return jsonify({"code": 400, "message": "缺少 email_id 参数"}), 400
        return _create_by_email_id(body, email_id)
    except Exception as e:
        logger.exception("create_email error")
        log_create_failure(f"服务器错误: {e}", status_code=500,
                           ordering_id=(body or {}).get("ordering_id") if isinstance(body, dict) else None,
                           email_id=(body or {}).get("email_id") if isinstance(body, dict) else None,
                           request_body=body if isinstance(body, dict) else None)
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/email/list：分页查询本地邮件解析结果，支持条件过滤。
@bp.route("/email/list", methods=["GET"])
def list_emails():
    """分页返回本地 SQLite 中的邮件解析结果。"""
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        intent_type1 = (request.args.get("intent_type1") or "").strip() or None
        date_from = (request.args.get("date_from") or "").strip() or None
        date_to = (request.args.get("date_to") or "").strip() or None
        is_check_raw = request.args.get("is_check")
        is_check = int(is_check_raw) if is_check_raw is not None and is_check_raw != "" else None
        mbl_number = (request.args.get("mbl_number") or "").strip() or None
        data = get_local_emails(
            page=page, page_size=page_size,
            intent_type1=intent_type1,
            date_from=date_from, date_to=date_to,
            is_check=is_check,
            mbl_number=mbl_number,
        )
        return jsonify({"code": 200, "message": "查询成功", "data": data})
    except Exception as e:
        logger.exception("list_emails error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/email/<email_id>/preview：获取邮件预览所需的 html、附件和解析结果。
@bp.route("/email/<email_id>/preview", methods=["GET"])
def get_email_preview(email_id):
    try:
        detail = get_email_full_detail(email_id)
        if detail is None:
            return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
        # attachments中需要过滤一部分

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": {
                "html_content": detail["html_content"],
                "attachments": detail["attachments"],
                "result": detail["parser_result"],
                "data_id": detail["data_id"],
                "is_check": detail["is_check"],
                "subject": detail["subject"],
            }
        })
    except Exception as e:
        logger.exception("get_email_preview error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/email/<email_id>/adjacent：根据 data_id 获取上一条或下一条邮件 id。
@bp.route("/email/<email_id>/adjacent", methods=["GET"])
def get_adjacent_email(email_id):
    try:
        direction = request.args.get("direction")
        data_id_raw = request.args.get("data_id")
        if direction not in ("next", "prev"):
            return jsonify({"code": 400, "message": "direction 必须为 next 或 prev"}), 400
        if not data_id_raw:
            return jsonify({"code": 400, "message": "data_id 不能为空"}), 400
        try:
            data_id = int(data_id_raw)
        except ValueError:
            return jsonify({"code": 400, "message": "data_id 必须为整数"}), 400
        adjacent_id = get_next_email_id(data_id, direction)
        return jsonify({"code": 200, "message": "查询成功", "data": {"id": adjacent_id}})
    except Exception as e:
        logger.exception("get_adjacent_email error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# PUT /api/email/<email_id>：更新指定邮件的可编辑字段，并记录操作人。
@bp.route("/email/<email_id>", methods=["PUT"])
def update_email_route(email_id):
    try:
        body = request.get_json(force=True) or {}
        # 修改保存时，若改动了parser_result且未显式指定 is_done，则据此重算is_done
        if "parser_result" in body and "is_done" not in body:
            result = body["parser_result"]
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except json.JSONDecodeError:
                    result = None
            result = normalize_parser_result(result)
            if result:
                body["is_done"] = compute_is_done(result)
        operator = getattr(g, "user", None)
        operator = operator.get("username") if operator else None
        ok = update_email(email_id, body, operator=operator)
        if ok is False and not body:
            return jsonify({"code": 400, "message": "请求体不能为空"}), 400
        if not ok:
            return jsonify({"code": 404, "message": "未找到该邮件或无可更新字段"}), 404
        return jsonify({"code": 200, "message": "更新成功"})
    except Exception as e:
        logger.exception("update_email error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/email/<email_id>/logs：查询指定邮件的审计日志。
@bp.route("/email/<email_id>/logs", methods=["GET"])
def get_email_logs(email_id):
    try:
        logs = get_audit_logs(email_id)
        return jsonify({"code": 200, "data": logs})
    except Exception as e:
        logger.exception("get_email_logs error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# PATCH /api/email/<email_id>/check：更新指定邮件的审核状态 is_check。
@bp.route("/email/<email_id>/check", methods=["PATCH"])
def update_check(email_id):
    try:
        body = request.get_json(force=True) or {}
        is_check = body.get("is_check")
        if is_check not in (0, 1, 2):
            return jsonify({"code": 400, "message": "is_check 必须为 0、1 或 2"}), 400
        operator = getattr(g, "user", None)
        operator = operator.get("username") if operator else None
        ok = update_email_check(email_id, is_check, operator=operator)
        if not ok:
            return jsonify({"code": 404, "message": "未找到该邮件"}), 404
        return jsonify({"code": 200, "message": "更新成功"})
    except Exception as e:
        logger.exception("update_check error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/test/<ordering_id>/order：测试查询指定 ordering_id 的订单解析结果。
@bp.route("/test/<ordering_id>/order", methods=["GET"])
def get_order_result_route(ordering_id):
    """用于测试 ordering_id 的解析结果。"""
    try:
        result = get_order_result(ordering_id)
        if result is None:
            return jsonify({"code": 404, "message": "未找到对应解析结果"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("get_order_result_route error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# GET /api/test/<email_id>/email：测试查询指定 email_id 的原始邮件结果。
@bp.route("/test/<email_id>/email", methods=["GET"])
def get_email_result_route(email_id):
    """用于测试：获取指定 email_id 的结果。"""
    try:
        result = get_email_detail(email_id)
        if result is None:
            return jsonify({"code": 404, "message": "未找到对应解析结果"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("get_email_result_route error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500




def _merge_mbl_number(email_id, parser_mbl):
    """将 parser 中的 mbl 追加到该邮件原有 mbl_number 并去重（逗号分隔，保序）。"""
    detail = get_email_detail(email_id) or {}
    old_mbl = detail.get("mbl_number") or ""
    mbls = [m.strip() for m in old_mbl.split(",") if m.strip()]
    if parser_mbl not in mbls:
        mbls.append(parser_mbl)
    return ",".join(mbls)


def _create_by_ordering_id(body, ordering_id):
    """按 ordering_id 回填 email 的 status/mbl，并把解析结果写入 email_parser_result 表。"""
    # 去数据库里面查哪个 email 中是这个 ordering_id
    data_email_id = get_email_id_by_ordering_id(ordering_id)
    status = body.get("status")
    # 获取解析结果
    parser_result = get_order_result(ordering_id)
    parser_result = parser_result.get("result") if parser_result else None
    results = normalize_parser_result(parser_result) # 解析结果标准化
    parser_mbl = results.get("masterBillNo") if results else None # 解析结果中的 mbl

    if not status:
        log_create_failure("缺少 status 参数", status_code=400,
                           ordering_id=ordering_id, email_id=data_email_id, request_body=body)
        return jsonify({"code": 400, "message": "缺少 status 参数"}), 400
    if not results:
        log_create_failure("缺少 result 参数", status_code=400,
                           ordering_id=ordering_id, email_id=data_email_id, request_body=body)
        return jsonify({"code": 400, "message": "缺少 result 参数"}), 400
    if not data_email_id:
        log_create_failure("未找到对应邮件", status_code=404,
                           ordering_id=ordering_id, request_body=body)
        return jsonify({"code": 404, "message": "未找到对应邮件"}), 404

    payload = {
        "status": status,
        "is_done": compute_is_done(results),
    }
    if parser_mbl:
        payload["mbl_number"] = _merge_mbl_number(data_email_id, parser_mbl)
    update_email(data_email_id, payload, operator="order_callback") # 写入email表（无parser_result字段）
    upsert_parser_result_by_ordering_id(ordering_id, results) # 写入 email_parser_result 表
    return jsonify({"code": 200, "message": "写入成功",
                    "data": {"ordering_id": ordering_id, "email_id": data_email_id, "status": status}})


def _create_by_email_id(body, email_id):
    """从 Redis 获取 email_id 的邮件详情并写入本地 email 表。"""
    record = get_email_detail(email_id)
    if record is None:
        log_create_failure("未找到对应邮件", status_code=404,
                           email_id=email_id, request_body=body)
        return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
    upsert_emails([record])
    return jsonify({"code": 200, "message": "写入成功", "data": {"id": record.get("id", email_id)}})
