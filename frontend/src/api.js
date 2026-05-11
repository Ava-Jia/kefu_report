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

export async function analyzeReports(payload) {
  const { data } = await client.post("/analyze", payload);
  return data;
}

export default client;
