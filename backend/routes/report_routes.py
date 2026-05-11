"""
日报保存、列表、单条读取。
"""
from datetime import date
from pathlib import Path
from threading import Thread

from flask import Blueprint, jsonify, request

from utils.file_utils import (
    delete_previous_report_if_replaced,
    delete_report_files,
    list_reports_filtered,
    load_report_for_edit,
    save_report_file,
)

bp = Blueprint("report", __name__, url_prefix="/api")


def _async_daily_ai_analysis(display_name: str, date_str: str, saved_path: Path, filename: str) -> None:
    """
    仅当保存的是「今天」的日报时，异步调用与「分析页」相同的 analyze_daily_reports（拼接格式一致）。
    结果写入 analysis/daily/姓名-日期.txt。
    """
    try:
        if date_str != date.today().strftime("%Y-%m-%d"):
            return
        full_raw = saved_path.read_text(encoding="utf-8")
        combined = (
            f"--- 文件: {filename} | 客服: {display_name} | 日期: {date_str} ---\n"
            f"{full_raw}\n"
        )
        from services.ai_service import analyze_daily_reports
        from utils.analysis_storage import save_daily_summary

        analysis = analyze_daily_reports(combined)
        out_path = save_daily_summary(display_name, date_str, analysis)
        print(f"[daily AI analysis] saved: {out_path}")
    except Exception as e:
        print(f"[daily AI analysis] skipped or failed: {e}")


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
                print(f"[report save] remove old file: {e}")

        Thread(
            target=_async_daily_ai_analysis,
            args=(display_name, date_clean, path, filename),
            daemon=True,
        ).start()
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


@bp.route("/report", methods=["DELETE"])
def delete_report():
    """删除指定姓名与日期的日报文件及对应 analysis/daily 缓存。"""
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
