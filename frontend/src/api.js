import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

export async function saveReport(payload) {
  const { data } = await client.post("/report/save", payload);
  return data;
}

export async function fetchReports(params = {}) {
  const { data } = await client.get("/reports", { params });
  return data;
}

export async function fetchReport(name, date) {
  const { data } = await client.get("/report", {
    params: { name, date },
  });
  return data;
}

export async function deleteReport(name, date) {
  const { data } = await client.delete("/report", {
    params: { name, date },
  });
  return data;
}


/** 定时全局总结列表 / 详情；view: daily | weekly | monthly */
export async function fetchAnalyzeSummaryList(view) {
  const { data } = await client.get("/analyze/list", { params: { view } });
  return data;
}

// 两个参数 view + key (哪个日/周/月)
export async function fetchAnalyzeSummaryDetail(view, key) {
  const { data } = await client.get("/analyze/detail", {
    params: { view, key },
  });
  return data;
}

/** status: pending | archived */
export async function fetchKnowledgeItems(status) {
  const { data } = await client.get("/knowledge/items", { params: { status } });
  return data;
}

export async function updateKnowledgeItem(status, id, body) {
  const { data } = await client.put(
    `/knowledge/items/${encodeURIComponent(id)}`,
    body,
    { params: { status } }
  );
  return data;
}

export async function deleteKnowledgeItem(status, id) {
  const { data } = await client.delete(
    `/knowledge/items/${encodeURIComponent(id)}`,
    { params: { status } }
  );
  return data;
}

export async function archiveKnowledgeItem(id) {
  const { data } = await client.post(
    `/knowledge/items/${encodeURIComponent(id)}/archive`
  );
  return data;
}

export async function fetchWechatBotKnowledge(params = {}) {
  const { data } = await client.get("/items", { params });
  return data;
}

export async function addWechatBotKnowledgeItem(body) {
  const { data } = await client.post("/items", body);
  return data;
}

export async function updateWechatBotKnowledgeItem(id, body) {
  const { data } = await client.put(`/items/${encodeURIComponent(id)}`, body);
  return data;
}

export async function deleteWechatBotKnowledgeItem(id) {
  const { data } = await client.delete(`/items/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchKnowledgeCategories() {
  const res = await axios.get("/api/categories");
  return res.data;
}

/** action_type=insert|update 且传 page/page_size 时返回 { list, pagination } */
export async function fetchWechatBotTodos(params = {}) {
  const { data } = await client.get("/todos", { params });
  return data;
}

export async function updateWechatBotTodo(id, body) {
  const { data } = await client.put(`/todos/${encodeURIComponent(id)}`, body);
  return data;
}

export async function deleteWechatBotTodo(id) {
  const { data } = await client.delete(`/todos/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchTodoCategories(actionType) {
  const { data } = await client.get("/todos/categories", {
    params: { action_type: actionType },
  });
  return data;
}

export async function writeWechatBotTodoToQa(id) {
  const { data } = await client.post(`/todos/${encodeURIComponent(id)}/writetoqa`);
  return data;
}

const unwrapCompanyError = (error) => {
  if (error.response?.data) {
    return error.response.data;
  }
  throw error;
};

/** 公司检索 - 异步任务，返回 task_id */
export const searchCompany = async (companyNameList, searchName) => {
  try {
    const { data } = await client.post("/companys/search", {
      company_name_list: companyNameList,
      search_name: searchName,
    });
    return data;
  } catch (error) {
    return unwrapCompanyError(error);
  }
};

/** 查询检索任务状态 */
export const checkCompanyResult = async (taskId) => {
  try {
    const { data } = await client.get(`/companys/task/${encodeURIComponent(taskId)}`);
    return data;
  } catch (error) {
    return unwrapCompanyError(error);
  }
};

/** 重试 OpenCorporates 检索任务 */
export const retryCompanyTask = async (taskId) => {
  try {
    const { data } = await client.post(`/companys/task/${encodeURIComponent(taskId)}/retry`);
    return data;
  } catch (error) {
    return unwrapCompanyError(error);
  }
};

/** 查询全部公司检索任务 */
export const fetchCompanyTasks = async (limit = 200, offset = 0) => {
  try {
    const { data } = await client.get("/companys/tasks", {
      params: { limit, offset },
    });
    return data;
  } catch (error) {
    return unwrapCompanyError(error);
  }
};

/** 下载公司检索结果为 XLSX */
export const downloadCompanyXlsx = async (taskId) => {
  const response = await fetch(`/api/companys/task/${encodeURIComponent(taskId)}/export-xlsx`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || "下载失败");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = match
    ? match[1].replace(/['"]/g, "")
    : `open_corporates_${taskId}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};


export default client;
