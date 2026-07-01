import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Button, Card, DatePicker, Dropdown, Input, Modal, Popover, Select, Space,
  Table, Tag, Typography, message,
} from 'antd';
import { EyeOutlined, LinkOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmailList, updateEmailCheck } from '../api';

const { Text } = Typography;

const INTENT_COLOR = {
  CANCEL_IT: 'red',
  REEXPORT_RETURN: 'volcano',
  RELEASE: 'green',
  ARRIVAL_PICKUP_LFD: 'orange',
  CUSTOMS_EXAM_CLEARANCE: 'purple',
  TRANSPORT_STATUS: 'blue',
  EMPTY_RETURN_EQUIPMENT: 'cyan',
  PAYMENT_FINANCE: 'gold',
  DOCUMENT_BL: 'geekblue',
  SHIPPING_COMPANY_REPLY: 'lime',
  EXCHANGE_OF_PORT: 'magenta',
  OTHER: 'default',
};

const INTENT_LABEL = {
  CANCEL_IT: 'CANCEL_IT',
  REEXPORT_RETURN: '退运',
  RELEASE: '放行',
  ARRIVAL_PICKUP_LFD: '到港/提货/LFD',
  CUSTOMS_EXAM_CLEARANCE: '海关查验/清关',
  TRANSPORT_STATUS: '铁路运输',
  EMPTY_RETURN_EQUIPMENT: '空箱归还',
  PAYMENT_FINANCE: '费用相关',
  DOCUMENT_BL: '提单业务',
  SHIPPING_COMPANY_REPLY: '船公司回复',
  EXCHANGE_OF_PORT: '预报/换单',
  OTHER: '其他',
};

const EXCHANGE_OF_PORT = 'EXCHANGE_OF_PORT';

const INTENT_OPTIONS = Object.keys(INTENT_COLOR).map((value) => ({
  label: INTENT_LABEL[value] ?? value,
  value,
}));

const splitValues = (v) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const copyText = (text) => {
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    message.success('已复制');
  }
};

const MultiMbl = ({ value }) => {
  const [open, setOpen] = useState(false);
  const items = splitValues(value);
  if (!items.length) return '-';
  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Button
          size="small"
          style={{ fontSize: 12, padding: '0 6px' }}
          onClick={() => copyText(items.join('\n'))}
        >
          {items[0]}
        </Button>
        {items.length > 1 && (
          <Tag style={{ margin: 0, cursor: 'pointer' }} onClick={() => setOpen(true)}>
            +{items.length - 1}
          </Tag>
        )}
      </span>
      {items.length > 1 && (
        <Modal
          title={`全部 MBL（${items.length}）`}
          open={open}
          onCancel={() => setOpen(false)}
          footer={null}
          width={400}
        >
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {items.map((m) => <Text key={m} copyable>{m}</Text>)}
            </Space>
          </div>
        </Modal>
      )}
    </>
  );
};

const MultiIntent = ({ value }) => {
  const [open, setOpen] = useState(false);
  const items = splitValues(value);
  if (!items.length) return '-';
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{INTENT_LABEL[items[0]] ?? items[0]}</Tag>
        {items.length > 1 && <Tag>+{items.length - 1}</Tag>}
      </span>
      <Modal
        title="一级意图"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={400}
        centered
      >
        <Space wrap size={8}>
          {items.map((v) => (
            <Tag key={v} color={INTENT_COLOR[v] ?? 'blue'} style={{ fontSize: 14, padding: '4px 10px' }}>
              {INTENT_LABEL[v] ?? v}
            </Tag>
          ))}
        </Space>
      </Modal>
    </>
  );
};

const CHECK_OPTIONS = [
  { value: 0, label: 'Todo', color: 'default' },
  { value: 1, label: '已处理', color: 'success' },
  { value: 2, label: '待定',   color: 'warning' },
];

const CheckButton = ({ id, value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const done = value === 1;

  const handleClick = async () => {
    const next = done ? 0 : 1;
    setLoading(true);
    try {
      const res = await updateEmailCheck(id, next);
      if (res?.code === 200) onChange(next);
      else message.error(res?.message || '更新失败');
    } catch {
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={loading ? undefined : handleClick}
      title={done ? '已处理，点击撤销' : '点击标记完成'}
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: `2px solid ${done ? '#52c41a' : '#d9d9d9'}`,
        background: done ? '#52c41a' : 'transparent',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {done && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
    </div>
  );
};

const PreviewButton = ({ row }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const handleClick = () => {
    const qs = row.ordering_id ? `?ordering_id=${encodeURIComponent(row.ordering_id)}` : '';
    navigate(`/email/${row.id}${qs}`, { state: { from: location.pathname + location.search, subject: row.subject } });
  };
  return (
    <Button size="small" icon={<EyeOutlined />} onClick={handleClick}>
      预览
    </Button>
  );
};

const buildTableColumns = (onCheckChange) => [
  {
    title: '日期',
    dataIndex: 'date',
    key: 'date',
    width: 120,
    fixed: 'left',
    ellipsis: true,
    render: (v) => {
      if (!v) return '-';
      return v.length > 16 ? v.slice(0, 16) : v;
    },
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 100,
    ellipsis: true,
    render: (v) => {
      if (!v) return '-';
      const m = v.match(/<([^>]+)>/);
      const text = m ? m[1] : v.trim();
      return (
        <span style={{ cursor: 'pointer' }} title={text} onClick={() => copyText(text)}>
          {text}
        </span>
      );
    },
  },
  {
    title: '邮件主题',
    dataIndex: 'subject',
    key: 'subject',
    width: 150,
    render: (v) => (
      <div
        style={{
          maxHeight: 22,
          overflow: 'hidden',
          fontSize: 13,
          lineHeight: '22px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          cursor: v ? 'pointer' : 'default',
        }}
        title={v || '-'}
        onClick={() => copyText(v)}
      >
        {v || '-'}
      </div>
    ),
  },
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 150,
    render: (v) => {
      const preview = v ? splitValues(v).join('\n') : '';
      return (
        <div style={{ overflow: 'hidden', maxHeight: 28 }} title={preview || '-'}>
          <MultiMbl value={v} />
        </div>
      );
    },
  },
  {
    title: 'Check',
    dataIndex: 'is_check',
    key: 'is_check',
    width: 70,
    render: (v, record) => (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CheckButton id={record.id} value={v ?? 0} onChange={(next) => onCheckChange(record.id, next)} />
      </div>
    ),
  },
  {
    title: '邮件摘要',
    dataIndex: 'email_summary',
    key: 'email_summary',
    width: 180,
    render: (v) => (
      <div
        style={{
          maxHeight: 22,
          overflow: 'hidden',
          fontSize: 13,
          lineHeight: '22px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
        title={v || '-'}
      >
        {v || '-'}
      </div>
    ),
  },
  {
    title: '一级意图',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 130,
    render: (v) => (
      <div style={{ overflow: 'hidden', maxHeight: 28 }}>
        <MultiIntent value={v} />
      </div>
    ),
  },
  {
    title: '二级意图',
    dataIndex: 'intent_type2',
    key: 'intent_type2',
    width: 140,
    render: (v) => {
      if (!v) return '-';
      const trimmed = v.trim();
      let items = [];
      if (trimmed.startsWith('[')) {
        try {
          items = JSON.parse(trimmed.replace(/'/g, '"'));
        } catch {
          items = trimmed.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        }
      } else {
        items = splitValues(trimmed);
      }
      items = items.filter((s) => s && s.trim());
      if (!items.length) return '-';
      if (items.length === 1) return <div style={{ overflow: 'hidden', maxHeight: 28 }}><Tag>{items[0]}</Tag></div>;
      return (
        <div style={{ overflow: 'hidden', maxHeight: 28 }}>
          <Popover
            trigger="click"
            content={<Space wrap size={4}>{items.map((s) => <Tag key={s}>{s}</Tag>)}</Space>}
          >
            <span style={{ cursor: 'pointer' }}>
              <Tag>{items[0]}</Tag>
              <Tag>+{items.length - 1}</Tag>
            </span>
          </Popover>
        </div>
      );
    },
  },
  {
    title: '是否下单',
    dataIndex: 'is_done',
    key: 'is_done',
    width: 80,
    ellipsis: true,
    render: (v, record) => {
      if (record.intent_type1 !== EXCHANGE_OF_PORT) return '-';
      if (v === null || v === undefined || v === '') return '-';
      return v ? <Tag color="green">已下单</Tag> : <Tag color="red">取消</Tag>;
    },
  },
  {
    title: '解析状态',
    dataIndex: 'status',
    key: 'status',
    width: 80,
    render: (v) => { v === null || v === undefined || v === '' ? '-' : v; },   
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    render: (_, row) => (
      <Space size={4}>
        <PreviewButton row={row} />
        {row.email_url && (
          <a href={row.email_url} target="_blank" rel="noreferrer" title="原始邮件链接">
            <LinkOutlined style={{ fontSize: 16, color: '#1677ff' }} />
          </a>
        )}
      </Space>
    ),
  },
];

export default function Email() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initPage = parseInt(searchParams.get('page') || '1', 10);
  const initPageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const initCategory = searchParams.get('category') || '';
  const initDateFrom = searchParams.get('date_from') || '';
  const initDateTo = searchParams.get('date_to') || '';
  const initIsCheck = searchParams.get('is_check') !== null && searchParams.get('is_check') !== ''
    ? parseInt(searchParams.get('is_check'), 10)
    : null;
  const initMblNumber = searchParams.get('mbl_number') || '';

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [total, setTotal] = useState(0);
  const [fadingIds, setFadingIds] = useState(new Set());

  const category = initCategory;
  const dateRange = [
    initDateFrom ? dayjs(initDateFrom) : null,
    initDateTo ? dayjs(initDateTo) : null,
  ];

  const handleCheckChange = (id, next) => {
    setTableData((prev) => prev.map((row) => row.id === id ? { ...row, is_check: next } : row));
    if (initIsCheck !== null && initIsCheck !== undefined && next !== initIsCheck) {
      setFadingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setTableData((prev) => prev.filter((row) => row.id !== id));
        setFadingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      }, 600);
    }
  };

  const [batchLoading, setBatchLoading] = useState(false);

  const handleBatchCheck = async (next) => {
    if (!selectedRowKeys.length) return;
    setBatchLoading(true);
    try {
      await Promise.all(selectedRowKeys.map((id) => updateEmailCheck(id, next)));
      setTableData((prev) => prev.map((row) =>
        selectedRowKeys.includes(row.id) ? { ...row, is_check: next } : row
      ));
      message.success(`已将 ${selectedRowKeys.length} 条更新为「${CHECK_OPTIONS.find(o => o.value === next)?.label}」`);
      setSelectedRowKeys([]);
    } catch {
      message.error('批量更新失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const tableColumns = buildTableColumns(handleCheckChange);

  const pushParams = (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber) => {
    const p = {};
    if (page !== 1) p.page = page;
    if (pageSize !== 50) p.pageSize = pageSize;
    if (cat) p.category = cat;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (isCheck !== null && isCheck !== undefined) p.is_check = isCheck;
    if (mblNumber) p.mbl_number = mblNumber;
    setSearchParams(p, { replace: false });
  };

  const loadTable = async (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber) => {
    setTableLoading(true);
    try {
      const res = await fetchEmailList({
        page,
        page_size: pageSize,
        intent_type1: cat,
        date_from: dateFrom,
        date_to: dateTo,
        is_check: isCheck,
        mbl_number: mblNumber,
      });
      if (res?.code === 200) {
        setTableData(res.data.items);
        setTotal(res.data.total);
      } else {
        message.error(res?.message || '加载失败');
      }
    } catch (e) {
      message.error(e.message || '加载失败');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber);
  }, [searchParams.toString()]);

  const handleCategoryChange = (value) => {
    pushParams(1, initPageSize, value || '', initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  const handleIsCheckChange = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, value ?? null, initMblNumber);
  };

  const handleMblSearch = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, value.trim());
  };

  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const handleTodayOrder = () => {
    const today = dayjs().format('YYYY-MM-DD');
    pushParams(1, initPageSize, EXCHANGE_OF_PORT, today, today, initIsCheck, initMblNumber);
  };

  const isTodayOrderActive =
    initCategory === EXCHANGE_OF_PORT &&
    initDateFrom === dayjs().format('YYYY-MM-DD') &&
    initDateTo === dayjs().format('YYYY-MM-DD');

  const handleCustomDateChange = (dates) => {
    if (!dates) {
      pushParams(1, initPageSize, initCategory, '', '', initIsCheck, initMblNumber);
    } else {
      pushParams(1, initPageSize, initCategory,
        dates[0] ? dates[0].format('YYYY-MM-DD') : '',
        dates[1] ? dates[1].format('YYYY-MM-DD') : '',
        initIsCheck, initMblNumber,
      );
    }
    setCustomPickerOpen(false);
  };

  const hasDateFilter = !!(initDateFrom || initDateTo);

  const handlePageChange = (page, pageSize) => {
    pushParams(page, pageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  return (
    <div>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search
            size="large"
            placeholder="搜索 MBL 号"
            defaultValue={initMblNumber}
            allowClear
            style={{ width: 200 }}
            onSearch={handleMblSearch}
          />
          <Select
            allowClear
            size="large"
            value={initCategory || undefined}
            placeholder="全部类别"
            options={INTENT_OPTIONS}
            style={{ width: 200 }}
            onChange={(value) => handleCategoryChange(value || '')}
          />
          {[
            { label: '全部', value: null },
            { label: 'Todo', value: 0 },
            { label: '已处理', value: 1 },
          ].map(({ label, value }) => (
            <Button
              key={String(value)}
              size="large"
              type={initIsCheck === value ? 'primary' : 'default'}
              onClick={() => handleIsCheckChange(value)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="large"
            onClick={handleTodayOrder}
            style={isTodayOrderActive ? { background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' } : {}}
          >今日预报/换单</Button>
          <DatePicker.RangePicker
            open={customPickerOpen}
            onOpenChange={setCustomPickerOpen}
            value={hasDateFilter ? [dayjs(initDateFrom), dayjs(initDateTo)] : null}
            onChange={handleCustomDateChange}
            allowClear
            disabledDate={(d) => d && d > dayjs().endOf('day')}
            style={{ width: 0, padding: 0, border: 'none', overflow: 'hidden', position: 'absolute' }}
          />
          <Button size="large" type={hasDateFilter ? 'primary' : 'default'} onClick={() => setCustomPickerOpen(true)}>
            {hasDateFilter ? `${initDateFrom} ~ ${initDateTo}` : '自定义日期'}
          </Button>
          {hasDateFilter && (
            <Button size="large" onClick={() => pushParams(1, initPageSize, initCategory, '', '')}>清除</Button>
          )}
        </Space>
        {selectedRowKeys.length > 0 && (
          <Space style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 15, color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}>
              已选 {selectedRowKeys.length} 条，批量标记为：
            </span>
            {CHECK_OPTIONS.map((o) => (
              <Button
                key={o.value}
                size="small"
                loading={batchLoading}
                onClick={() => handleBatchCheck(o.value)}
              >
                <Tag color={o.color} style={{ margin: 0 }}>{o.label}</Tag>
              </Button>
            ))}
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        )}
        <Table
          rowKey="id"
          columns={tableColumns}
          dataSource={tableData}
          loading={tableLoading}
          size="small"
          bordered
          className="email-table"
          rowClassName={(row) => fadingIds.has(row.id) ? 'row-fading' : ''}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{
            current: initPage,
            pageSize: initPageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '50', '100'],
            showTotal: (t) => `共 ${t} 条`,
            onChange: handlePageChange,
          }}
          tableLayout="fixed"
          scroll={{ x: 1130, y: 'calc(100vh - 160px)' }}
        />
    </div>
  );
}
