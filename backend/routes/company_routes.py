import csv
import uuid
import threading
from pathlib import Path
from flask import request, jsonify, Blueprint, send_file

from utils.company_utils import (
    FINAL_STATUS_BLACKLIST,
    FINAL_STATUS_PENDING,
    FINAL_STATUS_WHITELIST,
    get_task,
    set_task,
    do_search,
    normalize_company_href,
)

bp = Blueprint("companys", __name__, url_prefix="/api")

CSV_FIELD_ALIASES = {
    "待查list_name": "query_name",
    "最终判定": "final_status",
    "检索结果": "company_name",
    "检索到的公司名称": "company_name",
    "检索网站地址": "company_href",
    "注册地址": "company_address",
    "注册时间": "company_start_date",
    "inactivate": "company_status",
    "检索状态": "search_status",
}


def _normalize_csv_row(row: dict) -> dict:
    normalized = {CSV_FIELD_ALIASES.get(key, key): value for key, value in row.items()}
    if "company_href" in normalized:
        normalized["company_href"] = normalize_company_href(normalized.get("company_href"))
    return normalized


def _summarize_result_rows(data: dict) -> dict:
    counts = {"success": 0, "failed": 0, "no_result": 0}
    for rows in data.values():
        statuses = [str(row.get("search_status") or "").strip() for row in rows]
        final_statuses = [str(row.get("final_status") or "").strip() for row in rows]
        if any(status == FINAL_STATUS_PENDING for status in final_statuses):
            counts["failed"] += 1
        elif any("无结果" in status or "无精确匹配结果" in status for status in statuses):
            counts["no_result"] += 1
        elif any(status in {FINAL_STATUS_WHITELIST, FINAL_STATUS_BLACKLIST} for status in final_statuses):
            counts["success"] += 1
        elif any(status == "检索成功" or not status for status in statuses):
            counts["success"] += 1
        else:
            counts["failed"] += 1

    total = sum(counts.values())
    return {
        "total": total,
        "success": counts["success"],
        "failed": counts["failed"],
        "no_result": counts["no_result"],
        "has_partial_failure": counts["failed"] > 0 and counts["success"] > 0,
        "has_failure": counts["failed"] > 0,
        "has_no_result": counts["no_result"] > 0,
    }


@bp.route("/companys/search", methods=["GET"])
def company_search():
    """异步检索，立即返回 task_id"""
    names = request.args.getlist("name")
    if not names:
        return jsonify({"success": False, "message": "请提供公司名称"}), 400

    task_id = str(uuid.uuid4())
    # 设置任务状态
    set_task(task_id, {"status": "pending", "names": names})

    thread = threading.Thread(target=do_search, args=(task_id, names))
    thread.daemon = True
    thread.start()

    return jsonify({"success": True, "task_id": task_id})


@bp.route("/companys/result/<task_id>", methods=["GET"])
def company_result(task_id: str):
    """查询任务状态"""
    task = get_task(task_id)
    if not task:
        return jsonify({"success": False, "message": "任务不存在"}), 404

    status = task.get("status")
    if status == "pending":
        return jsonify({"success": True, "status": "pending", "message": "检索中，请稍后查询"})

    if status == "error":
        return jsonify(
            {
                "success": False,
                "status": "error",
                "message": task.get("message") or "检索失败",
            }
        )

    if status != "done":
        return jsonify(
            {
                "success": False,
                "status": "error",
                "message": f"任务状态异常: {status or 'unknown'}",
            }
        )

    file_path = task.get("file")
    if not file_path:
        return jsonify(
            {
                "success": False,
                "status": "error",
                "message": "任务缺少结果文件",
            }
        )

    # done 时从 CSV 文件读取数据返回
    result_path = Path(file_path)
    if not result_path.exists():
        return jsonify(
            {
                "success": False,
                "status": "error",
                "message": "结果文件不存在",
            }
        )

    if "data" in task:
        return jsonify(
            {
                "success": True,
                "status": "done",
                "data": task["data"],
                "summary": task.get("summary") or _summarize_result_rows(task["data"]),
            }
        )

    data = {}
    with open(result_path, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = _normalize_csv_row(row)
            name = row.get("query_name") or row.get("company_name") or "未知查询"
            if name not in data:
                data[name] = []
            data[name].append(row)

    summary = task.get("summary") or _summarize_result_rows(data)
    return jsonify({"success": True, "status": "done", "data": data, "summary": summary})


@bp.route("/companys/download/<task_id>", methods=["GET"])
def download_results(task_id: str):
    """直接下载 CSV 文件"""
    task = get_task(task_id)
    if not task:
        return jsonify({"success": False, "message": "任务不存在"}), 404

    if task.get("status") != "done":
        return jsonify({"success": False, "message": "任务尚未完成"}), 400

    file_path = task.get("file")
    if not file_path:
        return jsonify({"success": False, "message": "任务缺少结果文件"}), 404

    result_path = Path(file_path)
    if not result_path.exists():
        return jsonify({"success": False, "message": "文件不存在"}), 404

    download_suffix = result_path.suffix or ".xlsx"
    mimetype = (
        "text/csv"
        if download_suffix.lower() == ".csv"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    return send_file(
        result_path,
        as_attachment=True,
        download_name=f"company_{task_id[:8]}{download_suffix}",
        mimetype=mimetype
    )

