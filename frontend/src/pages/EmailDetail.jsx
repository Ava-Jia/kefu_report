import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Spin, Modal, message, Pagination, Input, Tag } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, ZoomInOutlined, CheckOutlined, DownloadOutlined, PlusOutlined, SearchOutlined} from '@ant-design/icons';
import { fetchEmailPreview, updateEmail, updateEmailCheck, fetchAdjacentEmail, fetchEmailList, checkOrderByMBL } from '../api';
import {
  EXCHANGE_OF_PORT,
  INTENT_COLOR,
  INTENT_LABEL,
  IS_DONE_MAP,
  PARSE_STATUS_MAP,
  getSecondaryIntentLabel,
  parseIntentType2,
  splitValues,
} from '../constants/intent';

function EditableText({ value, onChange, style, renderValue }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        style={{ ...style, width: '100%', resize: 'vertical', border: '1px solid #1677ff', borderRadius: 4, padding: '2px 6px', outline: 'none', fontFamily: 'inherit' }}
      />
    );
  }

  return (
    <span onDoubleClick={() => { setDraft(value); setEditing(true); }} style={{ ...style, cursor: 'text', display: 'block', minHeight: '1.4em' }}>
      {renderValue ? renderValue(value) : (value || '—')}
    </span>
  );
}

const NUMBERED_FIELDS = ['consigneeEmail', 'consigneeFromEmail'];
const COL_WIDTHS_STORAGE_KEY = 'emailDetail.colWidths';

const circledNumber = (n) => (n >= 1 && n <= 20 ? String.fromCodePoint(9311 + n) : `(${n})`);

const numberList = (str) => {
  const parts = String(str ?? '').split(/[,;、；\n]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '—';
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: 4 }}>
          <span style={{ color: '#999' }}>{circledNumber(i + 1)}</span>
          <span style={{ wordBreak: 'break-all' }}>{p}</span>
        </span>
      ))}
    </span>
  );
};

const RESULT_TEMPLATE = {
  agentEmail: '', agentName: '',
  collectAmountUSD: '', collectItem: '',
  consigneeAddress: '', consigneeEmail: '', consigneeFromEmail: '', consigneeName: '', consigneeTel: '',
  containerType: '', ctrNumber: '',
  customerType: '', descriptionOfGoods: '',
  expenseItem: { Fee: [{ feeName: '', feeAmount: '', type: '' }] },

  grossWeight: '', houseFileUrl: '', houseBillNo: '',
  isSuspicious: 0, mark: '', masterBillNo: '', masterBillNoFromEmail: '', masterFileUrl: '',
  notifyAddress: '', notifyEmails: '', notifyName: '', notifyTel: '',
  orderType: '', packageUnit: '', pieces: '',
  shipperAddress: '', shipperEmail: '', shipperName: '', shipperTel: '',
  summary: '', volume: '',
};

const deepMerge = (tmpl, src) => {
  if (Array.isArray(tmpl)) {
    if (!Array.isArray(src) || src.length === 0) return tmpl;
    return src.map((item) => deepMerge(tmpl[0], item));
  }
  if (tmpl && typeof tmpl === 'object') {
    const merged = {};
    for (const key of Object.keys(tmpl)) {
      merged[key] = deepMerge(tmpl[key], src?.[key]);
    }
    return merged;
  }
  return src !== undefined ? src : tmpl;
};

const FIELD_LABEL = {
  agentEmail: '代理邮箱', agentName: '代理名称',
  collectAmountUSD: '到付金额(USD)', collectItem: '到付项目',
  consigneeAddress: '收货人地址', consigneeEmail: '收货人邮箱',
  consigneeFromEmail: '收货人(邮件)', consigneeName: '收货人名称', consigneeTel: '收货人电话',
  containerType: 'COC/SOC', ctrNumber: '箱号',
  customerType: '客户类型', descriptionOfGoods: '货物描述',
  grossWeight: '毛重', houseBillNo: 'HBL Number',
  houseFileUrl: 'HBL链接', isSuspicious: '是否可疑',
  mark: '唛头', masterBillNo: 'MBL Number', masterFileUrl: 'MBL链接',
  masterBillNoFromEmail: 'MBL(邮件)', notifyAddress: '通知方地址',
  notifyEmails: '通知方邮箱', notifyName: '通知方名称',
  notifyTel: '通知方电话', orderType: '单据类型',
  packageUnit: '包装单位', pieces: '件数',
  shipperAddress: '发货人地址', shipperEmail: '发货人邮箱',
  shipperName: '发货人名称', shipperTel: '发货人电话',
  summary: '备注', volume: '体积',
  feeName: '费用名称', feeAmount: '费用金额', type: '费用类型',
};

const FIELD_ORDER = [
  'masterBillNo', 'houseBillNo',
  'consigneeName', 'consigneeEmail', 'consigneeFromEmail', 'consigneeAddress',
  'notifyName', 'notifyAddress',
  'shipperName', 'shipperAddress',
  'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume', 'containerType',
  'expenseItem',
];
const ATTENTION_FIELDS = ['masterBillNo', 'houseBillNo', 'consigneeName', 'consigneeEmail', 'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume', 'containerType', 'feeName', 'feeAmount',];
const SECTION_DIVIDER_AFTER = new Set(['houseBillNo', 'consigneeAddress', 'shipperAddress', 'containerType']);

const flattenValue = (val, path) => {
  if (Array.isArray(val)) {
    return val.flatMap((item, i) => flattenValue(item, [...path, i]));
  }
  if (val && typeof val === 'object') {
    return Object.entries(val).flatMap(([k, v]) => {
      const childPath = [...path, k];
      return (Array.isArray(v) || (v && typeof v === 'object')) ? flattenValue(v, childPath) : [[k, v, childPath]];
    });
  }
  return [];
};

const sortedEntries = (obj) => {
  const entries = Object.entries(obj);
  const ordered = FIELD_ORDER.flatMap((k) => {
    const found = entries.find(([key]) => key === k);
    if (!found) return [];
    if (k === 'expenseItem') return flattenValue(found[1], [k]);
    return [[found[0], found[1], [k]]];
  });
  const rest = entries.filter(([k]) => !FIELD_ORDER.includes(k)).map(([k, v]) => [k, v, [k]]);
  return [...ordered, ...rest];
};

const setDeep = (obj, path, val) => {
  const [head, ...rest] = path;
  const container = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  container[head] = rest.length === 0 ? val : setDeep(container[head], rest, val);
  return container;
};

const LABEL_BOX_STYLE = {
  width: 90,
  height: 22,
  flexShrink: 0,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 4px',
  fontWeight: 600,
  fontSize: 12,
  color: '#d46b08',
  background: '#fff7e6',
  borderRadius: 4,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

const LABEL_BOX_STYLE_ATTENTION = {
  ...LABEL_BOX_STYLE,
  color: '#cf1322',
  background: '#fff1f0',
};

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const isImageUrl = (v) => typeof v === 'string' && /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(v);
const isPdfUrl = (v) => typeof v === 'string' && /\.pdf(\?|$)/i.test(v);

const OSS_BASE_URL = 'https://pltplt.oss-cn-shanghai.aliyuncs.com/';
// 部分历史附件没有 oss_url，只有对象存储的 path，需要自行拼出可访问链接
const resolveAttachmentUrl = (att) => att?.oss_url || (att?.path ? OSS_BASE_URL + String(att.path).replace(/^\/+/, '') : undefined);

const makeHtmlReadable = (raw) => raw
  .replace(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi, (m, n) => parseFloat(n) < 24 ? 'font-size:24px' : m)
  .replace(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*pt/gi, (m, n) => parseFloat(n) < 18 ? 'font-size:18pt' : m);

function ResultField({ label, value, onChange, linkUrl }) {
  const display = value === null || value === undefined || value === '' ? null
    : typeof value === 'object' ? value
    : String(value);

  const friendlyLabel = FIELD_LABEL[label] || label;
  const labelBoxStyle = ATTENTION_FIELDS.includes(label) ? LABEL_BOX_STYLE_ATTENTION : LABEL_BOX_STYLE;
  const rowBorderBottom = SECTION_DIVIDER_AFTER.has(label) ? '2px solid #000' : '1px solid #f5f5f5';

  if (display === null) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: rowBorderBottom, alignItems: 'flex-end' }}>
        <span style={labelBoxStyle}>{friendlyLabel}</span>
        {onChange ? (
          <EditableText value="" onChange={onChange} style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff', flex: 1 }} />
        ) : (
          <span style={{ color: '#1677ff', fontSize: 13 }}>—</span>
        )}
      </div>
    );
  }

  if (typeof display === 'object') {
    return (
      <div style={{ padding: '6px 0', borderBottom: rowBorderBottom }}>
        <div style={{ ...labelBoxStyle, display: 'inline-flex', marginBottom: 4 }}>{friendlyLabel}</div>
        <div style={{ paddingLeft: 8, borderLeft: '2px solid #e8e8e8' }}>
          {Object.entries(display).map(([k, v]) => (
            <ResultField key={k} label={k} value={v} />
          ))}
        </div>
      </div>
    );
  }

  if (NUMBERED_FIELDS.includes(label) && !isUrl(display)) {
    const parts = String(display).split(/[,;、；\n]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return (
        <div style={{ padding: '6px 0', borderBottom: rowBorderBottom }}>
          {parts.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: i === 0 ? 0 : 4 }}>
              <span style={{ ...labelBoxStyle, visibility: i === 0 ? 'visible' : 'hidden' }}>{friendlyLabel}</span>
              <span style={{ color: '#999', fontSize: 13, flexShrink: 0 }}>{circledNumber(i + 1)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {onChange ? (
                  <EditableText
                    value={p}
                    onChange={(val) => onChange(parts.map((q, j) => (j === i ? val : q)).filter(Boolean).join(', '))}
                    style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff', flex: 1 }}
                  />
                ) : (
                  <span style={{ fontSize: 13, wordBreak: 'break-all', color: '#1677ff' }}>{p}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: rowBorderBottom, alignItems: 'flex-end' }}>
      <span style={labelBoxStyle}>{friendlyLabel}</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1, minWidth: 0 }}>
        {isUrl(display) ? (
          <a href={display} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1677ff' }}>
            查看链接
          </a>
        ) : onChange ? (
          <EditableText
            value={display}
            onChange={onChange}
            style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff', flex: 1 }}
            renderValue={NUMBERED_FIELDS.includes(label) ? numberList : undefined}
          />
        ) : (
          <span style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff' }}>
            {NUMBERED_FIELDS.includes(label) ? numberList(display) : display}
          </span>
        )}
      </span>
    </div>
  );
}

const META_LABEL_STYLE = {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 600,
  color: '#aaa',
};

const EMPTY_META = <span style={{ color: '#ccc' }}>—</span>;

function MetaItem({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
      <span style={META_LABEL_STYLE}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
        {children}
      </div>
    </div>
  );
}

// 邮件自身的属性（意图 / 下单状态 等），横向排在顶栏，与第三列的解析结果分开展示
function EmailMetaPanel({ info }) {
  if (!info) return null;

  const intents1 = splitValues(info.intentType1);
  const intents2 = parseIntentType2(info.intentType2);

  // 下单状态仅对「预报/换单」且已解析出结果的邮件有意义，与列表页保持一致
  const doneStatus = intents1.includes(EXCHANGE_OF_PORT) && info.isDone
    ? IS_DONE_MAP[info.isDone]
    : null;
  const parseStatus = info.status ? PARSE_STATUS_MAP[info.status] : null;

  return (
    <div
      className="scrollbar-hidden"
      style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, overflowX: 'auto' }}
    >
      <MetaItem label="一级意图">
        {intents1.length
          ? intents1.map((i) => <Tag key={i} color={INTENT_COLOR[i] ?? 'blue'}>{INTENT_LABEL[i] ?? i}</Tag>)
          : EMPTY_META}
      </MetaItem>
      <MetaItem label="二级意图">
        {intents2.length
          ? intents2.map((i) => <Tag key={i}>{getSecondaryIntentLabel(i)}</Tag>)
          : EMPTY_META}
      </MetaItem>
      <MetaItem label="下单状态">
        {doneStatus ? <Tag color={doneStatus.color}>{doneStatus.label}</Tag> : EMPTY_META}
      </MetaItem>
      <MetaItem label="解析状态">
        {parseStatus
          ? <Tag color={parseStatus.color}>{parseStatus.label}</Tag>
          : <span style={{ color: '#ccc' }}>{info.status || '—'}</span>}
      </MetaItem>
      <MetaItem label="MBL">{info.mblNumber || EMPTY_META}</MetaItem>
    </div>
  );
}

export default function EmailDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from ?? '/email';

  // 筛选结果列表上下文（来自列表页的预览跳转），用于在筛选集合内翻页 + 跨页续翻
  const [listNav, setListNav] = useState(location.state?.list ?? null);

  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [subject, setSubject] = useState(location.state?.subject ?? '');
  // 邮件本身的属性（意图、下单状态等），区别于第三列的解析结果
  const [emailInfo, setEmailInfo] = useState(null);
  const [dataId, setDataId] = useState(null);
  const [isCheck, setIsCheck] = useState(0);
  const [checking, setChecking] = useState(false);
  const [navLoading, setNavLoading] = useState(null);
  const [result, setResult] = useState(() => deepMerge(RESULT_TEMPLATE, null));
  const [rawResult, setRawResult] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [visible, setVisible] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const iframeRef = useRef(null);
  const rowRef = useRef(null);
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_STORAGE_KEY));
      if (Array.isArray(saved) && saved.length === 3 && saved.every((n) => typeof n === 'number')) return saved;
    } catch {
      // ignore invalid saved value
    }
    return [20, 50, 30];
  });
  const [dragging, setDragging] = useState(false);

  const handleDividerMouseDown = (index) => (e) => {
    e.preventDefault();
    const container = rowRef.current;
    if (!container) return;
    const startX = e.clientX;
    const startWidths = colWidths;
    const containerWidth = container.offsetWidth;
    const MIN = 10;

    setDragging(true);
    let finalWidths = startWidths;

    const onMouseMove = (moveEvent) => {
      const deltaPercent = ((moveEvent.clientX - startX) / containerWidth) * 100;
      let left = startWidths[index] + deltaPercent;
      let right = startWidths[index + 1] - deltaPercent;
      if (left < MIN) { right -= (MIN - left); left = MIN; }
      if (right < MIN) { left -= (MIN - right); right = MIN; }
      const next = [...startWidths];
      next[index] = left;
      next[index + 1] = right;
      finalWidths = next;
      setColWidths(next);
    };

    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(finalWidths));
      } catch {
        // ignore storage errors (e.g. quota, disabled)
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleBack = () => {
    setVisible(false);
    setTimeout(() => navigate(backTo), 300);
  };

  const handleEmailLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    doc.body.style.zoom = '';
    const contentWidth = doc.body.scrollWidth;
    const containerWidth = iframe.offsetWidth;
    if (contentWidth > 0 && containerWidth > 0) {
      doc.body.style.zoom = Math.min(containerWidth / contentWidth, 1.3);
    }
  };
  const [resultLoading, setResultLoading] = useState(false);
  const [resultDirty, setResultDirty] = useState(false);
  const [resultSaving, setResultSaving] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  // 一封邮件可能有多条解析结果，按「条」翻页展示
  const [resultPage, setResultPage] = useState(0);
  const savedSnapshotRef = useRef({ result: null, rawResult: null });
  // 按页记录本次编辑改动过的顶层字段：{ [pageIdx]: { field: val } }，保存时按页分别回传
  const changedFieldsRef = useRef({});

  const onFieldChange = (path, val) => {
    const page = resultPage;
    setResult((prev) => {
      if (Array.isArray(prev)) {
        const next = prev.slice();
        next[page] = setDeep(next[page] ?? {}, path, val);
        return next;
      }
      return setDeep(prev, path, val);
    });
    setRawResult((prev) => {
      const isArr = Array.isArray(prev);
      const base = isArr ? (prev[page] ?? {}) : (prev ?? {});
      const nextBase = setDeep(base, path, val);
      const pageChanges = { ...(changedFieldsRef.current[page] || {}), [path[0]]: nextBase[path[0]] };
      changedFieldsRef.current = { ...changedFieldsRef.current, [page]: pageChanges };
      if (isArr) {
        const next = prev.slice();
        next[page] = nextBase;
        return next;
      }
      return nextBase;
    });
    setResultDirty(true);
  };

  const handleMblSearch = async (value) => {
    const mbl = value.trim();
    if (!mbl) return;
    setResultLoading(true);
    try {
      const res = await checkOrderByMBL(mbl);
      if (res?.code === 200 && Array.isArray(res.data) && res.data.length) {
        const raws = res.data.map((row) => row.parser_result);
        const merged = raws.map((r) => deepMerge(RESULT_TEMPLATE, r));
        let newIndex = 0;
        setResult((prev) => {
          const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
          newIndex = arr.length;
          return [...arr, ...merged];
        });
        setRawResult((prev) => {
          const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
          return [...arr, ...raws];
        });
        // 检索出的记录即使不再手动编辑字段，保存时也要把整条记录回传给后端
        const newChanges = { ...changedFieldsRef.current };
        raws.forEach((r, i) => {
          newChanges[newIndex + i] = { ...(r || {}) };
        });
        changedFieldsRef.current = newChanges;
        setResultPage(newIndex);
        setResultDirty(true);
      } else {
        message.info(res?.message || '未找到该 MBL 的解析结果');
      }
    } catch {
      message.error('查询失败');
    } finally {
      setResultLoading(false);
    }
  };

  const handleAddResult = () => {
    const blank = deepMerge(RESULT_TEMPLATE, null);
    let newIndex = 0;
    setResult((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
      arr.push(blank);
      newIndex = arr.length - 1;
      return arr;
    });
    setRawResult((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : (prev ? [prev] : []);
      arr.push(deepMerge(RESULT_TEMPLATE, null));
      return arr;
    });
    setResultPage(newIndex);
    setResultDirty(true);
  };

  

  const handleCancelEdit = () => {
    setResult(savedSnapshotRef.current.result);
    setRawResult(savedSnapshotRef.current.rawResult);
    changedFieldsRef.current = {};
    setResultDirty(false);
  };

  const handleCheck = async () => {
    const next = isCheck === 1 ? 0 : 1;
    setChecking(true);
    try {
      const res = await updateEmailCheck(id, next);
      if (res?.code === 200) {
        setIsCheck(next);
        message.success(next === 1 ? '已标记为已处理' : '已取消处理');
      } else {
        message.error(res?.message || '操作失败');
      }
    } catch {
      message.error('操作失败');
    } finally {
      setChecking(false);
    }
  };

  const [voiding, setVoiding] = useState(false);

  const handleVoid = () => {
    Modal.confirm({
      title: '确认作废',
      content: '作废后该邮件状态将标记为「作废」，是否继续？',
      okText: '确认作废',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setVoiding(true);
        try {
          const res = await updateEmail(id, { is_done: 4 });
          if (res?.code === 200) {
            setEmailInfo((prev) => (prev ? { ...prev, isDone: 4 } : prev));
            message.success('已作废');
          } else {
            message.error(res?.message || '作废失败');
          }
        } catch {
          message.error('作废失败');
        } finally {
          setVoiding(false);
        }
      },
    });
  };

  const handleSaveResult = async () => {
    setResultSaving(true);
    try {
      const rawList = Array.isArray(rawResult) ? rawResult : (rawResult ? [rawResult] : [{}]);
      // 逐条保存改动过的解析结果，带上改动前的提单号让后端定位到具体那条记录
      let ok = true;
      for (const key of Object.keys(changedFieldsRef.current)) {
        const patch = changedFieldsRef.current[key];
        if (!patch || Object.keys(patch).length === 0) continue;
        const original = rawList[Number(key)] ?? {};
        const res = await updateEmail(id, {
          parser_result: JSON.stringify(patch),
          parser_master_bill_no: original.masterBillNo ?? null,
          parser_house_bill_no: original.houseBillNo ?? null,
        });
        if (res?.code !== 200) {
          ok = false;
          message.error(res?.message || '保存失败');
          break;
        }
      }
      if (ok) {
        message.success('保存成功');
        savedSnapshotRef.current = { result, rawResult };
        changedFieldsRef.current = {};
        setResultDirty(false);
      }
    } catch {
      message.error('保存失败');
    } finally {
      setResultSaving(false);
    }
  };

  const navLoadingRef = useRef(false);

  const releaseNavLock = () => {
    navLoadingRef.current = false;
    setNavLoading(null);
  };

  // 列表模式翻页：跳转到目标 id，并透传（可能已更新的）列表上下文。
  // 跳转后保持锁定，直到新邮件的 preview 数据加载完成（见下方 useEffect 的 finally）才释放。
  const goToListId = (targetId, nav) => {
    setListNav(nav);
    navigate(`/email/${targetId}`, { state: { from: backTo, list: nav } });
  };

  // 跨页：用相同筛选条件拉取相邻页，跳到该页首/末条
  const loadAdjacentPage = async (nav, targetPage, pos) => {
    try {
      const res = await fetchEmailList({ page: targetPage, page_size: nav.pageSize, ...nav.filters });
      if (res?.code === 200 && res.data?.items?.length) {
        const items = res.data.items;
        const target = pos === 'first' ? items[0] : items[items.length - 1];
        goToListId(target.id, {
          ...nav,
          ids: items.map((it) => it.id),
          page: targetPage,
          total: res.data.total ?? nav.total,
        });
        return;
      }
      message.info(pos === 'first' ? '已经是最后一条' : '已经是第一条');
    } catch {
      message.error('切换失败');
    }
    releaseNavLock();
  };

  const navigateAdjacent = async (direction) => {
    if (navLoadingRef.current) return;

    // 列表模式：在筛选结果集合内翻页（带跨页续翻）
    if (listNav?.ids?.length) {
      const ids = listNav.ids;
      let idx = ids.findIndex((x) => String(x) === String(id));
      if (idx === -1) idx = 0;
      const target = idx + (direction === 'next' ? 1 : -1);

      navLoadingRef.current = true;
      setNavLoading(direction);

      if (target >= 0 && target < ids.length) {
        goToListId(ids[target], listNav);
        return;
      }
      if (direction === 'next') {
        if (listNav.page * listNav.pageSize < listNav.total) {
          await loadAdjacentPage(listNav, listNav.page + 1, 'first');
        } else {
          message.info('已经是最后一条');
          releaseNavLock();
        }
      } else if (listNav.page > 1) {
        await loadAdjacentPage(listNav, listNav.page - 1, 'last');
      } else {
        message.info('已经是第一条');
        releaseNavLock();
      }
      return;
    }

    // 回退模式：无列表上下文（直接访问 / 刷新），按 data_id 走后端相邻查询
    if (dataId === null || dataId === undefined) {
      message.info('缺少 data_id，无法定位上一条/下一条');
      return;
    }
    navLoadingRef.current = true;
    setNavLoading(direction);
    try {
      const res = await fetchAdjacentEmail(id, dataId, direction);
      if (res?.code === 200) {
        if (res.data?.id) {
          navigate(`/email/${res.data.id}`, { state: { from: backTo } });
          return;
        }
        message.info(direction === 'next' ? '已经是最后一条' : '已经是第一条');
      } else {
        message.error(res?.message || '切换失败');
      }
    } catch {
      message.error('切换失败');
    }
    releaseNavLock();
  };

  const handleNav = (direction, e) => {
    e?.currentTarget?.blur();
    if (navLoadingRef.current) return;
    if (resultDirty) {
      Modal.confirm({
        title: '有未保存的修改',
        content: '切换邮件将丢失未保存的修改，是否继续？',
        okText: '继续',
        cancelText: '取消',
        onOk: () => navigateAdjacent(direction),
      });
    } else {
      navigateAdjacent(direction);
    }
  };

  const resultList = Array.isArray(result) ? result : (result ? [result] : []);
  const resultObj = resultList[resultPage] ?? resultList[0] ?? deepMerge(RESULT_TEMPLATE, null);

  useEffect(() => {
    setResultLoading(true);
    setResultDirty(false);
    setResultPage(0);
    setEmailInfo(null);
    changedFieldsRef.current = {};
    setSubject(location.state?.subject ?? '');
    fetchEmailPreview(id)
      .then((res) => {
        if (res?.code === 200) {
          const { html_content: htmlContent, attachments: allAttachments, result: raw, data_id: emailDataId, subject: emailSubject, is_check: emailIsCheck } = res.data;
          setDataId(emailDataId ?? null);
          setIsCheck(emailIsCheck ?? 0);
          setSubject(emailSubject ?? '');
          setEmailInfo({
            intentType1: res.data.intent_type1,
            intentType2: res.data.intent_type2,
            isDone: res.data.is_done,
            status: res.data.status,
            mblNumber: res.data.mbl_number,
            summary: res.data.email_summary,
          });

          // html_content 可能是字符串或字符串数组，统一拼成字符串
          const htmlStr = Array.isArray(htmlContent) ? htmlContent.join('') : (htmlContent || '');
          setHtml(makeHtmlReadable(htmlStr));

          const attachmentList = (allAttachments ?? [])
            .map((item) => ({
              attachmentName: item.filename,
              attachmentTypeUrl: resolveAttachmentUrl(item),
            }));
          setAttachments(attachmentList);

          const mergedResult = Array.isArray(raw)
            ? raw.map((item) => deepMerge(RESULT_TEMPLATE, item))
            : deepMerge(RESULT_TEMPLATE, raw);
          setRawResult(raw ?? null);
          setResult(mergedResult);
          savedSnapshotRef.current = { result: mergedResult, rawResult: raw ?? null };
        } else {
          setDataId(null);
          setRawResult(null);
          setResult(deepMerge(RESULT_TEMPLATE, null));
          savedSnapshotRef.current = { result: deepMerge(RESULT_TEMPLATE, null), rawResult: null };
        }
      })
      .catch(() => {
        setDataId(null);
        setRawResult(null);
        setResult(deepMerge(RESULT_TEMPLATE, null));
        savedSnapshotRef.current = { result: deepMerge(RESULT_TEMPLATE, null), rawResult: null };
      })
      .finally(() => {
        setHtmlLoading(false);
        setResultLoading(false);
        navLoadingRef.current = false;
        setNavLoading(null);
      });
  }, [id]);

  // 列表模式下的首/尾边界（用于禁用对应翻页按钮）
  const listIdx = listNav?.ids?.length ? listNav.ids.findIndex((x) => String(x) === String(id)) : -1;
  const atListStart = !!listNav?.ids?.length && listNav.page <= 1 && listIdx <= 0;
  const atListEnd = !!listNav?.ids?.length
    && listNav.page * listNav.pageSize >= listNav.total
    && listIdx >= listNav.ids.length - 1;

  const emailSrcDoc = `<style>
    ::-webkit-scrollbar{display:none}
    html,body{scrollbar-width:none;-ms-overflow-style:none;font-size:24px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;word-break:break-word}
    img{max-width:100%;height:auto}
    table{max-width:100%}
  </style>${html || '<p style="color:#aaa;padding:24px">无 HTML 内容</p>'}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#fff',
        zIndex: 100,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '2px solid #d0d0d0',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回
        </Button>

        <EmailMetaPanel info={emailInfo} />

        <div
          style={{
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Button
            shape="circle"
            size="large"
            icon={<CheckOutlined />}
            type={isCheck === 1 ? 'primary' : 'default'}
            loading={checking}
            onClick={handleCheck}
            title={isCheck === 1 ? '已处理（点击取消）' : '标记为已处理'}
          />
          <Button
            size="large"
            type="primary"
            loading={navLoading === 'prev'}
            disabled={navLoading === 'next' || atListStart}
            onClick={(e) => handleNav('prev', e)}
          >
            上一个
          </Button>
          <Button
            size="large"
            type="primary"
            loading={navLoading === 'next'}
            disabled={navLoading === 'prev' || atListEnd}
            onClick={(e) => handleNav('next', e)}
          >
            下一个
          </Button>
          
          <Button
            size="large"
            danger
            loading={voiding}
            onClick={handleVoid}
          >
            作废
          </Button>

          <Button
            size="large"
            disabled={!resultDirty || resultSaving}
            danger
            onClick={handleCancelEdit}
          >
            取消修改
          </Button>

          <Button
            size="large"
            type="primary"
            disabled={!resultDirty}
            loading={resultSaving}
            onClick={handleSaveResult}
          >
            保存
          </Button>
        </div>
      </div>
      {dragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />
      )}
      <div ref={rowRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 第一列：邮件预览 */}
      <div style={{ width: `${colWidths[0]}%`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', flexShrink: 0, borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>邮件主题</div>
          {subject ? (
            <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.6, wordBreak: 'break-all', fontWeight: 500 }}>{subject}</div>
          ) : (
            <div style={{ fontSize: 13, color: '#ccc' }}>—</div>
          )}
        </div>

        <div style={{ padding: '8px 14px 4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>邮件内容</div>
          <ZoomInOutlined
            onClick={() => setZoomOpen(true)}
            style={{ fontSize: 14, color: '#999', cursor: 'pointer' }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {htmlLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Spin />
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="email-html-preview"
              srcDoc={emailSrcDoc}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-same-origin"
              onLoad={handleEmailLoad}
            />
          )}
        </div>
      </div>

      <div
        onMouseDown={handleDividerMouseDown(0)}
        style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: '#d0d0d0' }}
      />

      {/* 第二列：附件列表（直接内嵌展示内容） */}
      <div style={{ width: `${colWidths[1]}%`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, flexShrink: 0 }}>附件列表</div>
        {attachments.length > 0 ? (
          <>
            {/* 切换按钮 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, flexShrink: 0 }}>
              {attachments.map((a, i) => (
                <div
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${activeIdx === i ? '#1677ff' : '#e8e8e8'}`,
                    background: activeIdx === i ? '#e6f4ff' : '#fafafa',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#333',
                  }}
                >
                  <span>{a.attachmentName}</span>
                </div>
              ))}
            </div>
            {/* 当前附件内容 */}
            {attachments[activeIdx] && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {!attachments[activeIdx].attachmentTypeUrl ? (
                  <div style={{ color: '#aaa', fontSize: 13 }}>该附件暂无可预览链接</div>
                ) : isImageUrl(attachments[activeIdx].attachmentTypeUrl) ? (
                  <img
                    src={attachments[activeIdx].attachmentTypeUrl}
                    alt={attachments[activeIdx].attachmentName}
                    style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
                ) : isPdfUrl(attachments[activeIdx].attachmentTypeUrl) ? (
                  <iframe
                    title={`attachment-${activeIdx}`}
                    src={`${attachments[activeIdx].attachmentTypeUrl}#view=FitH&toolbar=0`}
                    style={{ width: '100%', height: '100%', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
                ) : (
                  <div style={{ color: '#aaa', fontSize: 13 }}>
                    该附件暂不支持预览，
                    <a href={attachments[activeIdx].attachmentTypeUrl} target="_blank" rel="noreferrer">
                      <DownloadOutlined /> 点击下载
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#aaa', fontSize: 13 }}>暂无附件</div>
        )}
      </div>

      <div
        onMouseDown={handleDividerMouseDown(1)}
        style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: '#d0d0d0' }}
      />

      {/* 第三列：解析信息 */}
      <div className="scrollbar-hidden" style={{ width: `${colWidths[2]}%`, flexShrink: 0, padding: '16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontWeight: 600, fontSize: 18, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            解析信息
            {resultLoading && <Spin size="large" />}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-start', flex: 1}}>
            {resultList.map((_, i) => (
              <Button
                key={i}
                size="large"
                type={i === resultPage ? 'primary' : 'default'}
                onClick={() => setResultPage(i)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              size="large"
              onClick={handleAddResult}
              icon={<PlusOutlined />}
            />

            <Input.Search
              allowClear
              enterButton
              size="large"
              placeholder="按 MBL 查询解析结果"
              prefix={<SearchOutlined />}
              onSearch={handleMblSearch}
              loading={resultLoading}
              style={{ width: 170 }}
            />
          </div>
        </div>

        {sortedEntries(resultObj).map(([k, v, path]) => (
          <ResultField key={path.join('.')} label={k} value={v}
            onChange={(v === null || typeof v !== 'object') && !isUrl(String(v ?? '')) ? (val) => onFieldChange(path, val) : undefined}
            linkUrl={k === 'houseBillNo' ? resultObj.houseFileUrl : k === 'masterBillNo' ? resultObj.masterFileUrl : undefined}
          />
        ))}
      </div>
      </div>
      <Modal
        open={zoomOpen}
        onCancel={() => setZoomOpen(false)}
        footer={null}
        title="邮件内容"
        width="80vw"
        styles={{ body: { height: '80vh', padding: 0 } }}
      >
        <iframe
          title="email-html-preview-zoom"
          srcDoc={emailSrcDoc}
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-same-origin"
        />
      </Modal>
    </div>
  );
}
