import { useState, useEffect } from 'react';
import {
  Button, Card, Descriptions, Empty, Input, Space,
  Spin, Tag, Typography, message, Modal, Table,
} from 'antd';
import { SearchOutlined, LinkOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { checkEmailParserResult, fetchEmailList } from '../api';

const { Text, Paragraph } = Typography;

const parseEmail = (raw) => {
  if (!raw) return '-';
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw.trim();
};

const INTENT_COLOR = {
  ARRIVAL_PICKUP_LFD: 'orange',
  IMPORT: 'blue',
  EXPORT: 'green',
  OTHER: 'default',
};

const buildTableColumns = (onPreview) => [
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 180,
    render: (v) => v ? <Text copyable>{v}</Text> : '-',
  },
  {
    title: '主题',
    dataIndex: 'subject',
    key: 'subject',
    ellipsis: true,
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 220,
    ellipsis: true,
    render: (v) => v ? parseEmail(v) : '-',
  },
  {
    title: '意图类型1',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 180,
    render: (v) => v ? <Tag color={INTENT_COLOR[v] ?? 'blue'}>{v}</Tag> : '-',
  },
  {
    title: '意图类型2',
    dataIndex: 'intent_type2',
    key: 'intent_type2',
    width: 140,
    render: (v) => (v && v !== '{}') ? <Tag color="purple">{v}</Tag> : '-',
  },
  {
    title: '摘要',
    dataIndex: 'email_summary',
    key: 'email_summary',
    ellipsis: true,
    render: (v) => v || '-',
  },
  {
    title: '日期',
    dataIndex: 'date',
    key: 'date',
    width: 200,
    render: (v) => v || '-',
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    render: (_, row) => (
      <Space>
        {row.html_content && (
          <Button size="small" icon={<EyeOutlined />} onClick={() => onPreview(row.html_content)}>
            预览
          </Button>
        )}
        {row.email_url && (
          <a href={row.email_url} target="_blank" rel="noreferrer">
            <LinkOutlined />
          </a>
        )}
      </Space>
    ),
  },
];

export default function Email() {
  const [taskId, setTaskId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [htmlVisible, setHtmlVisible] = useState(false);
  const [tableHtmlContent, setTableHtmlContent] = useState('');
  const [tableHtmlVisible, setTableHtmlVisible] = useState(false);

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });

  const handleTablePreview = (html) => { setTableHtmlContent(html); setTableHtmlVisible(true); };
  const tableColumns = buildTableColumns(handleTablePreview);

  const loadTable = async (page = 1, pageSize = 50) => {
    setTableLoading(true);
    try {
      const res = await fetchEmailList(page, pageSize);
      if (res?.code === 200) {
        setTableData(res.data.items);
        setPagination((p) => ({ ...p, current: page, pageSize, total: res.data.total }));
      } else {
        message.error(res?.message || '加载失败');
      }
    } catch (e) {
      message.error(e.message || '加载失败');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => { loadTable(); }, []);

  const handleSearch = async () => {
    const trimmed = taskId.trim();
    if (!trimmed) { message.warning('请输入 email_task_id'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await checkEmailParserResult(trimmed);
      if (res?.code === 200) {
        setResult(res.data);
        message.success(res.message || '查询成功');
      } else {
        message.error(res?.message || '查询失败');
      }
    } catch (e) {
      message.error(e?.response?.data?.message || e.message || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  const r = result?.result ?? {};

  return (
    <div style={{ padding: '0 4px' }}>
      <h2 style={{ marginBottom: 16 }}>Email 解析结果</h2>

      {/* 邮件列表表格 */}
      <Card
        size="small"
        title={`邮件列表（共 ${pagination.total} 条）`}
        style={{ marginBottom: 24 }}
        extra={
          <Button icon={<SyncOutlined />} size="small" onClick={() => loadTable(1, pagination.pageSize)}>
            刷新
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={tableColumns}
          dataSource={tableData}
          loading={tableLoading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => loadTable(page, pageSize),
          }}
          scroll={{ x: 1000 }}
        />
      </Card>
      <Modal
        title="HTML 邮件预览"
        open={htmlVisible}
        onCancel={() => setHtmlVisible(false)}
        footer={null}
        width="80%"
        destroyOnClose
      >
        <iframe
          title="html-content-preview"
          srcDoc={r.html_content || ''}
          style={{ width: '100%', height: '70vh', border: '1px solid #eee', borderRadius: 4 }}
          sandbox=""
        />
      </Modal>

      <Modal
        title="HTML 邮件预览"
        open={tableHtmlVisible}
        onCancel={() => setTableHtmlVisible(false)}
        footer={null}
        width="80%"
        destroyOnClose
      >
        <iframe
          title="table-html-content-preview"
          srcDoc={tableHtmlContent}
          style={{ width: '100%', height: '70vh', border: '1px solid #eee', borderRadius: 4 }}
          sandbox=""
        />
      </Modal>
    </div>
  );
}
