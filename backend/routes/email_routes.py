from flask import Blueprint, jsonify, request, g
from services.email_parser import get_email_id, get_html_content, _json_get, _get_redis, get_order_result, get_email_detail
from models.email import upsert_emails, get_local_emails, update_email_check, update_email, get_email_id_by_ordering_id, get_audit_logs
import json
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
    """
    从 Redis 获取指定 email_id 的邮件详情，并写入本地 SQLite。
    如果传的是 ordering_id, 则不仅要拿解析结果，还要将order_id写到对应的email_id的记录中。
    """
    try:
        body = request.get_json(force=True, silent=True)
        if not body:
            return jsonify({"code": 400, "message": "请求体必须为合法 JSON"}), 400
        # 如果有ordering-id,则进行email-id替换其status
        ordering_id = body.get("ordering_id")
        if ordering_id:
            # 去数据库里面查哪个email中是这个 ordering_id
            data_email_id = get_email_id_by_ordering_id(ordering_id)
            # 更新该email_id的 ordering_id 和 status 字段
            status = body.get("status")
            if not status:
                return jsonify({"code": 400, "message": "缺少 status 参数"}), 400
            if not data_email_id:
                return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
            if data_email_id:
                update_email(data_email_id, {"status": status}, record_log=False)
            return jsonify({"code": 200, "message": "写入成功", "data": {"ordering_id": ordering_id, "email_id": data_email_id, "status": status}})

        # 如果是 email_id
        email_id = body.get("email_id")
        if not email_id:
            return jsonify({"code": 400, "message": "缺少 email_id 参数"}), 400
        record = get_email_detail(email_id)
        if record is None:
            return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
        upsert_emails([record])
        return jsonify({"code": 200, "message": "写入成功", "data": {"id": record.get("id", email_id)}})
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

# 获取指定的html-content
@bp.route("/email/<email_id>/html", methods=["GET"])
def get_email_html(email_id):
    html_content, attachments, result = get_html_content(email_id)
    if html_content is None:
        return jsonify({
            "code": 404,
            "message": "未找到 HTML 内容"
        }), 404
    return jsonify({
        "code": 200,
        "message": "查询成功",
        "data": {
            "html_content": html_content,
            "attachments": attachments,
            "result": result,
        }
    })

# 获取指定的result
@bp.route("/email/<ordering_id>/result", methods=["GET"])
def get_order(ordering_id):
    try:
        results = get_order_result(ordering_id)
        attachments = results.get("input_payload")
        result = results.get("result")

        if result is None:
            return jsonify({"code": 404, "message": "未找到对解析结果"}), 404

        try:
            data_email_id = get_email_id_by_ordering_id(ordering_id)
            if data_email_id:
                update_email(data_email_id, {"parser_result": json.dumps(result, ensure_ascii=False)}, record_log=False)
        except Exception:
            logger.exception("缓存 parser_result 失败")

        return jsonify({"code": 200, "message": "查询成功", "data": {"result": result, "attachments": attachments}})
    except Exception as e:
        logger.exception("get_order_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

# 获取Email的attachment
@bp.route("/email/<email_id>/attachment", methods=["GET"])
def get_email_attachment(email_id):
    try:
        r = _get_redis()
        data = _json_get(r, f"email_id:{email_id}")
        if not data:
            return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
        attachments = data.get("attachments", [])
        # 只保留 PDF 附件
        pdf_attachments = [
            item for item in attachments
            if (item.get("filename") or "").lower().endswith(".pdf")
        ]
        return jsonify({"code": 200, "message": "查询成功", "data": {"attachments": pdf_attachments}})
    except Exception as e:
        logger.exception("get_email_attachment error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/email/<email_id>", methods=["PUT"])
def update_email_route(email_id):
    try:
        body = request.get_json(force=True) or {}
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


@bp.route("/email/<email_id>/logs", methods=["GET"])
def get_email_logs(email_id):
    try:
        logs = get_audit_logs(email_id)
        return jsonify({"code": 200, "data": logs})
    except Exception as e:
        logger.exception("get_email_logs error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/email/<email_id>/check", methods=["PATCH"])
def update_check(email_id):
    try:
        body = request.get_json(force=True) or {}
        is_check = body.get("is_check")
        if is_check is None or is_check not in (0, 1, 2):
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
