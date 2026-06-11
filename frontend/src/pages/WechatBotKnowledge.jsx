import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { fetchKnowledgeCategories, fetchWechatBotKnowledge } from "../api";

const { Paragraph, Text, Title } = Typography;

// ─── 工具函数 ────────────────────────────────────────────────
function formatDateTime(value) {
  if (!value) return "-";
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD HH:mm:ss") : "-";
}

// ─── 子组件：文本预览（支持折叠展开）────────────────────────
function TextPreview({ value, empty }) {
  if (!value) {
    return <Text type="secondary">{empty}</Text>;
  }
  return (
    <Paragraph
      ellipsis={{ rows: 3, expandable: true, symbol: "展开" }}
      style={{ marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {value}
    </Paragraph>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export default function WechatBotKnowledge() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");


  const [categoryOptions, setCategoryOptions] = useState([
    { label: "全部分类", value: "" },
  ]);

  useEffect(() => {
    fetchKnowledgeCategories().then((res) => {
      if (res?.code === 200) {
        setCategoryOptions([
          { label: "全部分类", value: "" },
          ...res.data.map((c) => ({ label: c, value: c })),
        ]);
      }
    });
  }, []);

  // ─── 数据加载 ─────────────────────────────────────────────
  const loadItems = useCallback(
    async (nextPage = 1, nextPageSize = pageSize, nextCategory = category) => {
      setLoading(true);
      try {
        const res = await fetchWechatBotKnowledge({
          page: nextPage,
          page_size: nextPageSize,
          ...(nextCategory ? { category: nextCategory } : {}),
        });

        if (res?.code !== 200) {
          throw new Error(res?.message || "加载知识库失败");
        }

        const payload = res.data || {};
        const pagination = payload.pagination || {};

        setItems(payload.list || []);
        setTotal(Number(pagination.total) || 0);
        setPage(Number(pagination.page) || nextPage);
        setPageSize(Number(pagination.page_size) || nextPageSize);
      } catch (error) {
        message.error(
          error?.response?.data?.message || error.message || "加载知识库失败"
        );
      } finally {
        setLoading(false);
      }
    },
    [pageSize, category]
  );

  useEffect(() => {
    loadItems(1, pageSize, category);
  }, [loadItems, pageSize, category]);

  // ─── 事件处理 ─────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    setCategory(categoryInput.trim());
  }, [categoryInput]);

  const handleReset = useCallback(() => {
    setCategory("");
    setCategoryInput("");
  }, []);

  // ─── 表格列定义 ───────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        title: "ID",
        dataIndex: "id",
        key: "id",
        width: 76,
        align: "center",
      },
      {
        title: "问题",
        dataIndex: "question",
        key: "question",
        width: 280,
        render: (value) => <TextPreview value={value} empty="暂无问题" />,
      },
      {
        title: "答案",
        dataIndex: "answer",
        key: "answer",
        width: 320,
        render: (value) => <TextPreview value={value} empty="暂无答案" />,
      },
      {
        title: "最终答案",
        dataIndex: "final_answer",
        key: "final_answer",
        width: 320,
        render: (value) => <TextPreview value={value} empty="暂无最终答案" />,
      },
      {
        title: "分类",
        dataIndex: "category",
        key: "category",
        width: 180,
        render: (value) =>
          value ? (
            <Tag color="blue">{value}</Tag>
          ) : (
            <Text type="secondary">未分类</Text>
          ),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 100,
        align: "center",
        render: (value) =>
          value !== null && value !== undefined ? (
            <Tag color="gold">{String(value)}</Tag>
          ) : (
            <Text type="secondary">-</Text>
          ),
      },
      {
        title: "创建时间",
        dataIndex: "created_at",
        key: "created_at",
        width: 180,
        render: formatDateTime,
      },
      {
        title: "更新时间",
        dataIndex: "updated_at",
        key: "updated_at",
        width: 180,
        render: formatDateTime,
      },
    ],
    []
  );

  // ─── 渲染 ─────────────────────────────────────────────────
  return (
    <div className="page-shell wechat-bot-page">
      <div className="page-header-block">
        <div>
          <Title level={3} className="page-title" style={{ marginBottom: 8 }}>
            <BookOutlined style={{ marginRight: 10 }} />
            Wechat Bot 知识库
          </Title>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => loadItems(page, pageSize, category)}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      <Card className="page-card wechat-bot-card" variant="borderless">
        <div className="wechat-bot-toolbar">
          <Space wrap>
       
            <Select
              value={categoryInput}
              onChange={(val) => {
                const nextCategory = val ?? "";
                setCategoryInput(nextCategory);
                setCategory(nextCategory);
              }}
              options={categoryOptions}
              style={{ width: 240 }}
              placeholder="选择分类"
              showSearch
              allowClear
              optionFilterProp="label"
            />
            
          </Space>
        </div>

        <Table
          rowKey="id"
          className="report-list-table"
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: 1700 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (value) => `共 ${value} 条`,
            onChange: (nextPage, nextPageSize) => {
              loadItems(nextPage, nextPageSize, category);
            },
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无知识库数据"
              />
            ),
          }}
        />
      </Card>
    </div>
  );
}
