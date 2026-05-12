"""
日报保存、列表、单条读取。
保存后不触发单人 AI 总结；全局总结仅由定时任务按日/周/月生成。
"""

from flask import Blueprint, jsonify, request

import logging
from utils.file_utils import (
    delete_previous_report_if_replaced,
    delete_report_files,
    list_reports_filtered,
    load_report_for_edit,
    save_report_file,
)

bp = Blueprint("report", __name__, url_prefix="/api")

logger = logging.getLogger(__name__)

@bp.route("/report/save", methods=["POST"])
def save_report():
    try:
        data = request.get_json(silent=True) or {}
        name = data.get("name", "")
        date_str = data.get("date", "")
        content = data.get("content", "")

        if not name or not str(name).strip():
            return jsonify({"success": False, "message": "姓名不能为空"}), 400
        if not date_str:
            return jsonify({"success": False, "message": "日期不能为空"}), 400
        if content is None:
            content = ""

        display_name = str(name).strip()
        date_clean = str(date_str).strip()

        replace_name = (data.get("replace_name") or "").strip()
        replace_date = (data.get("replace_date") or "").strip()

        filename, path = save_report_file(display_name, date_clean, str(content))

        if replace_name and replace_date:
            try:
                delete_previous_report_if_replaced(
                    replace_name, replace_date, display_name, date_clean
                )
            except ValueError:
                pass
            except Exception as e:
                logger.warning(f"删除旧文件失败: {e}")

        return jsonify(
            {
                "success": True,
                "message": "保存成功",
                "filename": filename,
                "path": str(path),
            }
        )
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"保存失败: {e}"}), 500


@bp.route("/reports", methods=["GET"])
def get_reports():
    try:
        name = request.args.get("name")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        items = list_reports_filtered(name=name, start_date=start_date, end_date=end_date)
        return jsonify({"success": True, "reports": items})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@bp.route("/report", methods=["GET"])
def get_one_report():
    """编辑回填：按姓名 + 日期读取。"""
    try:
        name = request.args.get("name", "").strip()
        date_str = request.args.get("date", "").strip()
        if not name or not date_str:
            return jsonify({"success": False, "message": "请提供 name 与 date 参数"}), 400
        data = load_report_for_edit(name, date_str)
        if data is None:
            return jsonify({"success": False, "message": "未找到该日报"}), 404
        return jsonify(
            {
                "success": True,
                "name": data["name"],
                "date": data["date"],
                "content": data["content"],
            }
        )
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@bp.route("/report", methods=["DELETE"])
def delete_report():
    """删除指定姓名与日期的日报 txt。"""
    try:
        name = request.args.get("name", "").strip()
        date_str = request.args.get("date", "").strip()
        if not name or not date_str:
            return jsonify({"success": False, "message": "请提供 name 与 date 参数"}), 400
        removed = delete_report_files(name, date_str)
        if not removed:
            return jsonify({"success": False, "message": "未找到该日报文件"}), 404
        return jsonify({"success": True, "message": "已删除"})
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
