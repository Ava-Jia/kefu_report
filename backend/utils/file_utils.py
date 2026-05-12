"""
本地 txt 日报读写与筛选。
"""
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 文件名：姓名_YYYY-MM-DD.txt（姓名内不建议含下划线；若含则按最长匹配日期后缀解析）
FILENAME_PATTERN = re.compile(r"^(.+)_(\d{4}-\d{2}-\d{2})\.txt$")


def get_reports_dir() -> Path:
    base = Path(__file__).resolve().parent.parent
    reports = base / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    return reports


def sanitize_name_for_filename(name: str) -> str:
    """去掉文件名非法字符，保留中文、字母、数字、下划线、短横线。"""
    s = name.strip()
    if not s:
        raise ValueError("姓名不能为空")
    # Windows 非法字符
    for ch in '<>:"/\\|?*':
        s = s.replace(ch, "")
    s = s.strip(". ")
    if not s:
        raise ValueError("姓名无效")
    return s


def format_report_txt(name: str, date_str: str, content: str) -> str:
    body = content.rstrip()
    return (
        f"姓名：{name}\n"
        f"日期：{date_str}\n\n"
        f"日报内容：\n\n"
        f"{body}\n"
    )


def extract_body_from_saved_txt(raw: str) -> str:
    """从已保存文件中取出「日报内容」正文，供表单编辑。"""
    marker = "日报内容："
    idx = raw.find(marker)
    if idx == -1:
        return raw.strip()
    body = raw[idx + len(marker) :].lstrip()
    return body.rstrip()


def parse_header_name_date(raw: str) -> Tuple[Optional[str], Optional[str]]:
    name_val, date_val = None, None
    for line in raw.splitlines():
        if line.startswith("姓名："):
            name_val = line.replace("姓名：", "").strip() or name_val
        elif line.startswith("日期："):
            d = line.replace("日期：", "").strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", d):
                date_val = d
        if name_val and date_val:
            break
    return name_val, date_val


def delete_report_files(name: str, date_str: str) -> bool:
    """
    删除 reports 目录下对应 txt。
    返回是否删除了日报文件（不存在则为 False）。
    """
    d = str(date_str).strip()
    datetime.strptime(d, "%Y-%m-%d")
    path = get_reports_dir() / f"{sanitize_name_for_filename(name)}_{d}.txt"
    existed = path.is_file()
    if existed:
        path.unlink()
    return existed


def delete_previous_report_if_replaced(
    old_name: str, old_date: str, new_name: str, new_date: str
) -> bool:
    """
    编辑保存后：若旧文件路径与新路径不同，删除旧 reports 下 txt。
    姓名+日期未变则视为覆盖同一文件，不删除。
    """
    od = str(old_date).strip()
    nd = str(new_date).strip()
    old_path = get_reports_dir() / f"{sanitize_name_for_filename(old_name)}_{od}.txt"
    new_path = get_reports_dir() / f"{sanitize_name_for_filename(new_name)}_{nd}.txt"
    if old_path.resolve() == new_path.resolve():
        return False
    if not old_path.is_file():
        return False
    old_path.unlink()
    return True


def save_report_file(name: str, date_str: str, content: str) -> Tuple[str, Path]:
    safe_name = sanitize_name_for_filename(name)
    # 校验日期格式
    datetime.strptime(date_str, "%Y-%m-%d")
    reports_dir = get_reports_dir()
    filename = f"{safe_name}_{date_str}.txt"
    path = reports_dir / filename
    text = format_report_txt(name.strip(), date_str, content)
    path.write_text(text, encoding="utf-8")
    return filename, path


def parse_filename(filename: str) -> Optional[Tuple[str, str]]:
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    return m.group(1), m.group(2)


def list_report_files() -> List[Path]:
    reports_dir = get_reports_dir()
    return sorted([p for p in reports_dir.glob("*.txt") if p.is_file()])


def read_report_meta_and_content(path: Path) -> Dict[str, Any]:
    parsed = parse_filename(path.name)
    if parsed:
        name_from_file, date_from_file = parsed
    else:
        name_from_file, date_from_file = path.stem, ""

    raw = path.read_text(encoding="utf-8")
    display_name = name_from_file
    display_date = date_from_file
    pn, pd = parse_header_name_date(raw)
    if pn:
        display_name = pn
    if pd:
        display_date = pd

    return {
        "filename": path.name,
        "name": display_name,
        "date": display_date,
        "content": raw,
        "size": path.stat().st_size,
    }


def list_distinct_names_for_date(date_str: str) -> List[str]:
    """某日已有日报的全部客服姓名（去重、排序）。"""
    names: List[str] = []
    target = str(date_str).strip()
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        if meta.get("date") == target:
            names.append(meta["name"])
    return sorted(set(names))

def _parse_date_optional(s: Optional[str]):
    if not s or not str(s).strip():
        return None
    return datetime.strptime(str(s).strip(), "%Y-%m-%d").date()


def list_reports_filtered(
    name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """列表筛选：姓名、起止日期（含边界）。"""
    start_dt = _parse_date_optional(start_date)
    end_dt = _parse_date_optional(end_date)

    results: List[Dict[str, Any]] = []
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        d_str = meta.get("date") or ""
        if not d_str:
            continue
        try:
            file_date = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue

        if name and name.strip() and meta["name"] != name.strip():
            continue
        if start_dt and file_date < start_dt:
            continue
        if end_dt and file_date > end_dt:
            continue

        body = extract_body_from_saved_txt(meta["content"])
        results.append(
            {
                "filename": meta["filename"],
                "name": meta["name"],
                "date": meta["date"],
                "content": body,
            }
        )

    results.sort(key=lambda x: (x["date"], x["name"]), reverse=True)
    return results


def load_report_for_edit(name: str, date_str: str) -> Optional[Dict[str, str]]:
    """读取单条日报，返回表单用字段。"""
    ds = str(date_str).strip()
    datetime.strptime(ds, "%Y-%m-%d")

    safe = sanitize_name_for_filename(name)
    path = get_reports_dir() / f"{safe}_{ds}.txt"
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8")
    pn, pd = parse_header_name_date(raw)
    body = extract_body_from_saved_txt(raw)
    return {
        "name": (pn or name).strip(),
        "date": (pd or date_str).strip(),
        "content": body,
        "raw": raw,
    }


def collect_reports_for_analyze(
    names: Optional[List[str]],
    start_date: str,
    end_date: str,
) -> str:
    """
    按人员与日期范围读取日报正文并拼接（用于 Prompt）。
    names 为空或 None 表示全部人员。
    """
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    if start_dt > end_dt:
        raise ValueError("开始日期不能晚于结束日期")

    name_set = None
    if names:
        name_set = {n.strip() for n in names if n and str(n).strip()}

    chunks: List[str] = []
    for path in list_report_files():
        meta = read_report_meta_and_content(path)
        d_str = meta.get("date") or ""
        if not d_str:
            continue
        try:
            file_date = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        if file_date < start_dt or file_date > end_dt:
            continue
        if name_set is not None and meta["name"] not in name_set:
            continue

        chunks.append(
            f"--- 文件: {meta['filename']} | 客服: {meta['name']} | 日期: {meta['date']} ---\n"
            f"{meta['content']}\n"
        )

    if not chunks:
        raise ValueError("所选条件下没有找到任何日报文件，请先提交日报或调整筛选条件")

    return "\n".join(chunks)
