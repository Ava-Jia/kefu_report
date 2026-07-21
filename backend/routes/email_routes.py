import re 
from flask import Blueprint, jsonify, request, g
from services.email_parser import (
    get_email_id, _json_get, _get_redis, get_email_result, get_order_result,
    upload_file_to_oss, submit_parse_async, email_parse_status, email_html_attachment
)
from services.email_service import (
    upsert_emails, get_local_emails, get_broker_names, update_email_check, update_email,
    get_email_id_by_ordering_id, get_audit_logs,
    get_email_detail,
    get_next_email_id, compute_is_done, compute_is_done_multi,
    normalize_parser_result, normalize_parser_results,
    log_create_failure, IS_DONE_MODIFIED, IS_DONE_VOIDED,
)

from services.parser_result_service import (
    upsert_parser_result_by_ordering_id, get_parser_result_by_ordering_id,
    create_parser_result_by_ordering_id, find_parser_result_by_bill,
    update_parser_result_by_bill, void_parser_result_by_bill,
)
import json
import logging
import os
import requests

bp = Blueprint("email", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


@bp.route("/email/create", methods=["POST"])
def create_email():
    """
    整个创建顺序：
    1. 先判断是不是ordering-id，如果是，就去调用ordering解析并保存
    2. 如果是email-id，则先获取email解析的内容并保存；如果有ordering-id，则再调用获取附件解析的结果并保存。
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
        return _create_by_email_id(body, email_id) # 仅写入了Email信息，没有写入order信息
    except Exception as e:
        logger.exception("create_email error")
        log_create_failure(f"服务器错误: {e}", status_code=500,
                           ordering_id=(body or {}).get("ordering_id") if isinstance(body, dict) else None,
                           email_id=(body or {}).get("email_id") if isinstance(body, dict) else None,
                           request_body=body if isinstance(body, dict) else None)
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/email/broker-names", methods=["GET"])
def list_broker_names():
    """返回去重后的代理名称列表，供搜索下拉框使用。"""
    try:
        return jsonify({"code": 200, "message": "查询成功", "data": get_broker_names()})
    except Exception as e:
        logger.exception("list_broker_names error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


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
        # 移除SCAC，然后变为模糊查询
        mbl_number = (request.args.get("mbl_number") or "").strip() or None
        if mbl_number and mbl_number[:4] in _SCAC_CODES:
            mbl_number = mbl_number[5:]

        broker_name = (request.args.get("broker_name") or "").strip() or None
        order = "asc" if (request.args.get("order") or "").strip().lower() == "asc" else "desc"
        data = get_local_emails(
            page=page, page_size=page_size,
            intent_type1=intent_type1,
            date_from=date_from, date_to=date_to,
            is_check=is_check,
            mbl_number=mbl_number,
            broker_name=broker_name,
            order=order,
        )
        return jsonify({"code": 200, "message": "查询成功", "data": data})
    except Exception as e:
        logger.exception("list_emails error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500



@bp.route("/email/<email_id>/preview", methods=["GET"])
def get_email_preview(email_id):
    try:
        detail = get_email_detail(email_id)
        if detail is None:
            return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
        # 从redis获取html和attachment
        email_result = email_html_attachment(email_id)
        html_content = email_result["html_content"]
        attachments = email_result["attachments"]
        # 先用全量附件（含带 content_id 的内联图片）替换 cid，再过滤给前端
        html_content = _attachment_in_html(html_content, attachments)
        attachments = _attachment_filter(attachments)

        # 解析结果改从 email_parser_result 表按 ordering_id 获取，需要适配有多个解析结果
        ordering_id = detail.get("ordering_id")
        parser_rows = get_parser_result_by_ordering_id(ordering_id) if ordering_id else None
        results = [row.get("parser_result") for row in (parser_rows or [])]
        is_dones = [row.get("is_done") for row in (parser_rows or [])]

        return jsonify({
            "code": 200,
            "message": "查询成功",
            "data": {
                "html_content": html_content,
                "attachments": attachments,
                "result": results,
                "data_id": detail["data_id"],
                "is_check": detail["is_check"],
                "subject": detail["subject"],
                "intent_type1": detail["intent_type1"],
                "intent_type2": detail["intent_type2"],
                "is_done": is_dones,
                "status": detail["status"],
                "mbl_number": detail["mbl_number"],
                "email_summary": detail["email_summary"],
            }
        })
    except Exception as e:
        logger.exception("get_email_preview error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


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


@bp.route("/email/<email_id>", methods=["PUT"])
def update_email_route(email_id):
    try:
        body = request.get_json(force=True) or {}
        if not body:
            return jsonify({"code": 400, "message": "请求体不能为空"}), 400

        operator = getattr(g, "user", None)
        operator = operator.get("username") if operator else None

        # parser_result 写入 email_parser_result 表，不再写入 email 表
        patch = body.pop("parser_result", None)
        # 一封邮件可能有多条解析结果，前端带上改动前的提单号用于定位到具体那条记录
        row_mbl = body.pop("parser_master_bill_no", None)
        row_hbl = body.pop("parser_house_bill_no", None)
        if patch is not None:
            if isinstance(patch, str):
                try:
                    patch = json.loads(patch)
                except json.JSONDecodeError:
                    patch = None
            patch = normalize_parser_result(patch)

            no_scac_mbl = _strip_scac(row_mbl)
            # 根据mbl和hbl找到被修改的订单单
            row = find_parser_result_by_bill(no_scac_mbl, row_hbl)
            
            # 这封邮件的相关信息，如detail和ordering_id
            detail = get_email_detail(email_id)
            if detail is None:
                return jsonify({"code": 404, "message": "未找到该邮件"}), 404
            ordering_id = detail.get("ordering_id")
            # 存在记录，判断当前这个email是否有ordering_id
            if row:
                # 如果有ordering_id
                if ordering_id:
                    # 判断email的order_id和数据库中的order_id是否相同
                    if ordering_id == row.get("ordering_id"):
                        # 已作废的单不允许再被编辑覆盖
                        if row.get("is_done") == 4:
                            log_create_failure(
                                f"该订单已作废，不允许再编辑，mbl={row_mbl} hbl={row_hbl}, order_id={ordering_id}",
                                ordering_id=ordering_id, email_id=email_id, request_body=patch,
                            )
                            return jsonify({"code": 409, "message": "该订单已作废，不允许再编辑"}), 409
                        # is_done 为 (1,3)/(0,2) 时均允许编辑，写入逻辑走下面统一的 upsert
                        
                        # 用改动前的提单号定位到本次编辑的那条解析结果（未指定时回退到 patch 自身的提单号）
                        # 判断row和detail
                        target_mbl = row_mbl if row_mbl not in (None, "") else patch.get("masterBillNo")
                        target_hbl = row_hbl if row_hbl not in (None, "") else patch.get("houseBillNo")
                        existing_list = get_parser_result_by_ordering_id(ordering_id) or []
                        existing_result = {}
                        all_results = []
                       
                        for item in existing_list:
                            pr = item.get("parser_result") or {}
                            if (not existing_result
                                    and (pr.get("masterBillNo") or None) == (target_mbl or None)
                                    and (pr.get("houseBillNo") or None) == (target_hbl or None)):
                                existing_result = pr
                                all_results.append({**pr, **patch})
                            else:
                                all_results.append(pr)
                        if not existing_result:
                            all_results.append(patch)
                        
                        if row.get("is_done") in (1,3):
                            new_is_done = 3
                        else:
                            new_is_done = compute_is_done({**existing_result, **patch}),
                        # 按 (ordering_id, masterBillNo, houseBillNo) 匹配到具体那条记录，避免定位错行/新增重复
                        upsert_parser_result_by_ordering_id(
                            ordering_id, patch,
                            broker_name=detail.get("broker_name"),
                            is_done=new_is_done,
                            master_bill_no=target_mbl,
                            house_bill_no=target_hbl,
                            operator=operator,
                        )

                    else:
                        # mbl+hbl 已被另一个 ordering_id 占用，禁止在当前 ordering_id 下写入，避免产生重复记录
                        log_create_failure(
                            f"此mbl、hbl已被另一个ordering-id绑定，请勿再次创建，mbl={row_mbl} hbl={row_hbl}, order_id={ordering_id}",
                            ordering_id=ordering_id, email_id=email_id, request_body=patch,
                        )
                        return jsonify({"code": 409, "message": "该 mbl/hbl 已被其它订单占用，无法保存"}), 409
                    
                # 如果没有ordering_id，复用row的ordering-id
                else:
                    ordering_id = row.get("ordering_id")
                    
            # 不存在记录：沿用邮件自身的 ordering_id（若也没有，下面会因 ordering_id 为空而报错）
            else:
                pass
            


            if not ordering_id:
                return jsonify({"code": 400, "message": "该邮件未关联 ordering_id，无法保存解析结果"}), 400
            # 用改动前的提单号定位到本次编辑的那条解析结果（未指定时回退到 patch 自身的提单号）
            target_mbl = row_mbl if row_mbl not in (None, "") else patch.get("masterBillNo")
            target_hbl = row_hbl if row_hbl not in (None, "") else patch.get("houseBillNo")
            existing_list = get_parser_result_by_ordering_id(ordering_id) or []
            existing_result = {}
            all_results = []
            for item in existing_list:
                pr = item.get("parser_result") or {}
                if (not existing_result
                        and (pr.get("masterBillNo") or None) == (target_mbl or None)
                        and (pr.get("houseBillNo") or None) == (target_hbl or None)):
                    existing_result = pr
                    all_results.append({**pr, **patch})
                else:
                    all_results.append(pr)
            if not existing_result:
                all_results.append(patch)
            # email 表单行的 is_done 汇总全部解析结果；单条记录的 is_done 只看合并后的自身
            if body.get("is_done") is None:
                body["is_done"] = compute_is_done_multi(all_results)
            # 按 (ordering_id, masterBillNo, houseBillNo) 匹配到具体那条记录，避免定位错行/新增重复
            upsert_parser_result_by_ordering_id(
                ordering_id, patch,
                broker_name=detail.get("broker_name"),
                is_done=compute_is_done({**existing_result, **patch}),
                master_bill_no=target_mbl,
                house_bill_no=target_hbl,
                operator=operator,
            )

        ok = update_email(email_id, body, operator=operator) if body else True
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
        # 解析结果的改动记在 email_parser_result 表，record_id 是该邮件的 ordering_id，需一并合并返回
        detail = get_email_detail(email_id)
        ordering_id = detail.get("ordering_id") if detail else None
        if ordering_id:
            logs += get_audit_logs(ordering_id, table_name="email_parser_result")
            logs.sort(key=lambda x: x["created_at"] or "", reverse=True)
        return jsonify({"code": 200, "data": logs})
    except Exception as e:
        logger.exception("get_email_logs error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/order/<ordering_id>/logs", methods=["GET"])
def get_order_logs(ordering_id):
    try:
        logs = get_audit_logs(record_id=ordering_id, table_name="email_parser_result")
        return jsonify({"code": 200, "data": logs})
    except Exception as e:
        logger.exception("get_email_logs error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

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

@bp.route("/test/<email_id>/email", methods=["GET"])
def get_email_result_route(email_id):
    """用于测试：获取指定 email_id 的结果。"""
    try:
        result = get_email_result(email_id)
        if result is None:
            return jsonify({"code": 404, "message": "未找到对应解析结果"}), 404
        return jsonify({"code": 200, "message": "查询成功", "data": result})
    except Exception as e:
        logger.exception("get_email_result_route error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/email/upload", methods=["POST"])
def upload_eml():
    """把上传的 .eml 文件传到 OSS，并提交进行解析等待结果"""
    try:
        file = request.files.get("file")
        brokerName = request.form.get("brokerName")
        if not file or not file.filename:
            return jsonify({"code": 400, "message": "请上传 .eml 文件"}), 400
        if not file.filename.lower().endswith(".eml"):
            return jsonify({"code": 400, "message": "仅支持 .eml 文件"}), 400
        if not brokerName:
            return jsonify({"code": 400, "message": "缺少代理名称"}), 400
        eml_url = upload_file_to_oss(file.filename, file.read())
        resp = submit_parse_async(eml_url, brokerName)
        if not resp or not resp.get("task_id"):
            return jsonify({"code": 502, "message": "提交解析任务失败", "data": {"eml_url": eml_url}}), 502
        return jsonify({"code": 200, "message": "上传成功", "data": {"task_id": resp["task_id"], "eml_url": eml_url}})
    except Exception as e:
        logger.exception("upload_eml error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500


@bp.route("/email/status/<task_id>", methods=["GET"])
def status_eml(task_id):
    try:
        if not task_id:
            return jsonify({"code": 400, "message": "缺少 task_id 参数"}), 400
        resp = email_parse_status(task_id)
        if not resp:
            return jsonify({"code": 502, "message": "解析服务无响应或返回异常"}), 502
        email_id = resp["email_id"]
        # ordering_id 以解析服务返回的为准，缺失时回退本地 email 表
        email_detail = get_email_result(email_id)
        ordering_id = email_detail.get("ordering_id")[12:] or ""
        if ordering_id:
            order_detail = get_order_result(ordering_id)["result"]
        else:
            # 没有order-id
            print("没有order-id，开始手动推送")
            brokerName = email_detail.get("brokerName")
            subject = email_detail.get("subject")
            references = email_detail.get("references")
            content = email_detail.get("body") or ""
            email_attachments = email_detail.get("attachments") or []
            attachments = []
            for attachment in email_attachments:
                if not attachment.get("content_id"):
                    attachments.append({
                        "attachmentName": attachment.get("filename"),
                        "attachmentTypeUrl": attachment.get("oss_url"),
                        "attachmentType": "attachment",
                        })
            print(attachments) 
            # 获取相关信息
            data = {
                "taskType":"orderParse",
                "orderInter": "new", # 每个都当作新下单
                "subject": subject,
                "brokerName":brokerName,
                "references": references,
                "content": content,
                "attachments":attachments,
            }
            response = requests.post(os.getenv("ORDER_PARSE_URL", "http://36.103.199.11:5010/process/async"), json=data)
            result = json.loads(response.content)
            ordering_id = result.get("task_id")
            print(f"Status Code: {result}")
            order_detail = [{
                "masterBillNo": "等待解析中，请稍后点击查看"
            }]

        # 组成数据
        detail = {
            "email_id": email_id,
            "email_detail": email_detail,
            "order_id": ordering_id,
            "order_detail": order_detail,
        }
        # 持久化保存
        return jsonify({"code": 200, "message": "查询成功", "data": detail})
    except Exception as e:
        logger.exception("status_eml error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/email/upload/result", methods=["GET"])
def get_result():
    """按 email_id / order_id 直接取解析结果，供上传历史任务回看，不再依赖 task_id。"""
    try:
        email_id = (request.args.get("email_id") or "").strip()
        order_id = (request.args.get("order_id") or "").strip()
        if not email_id:
            return jsonify({"code": 400, "message": "缺少 email_id 参数"}), 400
        email_detail = get_email_detail(email_id)

        if email_detail is None:
            return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
        order_detail = (get_order_result(order_id) or {}).get("result") if order_id else None
        if order_detail is None:
            order_detail = [
                {
                "masterBillNo": "等待解析中，请稍后点击查看"
                }
            ]
        return jsonify({"code": 200, "message": "查询成功", "data": {
            "email_id": email_id,
            "email_detail": email_detail,
            "order_id": order_id,
            "order_detail": order_detail,
        }})
    except Exception as e:
        logger.exception("get_result error")
        return jsonify({"code": 500, "message": "服务器错误", "error": str(e)}), 500

@bp.route("/email/upload/order", methods=["POST"])
def put_order():
    """手动发起plt解析任务"""
    try:
        body = request.get_json(force=True) or {}
        email_id = body.get("email_id")
        email_detail = get_email_result(email_id)
        if not email_detail:
            return jsonify({"code": 404, "message":"找不到该邮件的相关信息"}), 404
        brokerName = email_detail.get("brokerName")
        subject = email_detail.get("subject")
        references = email_detail.get("references")
        content = email_detail.get("body") or ""
        email_attachments = email_detail.get("attachments") or []
        attachments = []
        for attachment in email_attachments:
            if not attachment.get("content_id"):
                attachments.append({
                    "attachmentName": attachment.get("filename"),
                    "attachmentTypeUrl": attachment.get("oss_url"),
                    "attachmentType": "attachment",
                    })
        print(attachments) 
        # 获取相关信息
        data = {
            "taskType":"orderParse",
            "orderInter": "new", # 每个都当作新下单
            "subject": subject,
            "brokerName":brokerName,
            "references": references,
            "content": content,
            "attachments":attachments,
        }
        response = requests.post(os.getenv("ORDER_PARSE_URL"), json=data)

        result = json.loads(response.content)
        order_id = result.get("task_id")
        print(f"Status Code: {result}")
        return jsonify({"code": 200, "message": "发起成功", "order_id": order_id}), 200
    except Exception as e:
        logger.exception("put_order error")
        return jsonify({"code": 500, "message":"发起解析任务错误", "error": str(e)}), 500


# 常见船公司 SCAC 代码，用于判断 masterBillNo 前四位是否已带船公司代码
_SCAC_CODES = {
    "COSU", "CMDU", "EGLV", "ONEY", "WHLC", "SMLM", "MATS", "OOLU",
    "HDMU", "MAEU", "MEDU", "YMJA", "HLCU", "ZIMU", "SJHH", "TSYN", "HDUJ",
}


def _merge_mbl_numbers(email_id, parser_mbls):
    """将 parser 中的多个 mbl 追加到该邮件原有 mbl_number 并去重（逗号分隔，保序）。
    旧 mbl 若缺失 SCAC（前四位不属于已知船公司代码），且与 parser_mbl 去掉前四位后相同，
    说明是同一个提单号，用带 SCAC 的 parser_mbl 替换掉旧的那一条。
    """
    detail = get_email_detail(email_id) or {}
    old_mbl = detail.get("mbl_number") or ""
    mbls = [m.strip() for m in old_mbl.split(",") if m.strip()]

    for parser_mbl in parser_mbls:
        if not parser_mbl:
            continue
        matched = False
        for i, m in enumerate(mbls):
            if m[:4].upper() not in _SCAC_CODES and m == parser_mbl[4:]:
                mbls[i] = parser_mbl
                matched = True
                break
        if not matched and parser_mbl not in mbls:
            mbls.append(parser_mbl)

    return ",".join(mbls)


def _create_by_ordering_id(body, ordering_id):
    """按 ordering_id 回填 email 的 status/mbl，并把解析结果写入 email_parser_result 表。
    将写入parser-result分为多个1
    1. 新建单——判断mbl、hbl是否已经写入，如果写入（当前版本pass）；如果没有写入，就新建一条数据（基于mbl和hbl）
    2. 修改单——找到该mbl、hbl已经写入的数据，将修改后的结果写入进去，包括is_done（是否下单）
    3. 作废单——
    """
    status = body.get("status")
    if not status:
        log_create_failure("缺少 status 参数", status_code=400,
                           ordering_id=ordering_id, request_body=body)
        return jsonify({"code": 400, "message": "缺少 status 参数"}), 400
    # 找到 ordering-id 对应的 email 解析结果
    email_result = get_email_id_by_ordering_id(ordering_id)
    data_email_id = email_result.get("id") if email_result else None
    if not data_email_id:
        log_create_failure("未找到对应邮件", status_code=404,
                           ordering_id=ordering_id, request_body=body)
        return jsonify({"code": 404, "message": "未找到对应邮件"}), 404

    if status == "failed":
        log_create_failure("解析失败", status_code=200,
                           ordering_id=ordering_id, request_body=body)
        payload = {
        "status": status
        }
        update_email(data_email_id, payload, operator="order_callback") # 写入email表（无parser_result字段）
        return jsonify({"code": 200, "message": "已记录解析失败"}), 200
    brokerName = email_result.get("broker_name") if email_result else None 
    # 意图处理，返回NEW、UPDATE、CANCEL、OTEHR
    intentType1 = email_result.get("intent_type1")

    # 获取解析结果中的意图，而非email中的意图
    intentType2 = body.get("intent_type2")
    if not intentType2:
        log_create_failure("缺少intent_type2参数", status_code=400,
                           ordering_id=ordering_id, request_body=body)
        return jsonify({"code": 400, "message": "缺少intent_type2参数"}), 400

    intent_action = _classify_exchange_intent(intentType1, intentType2) # 最终判断出意图other、new、update

    # 获取解析结果
    parser_result = get_order_result(ordering_id)
    parser_result = parser_result.get("result") if parser_result else None
    results = normalize_parser_results(parser_result) # 一个 ordering 可能有多份结果
    if not results:
        log_create_failure("缺少 result 参数", status_code=400,
                           ordering_id=ordering_id, email_id=data_email_id, request_body=body)
        return jsonify({"code": 400, "message": "缺少 result 参数"}), 400
    # 每份解析结果按意图分别入库：以 mbl+hbl 判断是否已存在，避免不同提单互相覆盖
    new_ordering_id = None  # 修改单场景下，被改订单的ordering_id，回填到email
    for one in results:
        mbl = one.get("masterBillNo")
        hbl = one.get("houseBillNo")
        # 处理SCAC
        no_scac_mbl = _strip_scac(mbl)
        is_done = compute_is_done(one)
        
        if intent_action == "new":
            row = find_parser_result_by_bill(no_scac_mbl, hbl)
            if row:
                if row.get("is_done") in (1,3):
                    pass
                else:
                    if status != "failed":
                        # pending和完成要更新之前的单
                        update_parser_result_by_bill(
                            master_bill_no=no_scac_mbl, house_bill_no=hbl, parser_result=one, broker_name=brokerName, is_done=is_done,
                            operator="order_update",
                        )
                # # 同一 mbl+hbl 已存在，跳过并记录（后续补充去重逻辑）
                # log_create_failure(
                #     f"新建单 mbl+hbl 已存在，跳过 mbl={mbl} hbl={hbl}",
                #     ordering_id=ordering_id, email_id=data_email_id, request_body=one,
                # )
            else:
                # 创建新的解析结果
                create_parser_result_by_ordering_id(
                    ordering_id, one, broker_name=brokerName, is_done=is_done,
                    master_bill_no=mbl, house_bill_no=hbl, operator="order_new",
                )
                # 后续判断是否要下单
                if status != "COMPLETED":
                    pass
        # 更新之前的数据
        elif intent_action == "update":
            # 判断有没有is-done=1的对应订单
            row = find_parser_result_by_bill(no_scac_mbl, hbl) # 新建单的order数据
            if row is None:
                # 没有对应新建单，修改无从下手，记日志跳过
                log_create_failure(
                    f"修改单未找到对应新建单，修改被丢弃 mbl={mbl} hbl={hbl}",
                    ordering_id=ordering_id, email_id=data_email_id, request_body=one,
                )
                continue
            # 先看该单是不是作废单
            if row.get("is_done") == 4:
                # 订单已作废，不允许再被修改覆盖
                log_create_failure(
                    f"修改单对应订单已作废，修改被丢弃 mbl={mbl} hbl={hbl}",
                    ordering_id=ordering_id, email_id=data_email_id, request_body=one,
                )
                continue
            if row.get("is_done") in (1, 3):
                new_is_done = IS_DONE_MODIFIED
            else:  # (0, 2) 及其它值：按本次解析结果重新计算
                new_is_done = compute_is_done(one)
            update_parser_result_by_bill(
                master_bill_no=no_scac_mbl, house_bill_no=hbl, parser_result=one, broker_name=brokerName, is_done=new_is_done,
                operator="order_update",
            )
            new_ordering_id = row.get("ordering_id")
            # 推送plt的的情况
            # 1. is-done =1、3直接推
            # 2. is-done不为1、3；计算后new-is-done为1，且status=completed，直接推
            if status != "COMPLETED":
                # 状态不是完成，等待解析
                if is_done == 1:
                    pass
        elif intent_action == "cancel":
            # 找到这一单
            row = find_parser_result_by_bill(no_scac_mbl, hbl) # 新建单的order数据
            if row is None:
                # 没有对应的新建单，作废失败
                log_create_failure(
                    f"作废单未找到对应新建单，作废被丢弃 mbl={mbl} hbl={hbl}",
                    ordering_id=ordering_id, email_id=data_email_id, request_body=one,
                )
                continue
            if row.get("is_done") in (1, 3):
                update_parser_result_by_bill(
                    master_bill_no=no_scac_mbl, house_bill_no=hbl, is_done=4, operator="order_cancel",
                )
                # 推送plt
                
            else:
                # 0=待处理 2=新建失败 4=已作废，均非已下单状态，不允许作废
                log_create_failure(
                    f"作废单对应订单非已下单状态，无法作废 mbl={mbl} hbl={hbl}",
                    ordering_id=ordering_id, email_id=data_email_id, request_body=one,
                )
        
    payload = {
        "status": status
    }
    if new_ordering_id:
        payload["ordering_id"] = new_ordering_id

    # 更新Email的mbl，拿更加准确的解析mbl来替换email mbl
    parser_mbls = [r.get("masterBillNo") for r in results if r.get("masterBillNo")]
    if parser_mbls:
        payload["mbl_number"] = _merge_mbl_numbers(data_email_id, parser_mbls)

    update_email(data_email_id, payload, operator="order_callback") # 写入email表（无parser_result字段）

    return jsonify({"code": 200, "message": "写入成功",
                    "data": {"ordering_id": ordering_id, "email_id": data_email_id,
                             "status": status, "count": len(results)}})


def _create_by_email_id(body, email_id):
    """从 Redis 获取 email_id 的邮件详情并写入本地 email 表。"""
    record = get_email_result(email_id)
    if record is None:
        log_create_failure("未找到对应邮件", status_code=404,
                           email_id=email_id, request_body=body)
        return jsonify({"code": 404, "message": "未找到对应邮件"}), 404
    # 判断该封Email是否为作废邮件
    # intent_type2 = record.get("intent_type2") or ""
    # if "PRE_ALERT_CANCEL" in intent_type2:
    #     # 修改其订单状态
    #     mbl = body.get("mbl")
    #     hbl = body.get("hbl")
    #     no_scac_mbl = _strip_scac(mbl)
    #     # 看看有没有这一单
    #     row = find_parser_result_by_bill(no_scac_mbl, hbl)
    #     # 没有就退出，但是写入这封邮件
    #     if row is None:
    #         log_create_failure(
    #             f"作废单未找到对应新建单，作废被丢弃 mbl={mbl} hbl={hbl}", email_id=email_id, 
    #         )
    #         upsert_emails([record])
    #         return jsonify({"code": 200, "message": "Email写入成功，但是作废失败，找不到该mbl、hbl的订单", "data": {"id": record.get("id", email_id)}})

    #     if row.get("is_done") in (1, 3):
    #         # 进行作废
    #         update_parser_result_by_bill(
    #         master_bill_no=no_scac_mbl, house_bill_no=hbl, is_done=4, operator="order_cancel",
    #         )
    #     elif row.get("is_done") in (0, 2, 4):
    #         log_create_failure(
    #             f"作废单对应订单非已下单状态，无法作废 mbl={mbl} hbl={hbl}",
    #             ordering_id=row.get("ordering_id"), email_id=email_id, 
    #         )
    # 将Email数据写入表中
    upsert_emails([record])
    return jsonify({"code": 200, "message": "写入成功", "data": {"id": record.get("id", email_id)}})


def _attachment_in_html(html_content, attachments):
    if isinstance(html_content, list):
        html_content = "".join(html_content)
    if not html_content:
        return html_content
    cids = re.findall(r'<img[^>]+src=["\']cid:([^"\']+)["\']', html_content, re.I)
    for cid in cids:
        oss_url = None
        # 查找对应的oss
        for attachment in attachments:
            content_id = (attachment.get("content_id") or "").strip("<>")
            if content_id == cid:
                oss_url = attachment.get("oss_url") or ""
                break
        if oss_url:
            # 替换 html_content 内容
            html_content = re.sub(
                rf'src=["\']cid:{re.escape(cid)}["\']',
                f'src="{oss_url}"',
                html_content,
                flags=re.I
            )
    return html_content


def _attachment_filter(attachments: list[dict]) -> list[dict]:
    """如果 attachment 中record_id是空，则展示"""
    results = []
    for attachment in attachments:

        if not attachment.get("content_id"):
            results.append(attachment)
    return results

def _classify_exchange_intent(intent_type1, intent_type2):
    """把换港意图映射"""
    intent1 = intent_type1 or ""
    intent2 = intent_type2 or ""
    if "EXCHANGE_OF_PORT" not in intent1:
        return "other"
    if "PRE_ALERT_NEW" in intent2:
        return "new"
    if "PRE_ALERT_UPDATE" in intent2:
        return "update"
    if "PRE_ALERT_CANCEL" in intent2:
        return "cancel"
    return "other"

def _strip_scac(bill: str | None) -> str | None:
    """提单号前四位若是已知船公司 SCAC，则去掉；否则原样返回。"""
    if not bill:
        return bill
    if bill[:4].upper() in _SCAC_CODES:
        return bill[4:] # 返回剔除SCAC
    return bill # 原始无SCAC，原样返回
