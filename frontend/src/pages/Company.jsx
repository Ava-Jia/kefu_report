import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Input, Button, Card, Tag, Space, Table,
  List, Badge, message, Tooltip, Modal, Empty, AutoComplete
} from "antd";
import {
  SearchOutlined, DownloadOutlined,
  UnorderedListOutlined, ReloadOutlined,
  PlusOutlined, DeleteOutlined, ClearOutlined
} from "@ant-design/icons";
import {
  searchCompany,
  checkCompanyResult,
  fetchCompanyTasks,
  downloadCompanyXlsx,
} from "../api.js";

const DEFAULT_INPUT_ROW_COUNT = 5;

// 固定检索人候选项：在这里改成你需要的名字
const SEARCHER_OPTIONS = ["luna", "IRIS", "H", "TEST"];

let companyInputRowId = 0;

const createCompanyRow = (name = "") => ({
  key: `company-input-${companyInputRowId++}`,
  name,
});

const createCompanyRows = (count) =>
  Array.from({ length: count }, () => createCompanyRow());

const cleanCompanyName = (value) =>
  String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim()
    .replace(/\s+/g, " ");

const cleanSearchName = (value) =>
  String(value || "").trim().replace(/\s+/g, " ");

const parseCompanyPaste = (text) =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split("\t").map(cleanCompanyName).filter(Boolean);
      return cells[0] || cleanCompanyName(line);
    })
    .filter(Boolean);

const DONE_STATUSES = new Set(["done", "completed", "complete", "success", "succeeded"]);
const ERROR_STATUSES = new Set(["error", "failed", "fail", "failure", "cancelled", "canceled"]);

const parseJsonValue = (value) => {
  let current = value;
  for (let i = 0; i < 2 && typeof current === "string"; i += 1) {
    try {
      current = JSON.parse(current);
    } catch {
      return value;
    }
  }
  return current;
};

const normalizeTaskStatus = (status) => {
  const value = String(status || "pending").trim().toLowerCase();
  if (DONE_STATUSES.has(value)) return "done";
  if (ERROR_STATUSES.has(value)) return "error";
  return "pending";
};

const extractTaskList = (response) => {
  const payload = response?.data ?? response;
  const candidates = [
    response?.tasks,
    payload?.tasks,
    payload?.data,
    payload?.data?.tasks,
    payload?.items,
    payload?.results,
    payload,
  ];

  return candidates.find(Array.isArray) || [];
};

export default function CompanySearch() {
  const [companyRows, setCompanyRows] = useState(() =>
    createCompanyRows(DEFAULT_INPUT_ROW_COUNT)
  );
  const [submitting, setSubmitting] = useState(false);
  const [loadingAllTasks, setLoadingAllTasks] = useState(false);
  const [searchNameModalOpen, setSearchNameModalOpen] = useState(false);
  const [searchNameInput, setSearchNameInput] = useState("");
  const [pendingCompanyNames, setPendingCompanyNames] = useState([]);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
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
  const taskListRef = useRef(null);

  useEffect(() => {
    tasksRef.current = tasks;
    localStorage.setItem("company_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const getCompanyNames = () =>
    companyRows.map((row) => cleanCompanyName(row.name)).filter(Boolean);

  const scrollTaskListIntoView = useCallback(() => {
    taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const formatTaskTime = (value) => {
    if (!value) return "";
    const numericValue = Number(value);
    const date = Number.isFinite(numericValue)
      ? new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

  const getTaskNames = (task) => {
    const inputData = parseJsonValue(task.input_data) || {};
    const names =
      task.names ||
      task.company_name_list ||
      task.companyNameList ||
      inputData.company_name_list ||
      inputData.names;

    return Array.isArray(names) ? names.map(cleanCompanyName).filter(Boolean) : [];
  };

  const getTaskSearchName = (task) => {
    const inputData = parseJsonValue(task.input_data) || {};
    return cleanSearchName(
      task.searchName ||
      task.search_name ||
      task.searcher_name ||
      inputData.search_name ||
      inputData.searcher_name
    );
  };

  const normalizeTask = (task) => {
    const status = normalizeTaskStatus(task.status);
    const taskId = task.taskId || task.task_id || task.id;
    const createdAt =
      task.createdAt ||
      formatTaskTime(task.created_at || task.create_time || task.updated_at || task.updatedAt);

    return {
      taskId,
      names: getTaskNames(task),
      searchName: getTaskSearchName(task),
      status,
      rawStatus: task.status,
      summary: task.summary,
      message: task.message || task.error || task.error_message,
      downloadable: status === "done",
      createdAt,
    };
  };

  const updateCompanyRow = (key, name) => {
    setCompanyRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, name } : row))
    );
  };

  const addCompanyRows = (count = 1) => {
    setCompanyRows((rows) => [...rows, ...createCompanyRows(count)]);
  };

  const removeCompanyRow = (key) => {
    setCompanyRows((rows) => {
      const nextRows = rows.filter((row) => row.key !== key);
      return nextRows.length > 0 ? nextRows : createCompanyRows(1);
    });
  };

  const clearCompanyRows = () => {
    setCompanyRows(createCompanyRows(DEFAULT_INPUT_ROW_COUNT));
  };

  const fillCompanyRowsFromPaste = (startKey, names) => {
    setCompanyRows((rows) => {
      const startIndex = Math.max(
        rows.findIndex((row) => row.key === startKey),
        0
      );
      const nextRows = [...rows];

      while (nextRows.length < startIndex + names.length) {
        nextRows.push(createCompanyRow());
      }

      names.forEach((name, offset) => {
        const rowIndex = startIndex + offset;
        nextRows[rowIndex] = { ...nextRows[rowIndex], name };
      });

      return nextRows;
    });
  };

  const handleCompanyPaste = (event, key) => {
    const pastedText = event.clipboardData?.getData("text") || "";
    const pastedNames = parseCompanyPaste(pastedText);

    if (!pastedNames.length || !/[\r\n\t]/.test(pastedText)) {
      return;
    }

    event.preventDefault();
    fillCompanyRowsFromPaste(key, pastedNames);
    message.success(`已粘贴 ${pastedNames.length} 家公司`);
  };

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

  const pollPendingTasks = useCallback(async () => {
    const pending = tasksRef.current.filter((t) => t.status === "pending");
    if (pending.length === 0) return;

    await Promise.all(
      pending.map(async (task) => {
        try {
          const res = await checkCompanyResult(task.taskId);

          if (!res.success) {
            throw new Error(res.error || res.message);
          }

          const nextTask = normalizeTask({ ...task, ...(res.task || {}) });

          setTasks((cur) =>
            cur.map((t) =>
              t.taskId === task.taskId
                ? {
                    ...t,
                    ...nextTask,
                    taskId: t.taskId,
                    names: nextTask.names.length ? nextTask.names : t.names,
                    searchName: nextTask.searchName || t.searchName,
                  }
                : t
            )
          );
        } catch {}
      })
    );
  }, []);

  const handleFetchAllTasks = useCallback(async ({ revealList = false } = {}) => {
    setLoadingAllTasks(true);

    try {
      const res = await fetchCompanyTasks();

      if (!res.success) {
        throw new Error(res.error || res.message);
      }

      const nextTasks = extractTaskList(res)
        .map(normalizeTask)
        .filter((task) => task.taskId);

      setTasks(nextTasks);
      setTaskPage(1);

      if (revealList) {
        window.requestAnimationFrame(scrollTaskListIntoView);
      }

      message.success(`已同步 ${nextTasks.length} 个任务`);
    } catch (e) {
      message.error(e.message || "查询任务失败");
    } finally {
      setLoadingAllTasks(false);
    }
  }, [scrollTaskListIntoView]);

  useEffect(() => {
    const hasPending = tasks.some((t) => t.status === "pending");

    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(pollPendingTasks, 30000);
    }

    if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [tasks, pollPendingTasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      setTaskPage(1);
      return;
    }

    const maxPage = Math.max(1, Math.ceil(tasks.length / taskPageSize));

    if (taskPage > maxPage) {
      setTaskPage(maxPage);
    }
  }, [tasks.length, taskPageSize, taskPage]);

  const handleSearch = async () => {
    const companyNames = getCompanyNames();

    if (companyNames.length === 0) {
      message.warning("请至少输入一个公司名称");
      return;
    }

    setPendingCompanyNames(companyNames);
    setSearchNameInput("");
    setSearchNameModalOpen(true);
  };

  const handleConfirmSearchName = async () => {
    const searchName = cleanSearchName(searchNameInput);

    if (!searchName) {
      message.warning("请选择或输入检索人名称");
      return;
    }

    if (pendingCompanyNames.length === 0) {
      message.warning("请至少输入一个公司名称");
      setSearchNameModalOpen(false);
      return;
    }

    setSubmitting(true);

    try {
      const res = await searchCompany(pendingCompanyNames, searchName);

      if (!res.success) {
        throw new Error(res.error || res.message);
      }

      setTasks((prev) => [
        {
          taskId: res.task_id,
          names: res.company_name_list || pendingCompanyNames,
          searchName: res.search_name || searchName,
          status: "pending",
          createdAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);

      setTaskPage(1);
      setSearchNameModalOpen(false);
      setPendingCompanyNames([]);
      clearCompanyRows();
      message.success("任务已提交，可在任务列表中查看进度");
    } catch (e) {
      message.error(e.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (taskId) => {
    try {
      await downloadCompanyXlsx(taskId);
      message.success("下载成功");
    } catch (e) {
      message.error(e.message || "下载失败");
    }
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const searchCount = getCompanyNames().length;

  const searcherAutoCompleteOptions = SEARCHER_OPTIONS.map((name) => ({
    value: name,
    label: name,
  }));

  const taskPagination = useMemo(
    () => ({
      current: taskPage,
      pageSize: taskPageSize,
      total: tasks.length,
      showSizeChanger: true,
      pageSizeOptions: [5, 10, 20, 50],
      showTotal: (total) => `共 ${total} 个任务`,
      hideOnSinglePage: false,
      selectProps: {
        showSearch: false,
        virtual: false,
      },
      onChange: (page, pageSize) => {
        setTaskPage(page);
        setTaskPageSize(pageSize);
        window.requestAnimationFrame(scrollTaskListIntoView);
      },
    }),
    [scrollTaskListIntoView, taskPage, taskPageSize, tasks.length]
  );

  const companyColumns = [
    {
      title: "#",
      key: "index",
      width: 64,
      align: "center",
      render: (_, __, index) => index + 1,
    },
    {
      title: "公司名称",
      dataIndex: "name",
      render: (_, record) => (
        <Input
          value={record.name}
          placeholder="粘贴或输入公司名称"
          onChange={(event) => updateCompanyRow(record.key, event.target.value)}
          onPaste={(event) => handleCompanyPaste(event, record.key)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 72,
      align: "center",
      render: (_, record) => (
        <Tooltip title="删除行">
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={() => removeCompanyRow(record.key)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: "#f0f2f5", minHeight: "100vh" }}>
      <Card
        title="公司信息批量检索"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => handleFetchAllTasks({ revealList: true })}
              loading={loadingAllTasks}
            >
              查询全部任务
            </Button>

            <Badge count={pendingCount} offset={[-4, 4]}>
              <Button
                icon={<UnorderedListOutlined />}
                onClick={scrollTaskListIntoView}
              >
                任务列表 ({tasks.length})
              </Button>
            </Badge>
          </Space>
        }
      >
        <div
          style={{
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Space>
            <span style={{ color: "#666" }}>公司名称表格</span>

            <Button icon={<PlusOutlined />} onClick={() => addCompanyRows(5)}>
              新增行
            </Button>

            <Button icon={<ClearOutlined />} onClick={clearCompanyRows}>
              清空
            </Button>
          </Space>

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

        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={companyColumns}
          dataSource={companyRows}
          scroll={{ y: 250 }}
          style={{ marginBottom: 8 }}
        />

        <div style={{ color: "#999", fontSize: 12 }}>
          提交后任务在后台运行，可继续提交新任务
        </div>
      </Card>

      <div ref={taskListRef} style={{ marginTop: 16 }}>
        <Card
          title="任务列表"
          extra={
            <Tooltip title="查询全部任务">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => handleFetchAllTasks({ revealList: true })}
                loading={loadingAllTasks}
              >
                刷新
              </Button>
            </Tooltip>
          }
        >
          <List
            dataSource={tasks}
            pagination={tasks.length > 0 ? taskPagination : false}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无任务，请先提交检索"
                />
              ),
            }}
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
                    <Space wrap>
                      {task.status === "pending" && (
                        <Badge status="processing" text="检索中" />
                      )}

                      {task.status === "done" && renderTaskStatus(task)}

                      {task.status === "error" && (
                        <Badge status="error" text="失败" />
                      )}

                      <span style={{ color: "#999", fontSize: 12 }}>
                        {task.createdAt}
                      </span>
                    </Space>
                  }
                  description={
                    <div>
                      {task.searchName && (
                        <div style={{ marginBottom: 8 }}>
                          <Tag color="blue">检索人：{task.searchName}</Tag>
                        </div>
                      )}

                      {task.names.slice(0, 3).map((n) => (
                        <Tag key={n} style={{ marginBottom: 4 }}>
                          {n}
                        </Tag>
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
        </Card>
      </div>

      <Modal
        title="请选择或输入检索人名称"
        open={searchNameModalOpen}
        okText="提交检索"
        cancelText="取消"
        confirmLoading={submitting}
        okButtonProps={{ disabled: !cleanSearchName(searchNameInput) }}
        onOk={handleConfirmSearchName}
        onCancel={() => {
          if (submitting) return;
          setSearchNameModalOpen(false);
          setPendingCompanyNames([]);
        }}
      >
        <AutoComplete
          value={searchNameInput}
          options={searcherAutoCompleteOptions}
          placeholder="请选择或输入检索人，例如：Qiang"
          style={{ width: "100%" }}
          autoFocus
          allowClear
          onChange={setSearchNameInput}
          onSelect={setSearchNameInput}
          filterOption={(inputValue, option) =>
            String(option?.value || "")
              .toLowerCase()
              .includes(String(inputValue || "").toLowerCase())
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleConfirmSearchName();
            }
          }}
        />

        <div style={{ color: "#999", fontSize: 12, marginTop: 8 }}>
          本次将提交 {pendingCompanyNames.length} 家公司
        </div>
      </Modal>
    </div>
  );
}