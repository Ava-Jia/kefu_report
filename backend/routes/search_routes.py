import os
import requests
from flask import request, jsonify, Blueprint, send_file

from utils.company_utils import (
    normalize_company_name_list,
    submit_open_corporates_task,
    get_open_corporates_task,
    retry_open_corporates_task,
    delete_open_corporates_task,
    list_open_corporates_tasks,
    search_open_corporates_from_db,
    create_xlsx_from_db_search,
    create_xlsx_from_open_corporates_task,
)


bp = Blueprint("company", __name__, url_prefix="/api")


@bp.route("/companys/search", methods=["POST"])
def search_companys():
    """
    日报系统提交 OpenCorporates 查询任务。

    请求:
    {
        "company_name_list": [
            "TPD ENTERPRISE INC",
            "ABC COMPANY LLC"
        ],
        "search_name": "张三"
    }

    返回:
    {
        "success": true,
        "task_id": "...",
        "message": "OpenCorporates查询任务已创建",
        "company_name_list": [...],
        "search_name": "张三"
    }
    """
    try:
        data = request.get_json(silent=True) or {}

        company_name_list = normalize_company_name_list(
            data.get("company_name_list")
        )
        search_name = str(
            data.get("search_name") or ""
        ).strip()

        if not company_name_list:
            return jsonify({
                "success": False,
                "error": "company_name_list不能为空，并且必须是数组"
            }), 400

        if not search_name:
            return jsonify({
                "success": False,
                "error": "search_name不能为空"
            }), 400

        result = submit_open_corporates_task(company_name_list, search_name)

        return jsonify({
            "success": True,
            "task_id": result.get("task_id"),
            "message": result.get("message"),
            "company_name_list": company_name_list,
            "search_name": result.get("search_name") or search_name,
        })

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except requests.HTTPError as e:
        return jsonify({
            "success": False,
            "error": "系统A创建OpenCorporates任务失败",
            "detail": str(e),
        }), 502

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/search/db", methods=["POST"])
def search_companys_from_db():
    """
    直接查询系统A数据库中已有的公司结果，不触发爬虫。
    """
    try:
        data = request.get_json(silent=True) or {}
        company_name_list = normalize_company_name_list(
            data.get("company_name_list")
        )
        if not company_name_list:
            return jsonify({
                "success": False,
                "error": "company_name_list不能为空，并且必须是数组"
            }), 400
        result = search_open_corporates_from_db(company_name_list)
        return jsonify({
            "success": True,
            "company_results": result.get("company_results"),
        })
    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504
    except requests.HTTPError as e:
        return jsonify({
            "success": False,
            "error": "查询系统A数据库结果失败",
            "detail": str(e),
        }), 502
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/search/db/export-xlsx", methods=["POST"])
def export_company_db_xlsx():
    """
    直接查询系统A数据库中的公司结果，并导出 XLSX。
    不触发爬虫，不创建任务。

    请求:
    {
        "company_name_list": [
            "TPD ENTERPRISE INC",
            "ABC COMPANY LLC"
        ]
    }
    """
    try:
        data = request.get_json(silent=True) or {}

        company_name_list = normalize_company_name_list(
            data.get("company_name_list")
        )

        if not company_name_list:
            return jsonify({
                "success": False,
                "error": "company_name_list不能为空，并且必须是数组"
            }), 400

        xlsx_path, summary, result_data = create_xlsx_from_db_search(company_name_list)

        return send_file(
            xlsx_path,
            as_attachment=True,
            download_name=xlsx_path.name,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except requests.HTTPError as e:
        return jsonify({
            "success": False,
            "error": "查询系统A数据库结果失败",
            "detail": str(e),
        }), 502

    except ValueError as e:
        return jsonify({
            "success": False,
            "error": str(e),
        }), 400

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/task/<task_id>", methods=["GET"])
def get_company_task(task_id):
    """
    日报系统根据 task_id 查询 OpenCorporates 任务结果。
    数据直接来自系统A。
    """
    try:
        task = get_open_corporates_task(task_id)

        return jsonify({
            "success": True,
            "task": task,
        })

    except requests.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 502

        if status_code == 404:
            return jsonify({
                "success": False,
                "error": "OpenCorporates任务不存在",
                "task_id": task_id,
            }), 404

        return jsonify({
            "success": False,
            "error": "查询系统A任务失败",
            "detail": str(e),
        }), 502

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/task/<task_id>/retry", methods=["POST"])
def retry_company_task(task_id):
    """
    Retry an OpenCorporates task in System A.
    Re-submits the original task input, then deletes the source task.

    Proxies:
    GET /openCorporates/task/{task_id}
    POST /openCorporates/search/async
    DELETE /tasks/open-corporates/{task_id}
    """
    try:
        result = retry_open_corporates_task(task_id)

        return jsonify({
            **result,
            "success": result.get("success", True),
            "source_task_id": task_id,
        })

    except requests.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 502

        if status_code == 404:
            return jsonify({
                "success": False,
                "error": "OpenCorporates任务不存在",
                "task_id": task_id,
            }), 404

        if status_code in {400, 409, 422}:
            detail = None
            if e.response is not None:
                try:
                    detail = e.response.json()
                except ValueError:
                    detail = e.response.text

            return jsonify({
                "success": False,
                "error": "OpenCorporates任务重试失败",
                "detail": detail or str(e),
                "task_id": task_id,
            }), status_code

        return jsonify({
            "success": False,
            "error": "请求系统A重试OpenCorporates任务失败",
            "detail": str(e),
            "task_id": task_id,
        }), 502

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except ValueError as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "task_id": task_id,
        }), 400

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/task/<task_id>", methods=["DELETE"])
def delete_company_task(task_id):
    """
    删除系统A中的 OpenCorporates 任务。

    代理:
    DELETE /tasks/open-corporates/{task_id}
    """
    try:
        result = delete_open_corporates_task(task_id)

        return jsonify({
            **result,
            "success": result.get("success", True),
            "task_id": task_id,
        })

    except requests.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 502

        if status_code == 404:
            return jsonify({
                "success": False,
                "error": "OpenCorporates任务不存在",
                "task_id": task_id,
            }), 404

        return jsonify({
            "success": False,
            "error": "删除系统A OpenCorporates任务失败",
            "detail": str(e),
            "task_id": task_id,
        }), 502

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/tasks", methods=["GET"])
def get_company_tasks():
    """
    日报系统查询 OpenCorporates 历史任务列表。
    数据直接来自系统A。

    示例:
    GET /api/companys/tasks?limit=50&offset=0
    """
    try:
        limit = min(int(request.args.get("limit", 50)), 50)
        offset = int(request.args.get("offset", 0))

        data = list_open_corporates_tasks(
            limit=limit,
            offset=offset,
        )

        return jsonify({
            "success": True,
            "data": data,
        })

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except requests.HTTPError as e:
        return jsonify({
            "success": False,
            "error": "查询系统A历史任务失败",
            "detail": str(e),
        }), 502

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@bp.route("/companys/task/<task_id>/export-xlsx", methods=["GET"])
def export_company_task_xlsx(task_id):
    """
    根据系统A的 task_id 查询结果，并导出 XLSX。
    不再依赖日报系统本地任务库。
    """
    try:
        xlsx_path, summary, result_data = create_xlsx_from_open_corporates_task(task_id)

        return send_file(
            xlsx_path,
            as_attachment=True,
            download_name=f"open_corporates_{task_id}.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    except requests.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 502

        if status_code == 404:
            return jsonify({
                "success": False,
                "error": "OpenCorporates任务不存在",
                "task_id": task_id,
            }), 404

        return jsonify({
            "success": False,
            "error": "查询系统A任务失败",
            "detail": str(e),
        }), 502

    except ValueError as e:
        return jsonify({
            "success": False,
            "error": str(e),
        }), 400

    except requests.Timeout:
        return jsonify({
            "success": False,
            "error": "请求系统A超时"
        }), 504

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
        }), 500
