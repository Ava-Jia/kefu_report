import { useState, useEffect, useRef, useCallback } from "react";
import {
  Input, Button, Card, Tag, Space,
  Drawer, List, Badge, message, Tooltip
} from "antd";
import {
  SearchOutlined, DownloadOutlined,
  UnorderedListOutlined, ReloadOutlined
} from "@ant-design/icons";
import {
  searchCompany,
  checkCompanyResult,
  fetchCompanyTasks,
  downloadCompanyCSV,
} from "../api.js";

export default function CompanySearch() {
  const [multiText, setMultiText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAllTasks, setLoadingAllTasks] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tasks, setTasks] = useState(() => {
  try {
    const saved = localStorage.getItem("company_tasks");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
});
  const pollingRef = useRef(null);
  const tasksRef = useRef(tasks);

  // 保持 tasksRef 和 tasks 同步，避免闭包拿到旧值
  useEffect(() => {
    tasksRef.current = tasks; 
    localStorage.setItem("company_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const getCompanyNames = () =>
    multiText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const formatTaskTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

  const normalizeTask = (task) => ({
    taskId: task.taskId || task.task_id,
    names: Array.isArray(task.names) ? task.names : [],
    status: task.status || "pending",
    summary: task.summary,
    message: task.message,
    downloadable: task.downloadable,
    createdAt: task.createdAt || formatTaskTime(task.updated_at),
  });

  const renderTaskStatus = (task) => {
    if (task.status === "pending") {
      return <Badge status="processing" text="检索中" />;
    }
    if (task.status === "error") {
      return <Badge status="error" text="失败" />;
    }
    const summary = task.summary;
    if (summary?.failed > 0 && !summary?.success) {
      return <Badge status="error" text="已完成（全部失败）" />;
    }
    if (summary?.failed > 0) {
      return <Badge status="warning" text="已完成（部分失败）" />;
    }
    if (summary?.no_result > 0) {
      return <Badge status="warning" text="已完成（含无结果）" />;
    }
    return <Badge status="success" text="已完成" />;
  };

  // 先查网络，拿到结果再更新状态
  const pollPendingTasks = useCallback(async () => {
    const pending = tasksRef.current.filter((t) => t.status === "pending");
     console.log("poll 触发，pending 数量:", pending.length); 
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async (task) => {
        try {
          const res = await checkCompanyResult(task.taskId);
          if (res.status === "done" || res.status === "error") {
            setTasks((cur) =>
              cur.map((t) =>
                t.taskId === task.taskId
                  ? {
                      ...t,
                      status: res.status,
                      summary: res.summary,
                      message: res.message,
                    }
                  : t
              )
            );
          }
        } catch {}
      })
    );
  }, []);

  const handleFetchAllTasks = useCallback(async ({ openDrawer = false } = {}) => {
    setLoadingAllTasks(true);
    try {
      const res = await fetchCompanyTasks();
      if (!res.success) {
        throw new Error(res.message);
      }
      const nextTasks = (res.tasks || []).map(normalizeTask);
      setTasks(nextTasks);
      if (openDrawer) {
        setDrawerOpen(true);
      }
      message.success(`已同步 ${nextTasks.length} 个任务`);
    } catch (e) {
      message.error(e.message || "查询任务失败");
    } finally {
      setLoadingAllTasks(false);
    }
  }, []);

  // 有 pending 任务时启动轮询，全部完成后自动停止
  useEffect(() => {
    const hasPending = tasks.some((t) => t.status === "pending");
    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(pollPendingTasks, 30000); // 每30秒轮询一次
    }
    if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [tasks, pollPendingTasks]);

  const handleSearch = async () => {
    const companyNames = getCompanyNames();
    if (companyNames.length === 0) {
      message.warning("请至少输入一个公司名称");
      return;
    }
    setSubmitting(true);
    try {
      const params = companyNames.map((n) => `name=${encodeURIComponent(n)}`).join("&");
      const res = await searchCompany(params);
      if (!res.success) throw new Error(res.message);

      setTasks((prev) => [
        {
          taskId: res.task_id,
          names: companyNames,
          status: "pending",
          createdAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      setMultiText("");
      message.success("任务已提交，可在任务列表中查看进度");
    } catch (e) {
      message.error(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (taskId) => {
    try {
      await downloadCompanyCSV(taskId);
      message.success("下载成功");
    } catch (e) {
      message.error(e.message || "下载失败");
    }
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const searchCount = getCompanyNames().length;

  return (
    <div style={{ padding: 24, background: "#f0f2f5", minHeight: "100vh" }}>
      <Card
        title="公司信息批量检索"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleFetchAllTasks({ openDrawer: true })}
              loading={loadingAllTasks}
            >
              查询全部任务
            </Button>
            <Badge count={pendingCount} offset={[-4, 4]}>
              <Button
                icon={<UnorderedListOutlined />}
                onClick={() => setDrawerOpen(true)}
              >
                任务列表 ({tasks.length})
              </Button>
            </Badge>
          </Space>
        }
      >
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#666" }}>每行一个公司名称</span>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={submitting}
            size="large"
            style={{ minWidth: 120 }}
          >
            提交检索 ({searchCount} 家)
          </Button>
        </div>
        <Input.TextArea
          rows={6}
          placeholder={"Tencent Holdings Ltd\nAlibaba Group Holding Ltd\nBaidu Inc"}
          value={multiText}
          onChange={(e) => setMultiText(e.target.value)}
          style={{ fontFamily: "monospace", marginBottom: 8 }}
        />
        <div style={{ color: "#999", fontSize: 12 }}>
          提交后任务在后台运行，可继续提交新任务
        </div>
      </Card>

      <Drawer
        title="任务列表"
        placement="right"
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Tooltip title="查询全部任务">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleFetchAllTasks()}
              loading={loadingAllTasks}
              size="small"
            />
          </Tooltip>
        }
      >
        {tasks.length === 0 ? (
          <div style={{ color: "#999", textAlign: "center", marginTop: 60 }}>
            暂无任务，请先提交检索
          </div>
        ) : (
          <List
            dataSource={tasks}
            renderItem={(task) => (
              <List.Item
                key={task.taskId}
                actions={[
                  task.status === "done" && (
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownload(task.taskId)}
                    >
                      下载 XLSX
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {task.status === "pending" && <Badge status="processing" text="检索中" />}
                      {task.status === "done" && renderTaskStatus(task)}
                      {task.status === "error" && <Badge status="error" text="失败" />}
                      <span style={{ color: "#999", fontSize: 12 }}>{task.createdAt}</span>
                    </Space>
                  }
                  description={
                    <div>
                      {task.names.slice(0, 3).map((n) => (
                        <Tag key={n} style={{ marginBottom: 4 }}>{n}</Tag>
                      ))}
                      {task.names.length > 3 && (
                        <Tag>+{task.names.length - 3} 家</Tag>
                      )}
                      {task.summary && (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="green">成功 {task.summary.success || 0}</Tag>
                          <Tag color="orange">无结果 {task.summary.no_result || 0}</Tag>
                          <Tag color="red">失败 {task.summary.failed || 0}</Tag>
                        </div>
                      )}
                      {task.message && (
                        <div style={{ color: "#999", fontSize: 12, marginTop: 4 }}>
                          {task.message}
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
}
