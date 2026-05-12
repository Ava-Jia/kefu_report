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

export default client;
