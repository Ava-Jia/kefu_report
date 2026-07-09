import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Button, Card, DatePicker, Divider, Dropdown, Flex, Input, Modal, Radio, Select, Space, Spin,
  Table, Tag, Tooltip, Typography, Upload, message,
} from 'antd';

// 悬浮提示统一延迟：比 antd 默认 0.1s 的呈现更跟手，浏览器原生 title 无法调速
const TIP_DELAY = 0.1;

// 空值统一占位：与 MBL 号一致的灰色短横
const EmptyDash = () => <span style={{ color: '#ccc' }}>-</span>;

import { CaretDownOutlined, CaretUpOutlined, DownloadOutlined, FileSearchOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchEmailList, updateEmailCheck, updateEmail, uploadEmailEml, fetchEmailParseStatus } from '../api';

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
  AGENT_REPLY: 'default',
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
  AGENT_REPLY: '代理回复',
  OTHER_AGENT_REQUEST: '代理回复'
};

const EXCHANGE_OF_PORT = 'EXCHANGE_OF_PORT';

const INTENT_OPTIONS = Object.keys(INTENT_COLOR).map((value) => ({
  label: INTENT_LABEL[value] ?? value,
  value,
}));

const splitValues = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
};

const parseIntentType2 = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  const trimmed = String(v).trim();
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
  return items.filter((s) => s && s.trim());
};

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


const IntentDetailModal = ({ open, onClose, items1, items2, emailId, onSaved }) => {
  const [draftItems1, setDraftItems1] = useState(items1);
  const [draftItems2, setDraftItems2] = useState(items2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftItems1(items1);
      setDraftItems2(items2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    const fields = {
      intent_type1: draftItems1.join(','),
      intent_type2: JSON.stringify(draftItems2),
    };
    setSaving(true);
    try {
      const res = await updateEmail(emailId, fields);
      if (res?.code === 200) {
        message.success('保存成功');
        onSaved?.(fields);
        onClose?.();
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="意图详情"
      open={open}
      onCancel={onClose}
      width={400}
      centered
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>取消</Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>保存</Button>,
      ]}
    >
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>一级意图</div>
      <Select
        mode="multiple"
        value={draftItems1}
        onChange={setDraftItems1}
        options={INTENT_OPTIONS}
        style={{ width: '100%', marginBottom: 12 }}
      />
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>二级意图（输入后回车添加）</div>
      <Select
        mode="tags"
        value={draftItems2}
        onChange={setDraftItems2}
        open={false}
        tokenSeparators={[]}
        style={{ width: '100%' }}
        placeholder="输入后按回车添加"
      />
    </Modal>
  );
};

const MultiIntent = ({ value, intentType2, emailId, onSaved }) => {
  const [open, setOpen] = useState(false);
  const items = splitValues(value);
  const items2 = parseIntentType2(intentType2);
  if (!items.length) return <EmptyDash />;
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Tag color={INTENT_COLOR[items[0]] ?? 'blue'}>{INTENT_LABEL[items[0]] ?? items[0]}</Tag>
        {items.length > 1 && <Tag>+{items.length - 1}</Tag>}
      </span>
      <IntentDetailModal
        open={open}
        onClose={() => setOpen(false)}
        items1={items}
        items2={items2}
        emailId={emailId}
        onSaved={onSaved}
      />
    </>
  );
};

const SecondaryIntent = ({ value, intentType1, emailId, onSaved }) => {
  const [open, setOpen] = useState(false);
  const items2 = parseIntentType2(value);
  const items1 = splitValues(intentType1);
  if (!items2.length) return <EmptyDash />;
  return (
    <>
      <span style={{ cursor: 'pointer' }} onClick={() => setOpen(true)}>
        <Tag>{items2[0]}</Tag>
        {items2.length > 1 && <Tag>+{items2.length - 1}</Tag>}
      </span>
      <IntentDetailModal
        open={open}
        onClose={() => setOpen(false)}
        items1={items1}
        items2={items2}
        emailId={emailId}
        onSaved={onSaved}
      />
    </>
  );
};

const PARSE_STATUS_MAP = {
  PENDING_TRACK: { label: '解析中', color: 'gold' },
  COMPLETED: { label: '完成', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
};

// 0=待处理（尚未解析完成，展示为 -） 1=新建下单 2=新建失败 3=修改订单 4=作废
const IS_DONE_MAP = {
  1: { label: '新建下单', color: 'green' },
  2: { label: '新建失败', color: 'red' },
  3: { label: '修改订单', color: 'blue' },
  4: { label: '作废', color: 'default' },
};

const CHECK_OPTIONS = [
  { value: 0, label: '待处理', color: 'gold' },
  { value: 1, label: '已处理', color: 'green' },
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
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {done && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
    </div>
  );
};

const PreviewButton = ({ row, listContext }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const handleClick = () => {
    navigate(`/email/${row.id}`, {
      state: {
        from: location.pathname + location.search,
        subject: row.subject,
        // 携带当前筛选后的列表，用于详情页在筛选结果内翻页（上一条/下一条）
        list: listContext,
      },
    });
  };
  return (
    <Button size="small" icon={<FileSearchOutlined />} onClick={handleClick}>
    </Button>
  );
};


const DateSortHeader = ({ order, onOrderChange }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    日期
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: '9px' }}>
      <Tooltip title="日期顺序（最早在前）" mouseEnterDelay={TIP_DELAY}>
        <CaretUpOutlined
          onClick={(e) => { e.stopPropagation(); onOrderChange('asc'); }}
          style={{ fontSize: 11, cursor: 'pointer', color: order === 'asc' ? '#1677ff' : '#bbb' }}
        />
      </Tooltip>
      <Tooltip title="日期倒序（最新在前）" mouseEnterDelay={TIP_DELAY}>
        <CaretDownOutlined
          onClick={(e) => { e.stopPropagation(); onOrderChange('desc'); }}
          style={{ fontSize: 11, cursor: 'pointer', color: order === 'desc' ? '#1677ff' : '#bbb' }}
        />
      </Tooltip>
    </span>
  </span>
);

const buildTableColumns = (onCheckChange, onIntentSaved, listContext, order, onOrderChange) => [
  {
    title: <DateSortHeader order={order} onOrderChange={onOrderChange} />,
    dataIndex: 'date',
    key: 'date',
    width: 150,
    fixed: 'left',
    ellipsis: true,
    render: (v) => {
      if (!v) return '-';
      return v.length > 16 ? v.slice(0, 16) : v;
    },
  },
  {
    title: '代理名称',
    dataIndex: 'broker_name',
    key: 'broker_name',
    width: 200,
    render: (v, record) => {
      const text = v || record['broker-name'];
      return text
        ? <Text style={{ maxWidth: '100%' }} ellipsis={{ tooltip: text }}>{text}</Text>
        : <EmptyDash />;
    },
  },
  {
    title: '发件人',
    dataIndex: 'from',
    key: 'from',
    width: 200,
    render: (v) => {
      if (!v) return <EmptyDash />;
      const m = v.match(/<([^>]+)>/);
      const text = m ? m[1] : v.trim();
      return <Text style={{ maxWidth: '100%' }} ellipsis={{ tooltip: text }}>{text}</Text>;
    },
  },
  {
    title: '角色',
    dataIndex: 'role',
    key: 'role',
    width: 100,
    render: (v) => (
      v ? <Text style={{ maxWidth: '100%' }} ellipsis={{ tooltip: v }}>{v}</Text> : <EmptyDash />
    ),
  },
  {
    title: '邮件主题',
    dataIndex: 'subject',
    key: 'subject',
    width: 150,
    render: (v) => (
      <Tooltip title={v || ''} mouseEnterDelay={TIP_DELAY}>
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
          onClick={() => copyText(v)}
        >
          {v || <EmptyDash />}
        </div>
      </Tooltip>
    ),
  },
  {
    title: 'MBL 号',
    dataIndex: 'mbl_number',
    key: 'mbl_number',
    width: 230,
    render: (v) => {
      const items = splitValues(v);
      return items.length
        ? <Text style={{ maxWidth: '100%' }} ellipsis={{ tooltip: items.join('\n') }}>{items.join(', ')}</Text>
        : <EmptyDash />;
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
      <Tooltip title={v || ''} mouseEnterDelay={TIP_DELAY}>
        <div
          style={{
            maxHeight: 22,
            overflow: 'hidden',
            fontSize: 13,
            lineHeight: '22px',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {v || <EmptyDash />}
        </div>
      </Tooltip>
    ),
  },
  {
    
    title: '一级意图',
    dataIndex: 'intent_type1',
    key: 'intent_type1',
    width: 150,
    render: (v, record) => {
      const labels = splitValues(v).map((code) => INTENT_LABEL[code] ?? code);
      return (
        <Tooltip title={labels.length ? labels.join('、') : ''} mouseEnterDelay={TIP_DELAY}>
          <div style={{ overflow: 'hidden', maxHeight: 28 }}>
            <MultiIntent value={v} intentType2={record.intent_type2} emailId={record.id} onSaved={(fields) => onIntentSaved(record.id, fields)} />
          </div>
        </Tooltip>
      );
    },
  },
  {
    title: '二级意图',
    dataIndex: 'intent_type2',
    key: 'intent_type2',
    width: 140,
    render: (v, record) => {
      const items = parseIntentType2(v);
      return (
        <Tooltip title={items.length ? items.join('、') : ''} mouseEnterDelay={TIP_DELAY}>
          <div style={{ overflow: 'hidden', maxHeight: 28 }}>
            <SecondaryIntent value={v} intentType1={record.intent_type1} emailId={record.id} onSaved={(fields) => onIntentSaved(record.id, fields)} />
          </div>
        </Tooltip>
      );
    },
  },
  {
    title: '下单状态',
    dataIndex: 'is_done',
    key: 'is_done',
    width: 90,
    ellipsis: true,
    render: (v, record) => {
      const intents = (record.intent_type1 || '').split(',');
      if (!intents.includes(EXCHANGE_OF_PORT)) return '-';
      if (record.status === null || record.status === undefined || record.status === '') return '-';
      if (v === null || v === undefined || v === '' || v === 0) return '-';
      const s = IS_DONE_MAP[v];
      return s ? <Tag color={s.color}>{s.label}</Tag> : v;
    },
  },
  {
    title: '解析状态',
    dataIndex: 'status',
    key: 'status',
    width: 80,
    render: (v) => {
      if (v === null || v === undefined || v === '') return '-';
      const s = PARSE_STATUS_MAP[v];
      return s ? <Tag color={s.color}>{s.label}</Tag> : v;
    },
  },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 100,
    render: (_, row) => (
      <Space size={8} split={<Divider type="vertical" style={{ margin: 0 }} />}>
        <PreviewButton row={row} listContext={listContext} />
        {row.email_url && (
          <Tooltip title="原始邮件链接" mouseEnterDelay={TIP_DELAY}>
            <a href={row.email_url} target="_blank" rel="noreferrer">
              <DownloadOutlined style={{ fontSize: 16, color: '#1677ff' }} />
            </a>
          </Tooltip>
        )}
      </Space>
    ),
  },
];

// 展示 .eml 异步解析返回的关键字段
const ParseResultView = ({ result }) => {
  const intents1 = splitValues(result.intent_type1);
  const intents2 = parseIntentType2(result.intent_type2);
  const rows = [
    ['邮件主题', result.subject],
    ['发件人', result.from],
    ['日期', result.date],
    ['代理名称', result.brokerName],
    ['MBL 号', result.mbl_number],
    ['邮件摘要', result.email_summary],
  ];
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>解析结果</div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: '4px 8px', color: '#999', width: 84, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
              <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{value || <span style={{ color: '#ccc' }}>-</span>}</td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: '4px 8px', color: '#999', verticalAlign: 'top' }}>意图</td>
            <td style={{ padding: '4px 8px' }}>
              {intents1.length || intents2.length ? (
                <Space size={[4, 4]} wrap>
                  {intents1.map((i) => <Tag key={i} color={INTENT_COLOR[i] ?? 'blue'}>{INTENT_LABEL[i] ?? i}</Tag>)}
                  {intents2.map((i) => <Tag key={i}>{i}</Tag>)}
                </Space>
              ) : <span style={{ color: '#ccc' }}>-</span>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

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
  const initOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const [tableData, setTableData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [total, setTotal] = useState(0);
  const [fadingIds, setFadingIds] = useState(new Set());
  const [batchBarMounted, setBatchBarMounted] = useState(false);

  useEffect(() => {
    if (selectedRowKeys.length > 0) {
      setBatchBarMounted(true);
    } else {
      const t = setTimeout(() => setBatchBarMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [selectedRowKeys.length]);

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

  const handleIntentSaved = (id, fields) => {
    setTableData((prev) => prev.map((row) => row.id === id ? { ...row, ...fields } : row));
  };

  const pushParams = (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber, order = initOrder) => {
    const p = {};
    if (page !== 1) p.page = page;
    if (pageSize !== 50) p.pageSize = pageSize;
    if (cat) p.category = cat;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (isCheck !== null && isCheck !== undefined) p.is_check = isCheck;
    if (mblNumber) p.mbl_number = mblNumber;
    if (order === 'asc') p.order = 'asc';
    setSearchParams(p, { replace: false });
  };

  const loadTable = async (page, pageSize, cat, dateFrom, dateTo, isCheck, mblNumber, order) => {
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
        order,
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
    loadTable(initPage, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, initOrder);
  }, [searchParams.toString()]);

  const handleOrderChange = (value) => {
    pushParams(1, initPageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber, value);
  };

  // 当前筛选后的列表上下文，随预览一起带入详情页，用于结果内翻页 + 跨页续翻
  const listContext = {
    ids: tableData.map((r) => r.id),
    page: initPage,
    pageSize: initPageSize,
    total,
    filters: {
      intent_type1: initCategory,
      date_from: initDateFrom,
      date_to: initDateTo,
      is_check: initIsCheck,
      mbl_number: initMblNumber,
      order: initOrder,
    },
  };

  const tableColumns = buildTableColumns(handleCheckChange, handleIntentSaved, listContext, initOrder, handleOrderChange);

  const handleCategoryChange = (value) => {
    pushParams(1, initPageSize, value || '', initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  const handleClearAll = () => {
    setSearchParams({}, { replace: false });
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

  const handleQuickRange = (days) => {
    const to = dayjs().format('YYYY-MM-DD');
    const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
    pushParams(1, initPageSize, initCategory, from, to, initIsCheck, initMblNumber);
  };

  const activeQuickRange = (() => {
    if (initDateTo !== dayjs().format('YYYY-MM-DD')) return null;
    return [1, 7, 15].find(
      (d) => initDateFrom === dayjs().subtract(d - 1, 'day').format('YYYY-MM-DD'),
    ) ?? null;
  })();

  const handlePageChange = (page, pageSize) => {
    pushParams(page, pageSize, initCategory, initDateFrom, initDateTo, initIsCheck, initMblNumber);
  };

  // 上传解析：idle -> uploading -> polling -> done | failed
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [parseResult, setParseResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [showRawResult, setShowRawResult] = useState(false);
  const pollTokenRef = useRef(0); // 自增令牌，切换文件/关弹窗时使旧轮询失效

  const POLL_INTERVAL = 10000;
  const POLL_MAX = 90; // 最多轮询约 3 分钟

  const terminalPhase = (status) => {
    const v = (status || '').toLowerCase();
    if (['completed', 'success', 'succeeded', 'done', 'finished'].includes(v)) return 'done';
    if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(v)) return 'failed';
    return null;
  };

  const pollStatus = async (taskId, token, attempt) => {
    if (pollTokenRef.current !== token) return;
    try {
      const res = await fetchEmailParseStatus(taskId);
      if (pollTokenRef.current !== token) return;
      if (res?.code === 200) {
        const data = res.data || {};
        const phase = terminalPhase(data.status);
        if (phase === 'done') {
          setParseResult(data.result || {});
          setUploadPhase('done');
          return;
        }
        if (phase === 'failed') {
          setParseError(data.error || '解析失败');
          setUploadPhase('failed');
          return;
        }
      }
    } catch {
      // 单次查询失败忽略，继续重试
    }
    if (attempt + 1 >= POLL_MAX) {
      if (pollTokenRef.current === token) {
        setParseError('解析超时，请稍后重试');
        setUploadPhase('failed');
      }
      return;
    }
    setTimeout(() => pollStatus(taskId, token, attempt + 1), POLL_INTERVAL);
  };

  const handleUploadEml = async (file) => {
    const token = ++pollTokenRef.current;
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadPhase('uploading');
    try {
      const res = await uploadEmailEml(file);
      if (pollTokenRef.current !== token) return false;
      if (res?.code === 200 && res.data?.task_id) {
        setUploadPhase('polling');
        pollStatus(res.data.task_id, token, 0);
      } else {
        setParseError(res?.message || '上传失败');
        setUploadPhase('failed');
      }
    } catch (e) {
      if (pollTokenRef.current !== token) return false;
      setParseError(e.message || '上传失败');
      setUploadPhase('failed');
    }
    return false;
  };

  const closeUploadModal = () => {
    pollTokenRef.current += 1; // 让进行中的轮询失效
    setUploadModalOpen(false);
  };

  const openUploadModal = () => {
    pollTokenRef.current += 1;
    setUploadPhase('idle');
    setParseResult(null);
    setParseError('');
    setShowRawResult(false);
    setUploadModalOpen(true);
  };

  const uploadBusy = uploadPhase === 'uploading' || uploadPhase === 'polling';

  return (
    <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <Space wrap>
            <Select
              allowClear
              size="middle  "
              value={initCategory || undefined}
              placeholder="全部类别"
              options={INTENT_OPTIONS}
              style={{ width: 200 }}
              onChange={(value) => handleCategoryChange(value || '')}
            />
            <Input.Search
              size="middle"
              placeholder="搜索 MBL 号"
              defaultValue={initMblNumber}
              allowClear
              style={{ width: 200 }}
              onSearch={handleMblSearch}
            />
            <DatePicker.RangePicker
              open={customPickerOpen}
              onOpenChange={setCustomPickerOpen}
              value={hasDateFilter ? [dayjs(initDateFrom), dayjs(initDateTo)] : null}
              onChange={handleCustomDateChange}
              allowClear
              disabledDate={(d) => d && d > dayjs().endOf('day')}
              style={{ width: 0, padding: 0, border: 'none', overflow: 'hidden', position: 'absolute' }}
            />
            
            <Flex gap="small" wrap>
              <Button
                size="middle"
                type={!hasDateFilter ? 'primary' : 'default'}
                onClick={() => handleCustomDateChange(null)}
              >全部</Button>
              {[1, 7].map((days) => (
                <Button
                  key={days}
                  size="middle"
                  type={activeQuickRange === days ? 'primary' : 'default'}
                  onClick={() => handleQuickRange(days)}
                >近 {days} 天</Button>
              ))}
            </Flex>


            <Button
              size="middle"
              onClick={openUploadModal}
            >上传解析</Button>
          </Space>
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 8,
            }}
          >
          <Radio.Group
            style={{ marginLeft: 'auto' }}
            value={initIsCheck}
            onChange={(e) => handleIsCheckChange(e.target.value)}
            options={[
              {
                value: null,
                label: (
                  <div gap="middle" justify="center" align="center" vertical>
                    <span style={{ fontSize: 10 }} />
                    全部
                  </div>
                ),
              },
              {
                value: 0,
                label: (
                  <div gap="middle" justify="center" align="center" vertical>
                    <span style={{ fontSize: 10 }} />
                    待处理
                  </div>
                ),
              },
              {
                value: 1,
                label: (
                  <div gap="middle" justify="center" align="center" vertical>
                    <span style={{ fontSize: 10 }} />
                    已处理
                  </div>
                ),
              },
            ]}
          />
          </div>
        </div>
        <Modal
          title="上传 .eml 解析"
          open={uploadModalOpen}
          onCancel={closeUploadModal}
          footer={null}
          width={560}
        >
          <Upload.Dragger
            accept=".eml"
            showUploadList={false}
            disabled={uploadBusy}
            beforeUpload={handleUploadEml}
          >
            <p style={{ fontSize: 32, color: '#1677ff', margin: '8px 0' }}><UploadOutlined /></p>
            <p style={{ margin: 0 }}>
              {uploadPhase === 'uploading' ? '上传中...'
                : uploadPhase === 'polling' ? '解析中...'
                : '点击或拖拽 .eml 文件到此区域上传'}
            </p>
          </Upload.Dragger>

          {uploadBusy && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Spin />
              <span style={{ marginLeft: 8, color: '#999' }}>
                {uploadPhase === 'uploading' ? '正在上传文件…' : '正在解析邮件，请稍候…'}
              </span>
            </div>
          )}

          {uploadPhase === 'failed' && (
            <div style={{ marginTop: 16, color: '#cf1322' }}>
              {parseError || '解析失败'}
            </div>
          )}

          {uploadPhase === 'done' && parseResult && (
            <div style={{ marginTop: 16 }}>
              <ParseResultView result={parseResult} />
              <div style={{ marginTop: 12 }}>
                <Button size="small" onClick={() => setShowRawResult((v) => !v)}>
                  {showRawResult ? '隐藏原始数据' : '查看原始数据'}
                </Button>
                <Button
                  size="small"
                  style={{ marginLeft: 8 }}
                  onClick={() => copyText(JSON.stringify(parseResult, null, 2))}
                >复制完整结果</Button>
              </div>
              {showRawResult && (
                <pre
                  style={{
                    marginTop: 8, maxHeight: 260, overflow: 'auto',
                    background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12,
                  }}
                >{JSON.stringify(parseResult, null, 2)}</pre>
              )}
            </div>
          )}
        </Modal>
        {batchBarMounted && (
          <Space
            style={{
              marginBottom: 8,
              opacity: selectedRowKeys.length > 0 ? 1 : 0,
              transform: selectedRowKeys.length > 0 ? 'translateY(0)' : 'translateY(-6px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
          >
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
            pageSize: 50,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            onChange: handlePageChange,
            position: ['bottomCenter'],
          }}
          tableLayout="fixed"
          scroll={{ x: 1660, y: 'calc(100vh - 160px)' }}
        />
    </div>
  );
}
