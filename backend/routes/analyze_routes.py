"""
AI 分析日报。
"""
from flask import Blueprint, jsonify, request

from services.ai_service import analyze_daily_reports
from utils.analysis_storage import (
    analyze_cache_path,
    read_utf8,
    try_merge_daily_analysis,
    write_utf8,
)
from utils.file_utils import collect_reports_for_analysis

bp = Blueprint("analyze", __name__, url_prefix="/api")


@bp.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json(silent=True) or {}
        names = data.get("names")
        start_date = data.get("start_date", "")
        end_date = data.get("end_date", "")
        force_refresh = bool(data.get("force_refresh") or data.get("refresh"))

        if not start_date or not end_date:
            return jsonify(
                {"success": False, "message": "请提供 start_date 与 end_date（YYYY-MM-DD）"}
            ), 400

        if names is not None and not isinstance(names, list):
            return jsonify({"success": False, "message": "names 须为字符串数组"}), 400

        name_list = None
        if names is not None and len(names) > 0:
            name_list = [str(n).strip() for n in names if n and str(n).strip()]

        start_s = str(start_date).strip()
        end_s = str(end_date).strip()

        # 与缓存一致的 names 列表（空列表表示全部人员）
        cache_names = sorted(name_list) if name_list else []
        cache_file = analyze_cache_path(cache_names, start_s, end_s)

        if not force_refresh:
            # 单日：优先使用 analysis/daily 下已生成的文件（与上传自动生成同源）
            if start_s == end_s:
                merged_daily = try_merge_daily_analysis(start_s, name_list)
                if merged_daily is not None:
                    return jsonify(
                        {
                            "success": True,
                            "analysis": merged_daily.strip(),
                            "cached": True,
                            "source": "daily",
                        }
                    )

            cached = read_utf8(cache_file)
            if cached is not None:
                return jsonify(
                    {
                        "success": True,
                        "analysis": cached.strip(),
                        "cached": True,
                        "source": "cache",
                        "cache_path": str(cache_file),
                    }
                )

        combined = collect_reports_for_analysis(
            names=name_list,
            start_date=start_s,
            end_date=end_s,
        )
        analysis = analyze_daily_reports(combined)
        write_utf8(cache_file, analysis)
        return jsonify(
            {
                "success": True,
                "analysis": analysis,
                "cached": False,
                "source": "live",
                "cache_path": str(cache_file),
            }
        )
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"分析失败: {e}"}), 500
