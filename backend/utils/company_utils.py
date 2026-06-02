import os
import csv
import json
import logging
import threading
import requests
import time
from datetime import date
from pathlib import Path
from urllib.parse import urljoin
from dotenv import load_dotenv
from openpyxl import Workbook
from openpyxl.styles import Font

load_dotenv()
CSV_DIR = Path("data/company_results")
CSV_DIR.mkdir(parents=True, exist_ok=True)

TASK_FILE = Path("data/tasks.json")
TASK_FILE.parent.mkdir(parents=True, exist_ok=True)

OPEN_CORPORATES_BASE_URL = "https://opencorporates.com/"

CSV_FIELDNAMES = [
    "query_name",
    "final_status",
    "search_status",
    "company_name",
    "company_address",
    "company_start_date",
    "company_status",
    "company_href",
]

CSV_HEADER_LABELS = {
    "query_name": "待查list_name",
    "final_status": "最终判定",
    "search_status": "检索状态",
    "company_name": "检索到的公司名称",
    "company_address": "注册地址",
    "company_start_date": "注册时间",
    "company_status": "inactivate",
    "company_href": "检索网站地址",
}

FINAL_STATUS_WHITELIST = "白名单/有效公司"
FINAL_STATUS_BLACKLIST = "黑名单/无效公司"
FINAL_STATUS_PENDING = "待定，请重试/系统原因"

MONTH_NUMBERS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

task_lock = threading.Lock()

def load_tasks() -> dict:
    """从本地 JSON 文件加载历史任务状态。"""
    if TASK_FILE.exists():
        try:
            return json.loads(TASK_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logging.error(f"加载任务文件失败: {e}")
    return {}

def save_tasks() -> None:
    """将内存中的任务状态写回本地 JSON 文件。"""
    try:
        TASK_FILE.write_text(
            json.dumps(task_store, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    except Exception as e:
        logging.error(f"保存任务文件失败: {e}")

task_store = load_tasks()

def save_tasks() -> None:
    """将内存中的任务状态写回本地 JSON 文件。"""
    try:
        TASK_FILE.write_text(
            json.dumps(task_store, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
    except Exception as e:
        logging.error(f"保存任务文件失败: {e}")


def get_task(task_id: str) -> dict | None:
    """根据任务 ID 获取当前任务状态。"""
    return task_store.get(task_id)

def set_task(task_id: str, value: dict) -> None:
    """线程安全地更新任务状态，并立即持久化。"""
    with task_lock:
        task_store[task_id] = value
        save_tasks()


def _decode_json_value(value):
    """递归解析接口返回的 JSON 字符串，直到得到 Python 对象。"""
    while isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        value = json.loads(text)
    return value


def _extract_result_payload(response_payload):
    """从接口响应中提取 query_name 到检索记录列表的结果对象。"""
    payload = _decode_json_value(response_payload)
    if isinstance(payload, dict) and "result" in payload:
        payload = _decode_json_value(payload["result"])
    if not isinstance(payload, dict):
        raise ValueError("检索结果格式错误：应为 query_name -> records 的对象")
    return payload


def _looks_like_failure(record: dict) -> str:
    """判断单条接口记录是否表示失败，失败时返回错误信息。"""
    status = str(record.get("status") or record.get("search_status") or "").strip().lower()
    if status in {"error", "failed", "fail", "失败", "检索失败"}:
        return str(record.get("message") or record.get("error") or "检索失败").strip()
    if record.get("success") is False:
        return str(record.get("message") or record.get("error") or "检索失败").strip()
    if record.get("error"):
        return str(record.get("error")).strip()
    return ""


def _empty_row(query_name: str, search_status: str, final_status: str = "") -> dict:
    """生成一行只有查询名称和检索状态的占位结果。"""
    return {
        "query_name": query_name,
        "final_status": final_status,
        "search_status": search_status,
    }


def _normalize_company_name(name) -> str:
    """归一化公司名：去掉常见符号和空格，并统一转为大写。"""
    chars_to_remove = " -.,'&"
    return str(name or "").translate(str.maketrans("", "", chars_to_remove)).upper()


def _is_same_company_name(query_name: str, company_name) -> bool:
    """比较待查名称和检索结果公司名归一化后是否完全一致。"""
    normalized_query = _normalize_company_name(query_name)
    normalized_company = _normalize_company_name(company_name)
    return bool(normalized_query and normalized_company and normalized_query == normalized_company)


def normalize_company_href(href) -> str:
    """补全 OpenCorporates 公司链接的主域名。"""
    text = str(href or "").strip()
    if not text:
        return ""
    lower_text = text.lower()
    if lower_text.startswith(("http://", "https://")):
        return text
    if text.startswith("//"):
        return f"https:{text}"
    if lower_text.startswith("opencorporates.com/"):
        return f"https://{text}"
    return urljoin(OPEN_CORPORATES_BASE_URL, text)


def _is_inactive_company_status(company_status) -> bool:
    """判断公司状态是否为 inactive / inactivate。"""
    status = str(company_status or "").strip().lower()
    return status in {"inactive", "inactivate"} or status.startswith(("inactive ", "inactivate "))


def _parse_start_date(company_start_date) -> date | None:
    """解析 OpenCorporates 常见注册时间格式，用于多结果合并时取最早记录。"""
    text = str(company_start_date or "").strip()
    if not text:
        return None

    parts = [
        part.strip(".,")
        for part in text.replace("-", " ").replace("/", " ").split()
        if part.strip(".,")
    ]
    if len(parts) < 3:
        return None

    try:
        if parts[0].isdigit() and parts[1].lower() in MONTH_NUMBERS:
            day = int(parts[0])
            month = MONTH_NUMBERS[parts[1].lower()]
            year = _normalize_year(parts[2])
        elif parts[0].isdigit() and len(parts[0]) == 4 and parts[1].lower() in MONTH_NUMBERS:
            year = _normalize_year(parts[0])
            month = MONTH_NUMBERS[parts[1].lower()]
            day = int(parts[2])
        elif parts[0].isdigit() and len(parts[0]) == 4 and parts[1].isdigit() and parts[2].isdigit():
            year = _normalize_year(parts[0])
            month = int(parts[1])
            day = int(parts[2])
        else:
            return None
        return date(year, month, day)
    except (TypeError, ValueError):
        return None


def _normalize_year(year_text: str) -> int:
    year = int(year_text)
    if year < 100:
        return 2000 + year if year <= 68 else 1900 + year
    return year


def _select_final_record(records: list[dict]) -> dict:
    """多条命中结果合并为一条：优先有地址，再取注册时间最早的记录。"""
    records_with_address = [
        record
        for record in records
        if str(record.get("company_address") or "").strip()
    ]
    candidates = records_with_address or records

    def sort_key(indexed_record):
        index, record = indexed_record
        start_date = _parse_start_date(record.get("company_start_date"))
        return (
            0 if start_date else 1,
            start_date or date.max,
            index,
        )

    return min(enumerate(candidates), key=sort_key)[1]


def _final_row_from_record(query_name: str, record: dict, final_status: str) -> dict:
    """把命中的公司记录收敛为最终 CSV 的单行结果。"""
    row = dict(record)
    row["query_name"] = query_name
    row["final_status"] = final_status
    row["search_status"] = row.get("search_status") or "检索成功"
    row["company_href"] = normalize_company_href(row.get("company_href"))
    return row


def _rows_for_query(query_name: str, records) -> tuple[list[dict], str]:
    """清洗单个查询名对应的检索记录，并返回可写入 CSV 的行和汇总状态。"""
    if records is None or records == []:
        return [_empty_row(query_name, "检索无结果", FINAL_STATUS_BLACKLIST)], "no_result"

    if isinstance(records, str):
        return [_empty_row(query_name, f"检索失败: {records}", FINAL_STATUS_PENDING)], "failed"

    if isinstance(records, dict):
        failure_message = _looks_like_failure(records)
        if failure_message:
            return [_empty_row(query_name, f"检索失败: {failure_message}", FINAL_STATUS_PENDING)], "failed"
        records = [records]

    if not isinstance(records, list):
        return [_empty_row(query_name, "结果格式异常", FINAL_STATUS_PENDING)], "failed"

    matched_records = []
    failure_messages = []
    for record in records:
        if not isinstance(record, dict):
            failure_messages.append("结果格式异常")
            continue

        failure_message = _looks_like_failure(record)
        if failure_message:
            failure_messages.append(failure_message)
            continue
        logging.debug(f"正在清洗检索噪声")
        if not _is_same_company_name(query_name, record.get("company_name")):
            continue

        matched_records.append(record)

    if matched_records:
        active_records = [
            record
            for record in matched_records
            if not _is_inactive_company_status(record.get("company_status"))
        ]
        if active_records:
            return [
                _final_row_from_record(
                    query_name,
                    _select_final_record(active_records),
                    FINAL_STATUS_WHITELIST,
                )
            ], "success"
        return [
            _final_row_from_record(
                query_name,
                _select_final_record(matched_records),
                FINAL_STATUS_BLACKLIST,
            )
        ], "success"

    if failure_messages:
        message = "; ".join(dict.fromkeys(str(msg).strip() for msg in failure_messages if str(msg).strip()))
        return [
            _empty_row(query_name, f"检索失败: {message or '系统原因'}", FINAL_STATUS_PENDING)
        ], "failed"

    return [_empty_row(query_name, "检索无精确匹配结果", FINAL_STATUS_BLACKLIST)], "no_result"


def _build_summary(total: int, counts: dict) -> dict:
    """根据成功、失败、无结果数量生成前端展示用的任务汇总。"""
    failed = counts["failed"]
    no_result = counts["no_result"]
    success = counts["success"]
    return {
        "total": total,
        "success": success,
        "failed": failed,
        "no_result": no_result,
        "has_partial_failure": failed > 0 and success > 0,
        "has_failure": failed > 0,
        "has_no_result": no_result > 0,
    }


def save_to_csv(data: dict, task_id: str, query_names: list[str] | None = None) -> tuple[Path, dict]:
    """将检索结果清洗后保存为 CSV，并返回文件路径和汇总信息。"""
    csv_path = CSV_DIR / f"{task_id}.csv"
    counts = {"success": 0, "failed": 0, "no_result": 0}
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        writer.writerow(CSV_HEADER_LABELS)
        ordered_query_names = list(query_names or data.keys())
        ordered_query_names.extend(k for k in data.keys() if k not in ordered_query_names)

        for query_name in ordered_query_names:
            rows, query_status = _rows_for_query(query_name, data.get(query_name))
            counts[query_status] += 1
            for row in rows:
                writer.writerow(row)
    return csv_path, _build_summary(len(ordered_query_names), counts)


def save_failure_csv(task_id: str, query_names: list[str], message: str) -> tuple[Path, dict]:
    """整批请求失败时生成可下载的失败明细 CSV。"""
    data = {name: {"status": "error", "message": message} for name in query_names}
    return save_to_csv(data, task_id, query_names)


def build_result_rows(data: dict, query_names: list[str] | None = None) -> tuple[list[dict], dict]:
    counts = {"success": 0, "failed": 0, "no_result": 0}
    rows = []
    ordered_query_names = list(query_names or data.keys())
    ordered_query_names.extend(k for k in data.keys() if k not in ordered_query_names)

    for query_name in ordered_query_names:
        query_rows, query_status = _rows_for_query(query_name, data.get(query_name))
        counts[query_status] += 1
        rows.extend(query_rows)

    return rows, _build_summary(len(ordered_query_names), counts)


def group_result_rows(rows: list[dict]) -> dict:
    grouped = {}
    for row in rows:
        name = row.get("query_name") or row.get("company_name") or "unknown"
        grouped.setdefault(name, []).append(row)
    return grouped


def save_to_xlsx(data: dict, task_id: str, query_names: list[str] | None = None) -> tuple[Path, dict, dict]:
    xlsx_path = CSV_DIR / f"{task_id}.xlsx"
    rows, summary = build_result_rows(data, query_names)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "company_results"

    for col_index, field in enumerate(CSV_FIELDNAMES, start=1):
        cell = sheet.cell(row=1, column=col_index, value=CSV_HEADER_LABELS.get(field, field))
        cell.font = Font(bold=True)
        sheet.column_dimensions[cell.column_letter].width = 24

    for row_index, row in enumerate(rows, start=2):
        for col_index, field in enumerate(CSV_FIELDNAMES, start=1):
            sheet.cell(row=row_index, column=col_index, value=str(row.get(field, "") or ""))

    workbook.save(xlsx_path)
    return xlsx_path, summary, group_result_rows(rows)


def save_failure_xlsx(task_id: str, query_names: list[str], message: str) -> tuple[Path, dict, dict]:
    data = {name: {"status": "error", "message": message} for name in query_names}
    return save_to_xlsx(data, task_id, query_names)


def do_search(task_id: str, names: list) -> None:
    """后台调用 OpenCorporates 检索接口，并把结果写入任务状态和 XLSX。"""
    url = os.getenv("SEARCH_URL", "")

    logging.info(
        f"开始检索，任务ID: {task_id}, 待查公司数量: {len(names)}"
    )

    max_retries = 3
    retry_interval = 5  # 秒

    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            logging.info(
                f"开始请求检索服务，第 {attempt}/{max_retries} 次尝试"
            )
            response = requests.post(
                url,
                json={"company_name_list": names},
                timeout=36000
            )
            response.raise_for_status()
            result = response.json()
            logging.info(
                f"检索成功，第 {attempt} 次尝试成功"
            )
            logging.info(
                f"检索结果:\n{json.dumps(result, ensure_ascii=False, indent=2)}"
            )
            inner = _extract_result_payload(result)
            xlsx_path, summary, result_data = save_to_xlsx(
                inner,
                task_id,
                names
            )
            set_task(
                task_id,
                {
                    "status": "done",
                    "file": str(xlsx_path),
                    "summary": summary,
                    "data": result_data,
                    "names": names,
                },
            )
            return
        except Exception as e:
            last_error = e
            logging.exception(
                f"第 {attempt}/{max_retries} 次检索失败: {e}"
            )
            if attempt < max_retries:
                logging.info(
                    f"{retry_interval} 秒后开始重试..."
                )
                time.sleep(retry_interval)
    # 三次都失败
    logging.error(
        f"检索最终失败，任务ID={task_id}，错误={last_error}"
    )
    xlsx_path, summary, result_data = save_failure_xlsx(
        task_id,
        names,
        str(last_error)
    )
    set_task(
        task_id,
        {
            "status": "done",
            "file": str(xlsx_path),
            "summary": summary,
            "data": result_data,
            "names": names,
            "message": f"检索失败，已重试 {max_retries} 次: {last_error}",
        },
    )



    
