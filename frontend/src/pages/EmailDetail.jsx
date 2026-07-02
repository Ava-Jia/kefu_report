import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Spin, Modal, message } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, ZoomInOutlined } from '@ant-design/icons';
import { fetchEmailPreview, updateEmail } from '../api';

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

const NUMBERED_FIELDS = ['consigneeEmail'];
const COL_WIDTHS_STORAGE_KEY = 'emailDetail.colWidths';

const circledNumber = (n) => (n >= 1 && n <= 20 ? String.fromCodePoint(9311 + n) : `(${n})`);

const numberList = (str) => {
  const parts = String(str ?? '').split(/[,;、；\n]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.map((p, i) => `${circledNumber(i + 1)} ${p}`).join('\n');
};

const RESULT_TEMPLATE = {
  agentEmail: '', agentName: '',
  collectAmountUSD: '', collectItem: '',
  consigneeAddress: '', consigneeEmail: '', consigneeName: '', consigneeTel: '',
  containerType: '', ctrNumber: '',
  customerType: '', descriptionOfGoods: '',
  expenseItem: {
    expenseName: '',expenseAmount: '',
    otherFee: [{ otherFeeName: '', otherFeeAmount: '', type: '' }],
  },
  grossWeight: '', hblUrl: '', houseBillNo: '',
  isSuspicious: 0, mark: '', masterBillNo: '', masterBillNoFromEmail: '',
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
  consigneeName: '收货人名称', consigneeTel: '收货人电话',
  containerType: 'COC/SOC', ctrNumber: '箱号',
  customerType: '客户类型', descriptionOfGoods: '货物描述',
  grossWeight: '毛重', houseBillNo: 'HBL Number',
  hblUrl: 'HBL链接', isSuspicious: '是否可疑',
  mark: '唛头', masterBillNo: 'MBL Number',
  masterBillNoFromEmail: 'MBL(邮件)', notifyAddress: '通知方地址',
  notifyEmails: '通知方邮箱', notifyName: '通知方名称',
  notifyTel: '通知方电话', orderType: '单据类型',
  packageUnit: '包装单位', pieces: '件数',
  shipperAddress: '发货人地址', shipperEmail: '发货人邮箱',
  shipperName: '发货人名称', shipperTel: '发货人电话',
  summary: '备注', volume: '体积',
  expenseName: '费用名称',expenseAmount: '费用金额',
  handlingFee: '操作费', otherFeeAmount: '其他费用金额', otherFeeName: '其他费用名称', type: '费用类型',
};

const FIELD_ORDER = [
  'masterBillNo', 'houseBillNo',
  'consigneeName', 'consigneeEmail', 'consigneeAddress',
  'notifyName', 'notifyAddress',
  'shipperName', 'shipperAddress',
  'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume', 'containerType',
  'expenseItem', 'expenseName', 'expenseAmount', 'handlingFee',
];
const ATTENTION_FIELDS = ['masterBillNo', 'houseBillNo', 'consigneeName', 'consigneeEmail', 'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume', 'containerType', 'expenseItem', 'expenseAmount', 'expenseName'];
const SECTION_DIVIDER_AFTER = new Set(['houseBillNo', 'consigneeAddress', 'shipperAddress', 'containerType', 'expenseAmount']);

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

export default function EmailDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from ?? '/email';
  const subject = location.state?.subject ?? '';

  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(true);
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
  const savedSnapshotRef = useRef({ result: null, rawResult: null });

  const onFieldChange = (path, val) => {
    setResult((prev) => {
      if (Array.isArray(prev)) return [setDeep(prev[0] ?? {}, path, val), ...prev.slice(1)];
      return setDeep(prev, path, val);
    });
    setRawResult((prev) => {
      if (Array.isArray(prev)) return [setDeep(prev[0] ?? {}, path, val), ...prev.slice(1)];
      return setDeep(prev ?? {}, path, val);
    });
    setResultDirty(true);
  };

  const handleCancelEdit = () => {
    setResult(savedSnapshotRef.current.result);
    setRawResult(savedSnapshotRef.current.rawResult);
    setResultDirty(false);
  };

  const handleSaveResult = async () => {
    setResultSaving(true);
    try {
      const res = await updateEmail(id, { parser_result: JSON.stringify(rawResult) });
      if (res?.code === 200) {
        message.success('保存成功');
        savedSnapshotRef.current = { result, rawResult };
        setResultDirty(false);
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setResultSaving(false);
    }
  };

  const resultObj = result ? (Array.isArray(result) ? result[0] ?? {} : result) : null;

  useEffect(() => {
    setResultLoading(true);
    setResultDirty(false);
    fetchEmailPreview(id)
      .then((res) => {
        if (res?.code === 200) {
          const { html_content: htmlContent, attachments: allAttachments, result: raw } = res.data;

          let htmlStr = htmlContent || '';
          (allAttachments ?? []).forEach((att) => {
            if (att.content_id && att.oss_url) {
              const cid = att.content_id.replace(/^<|>$/g, '');
              htmlStr = htmlStr.split(`cid:${cid}`).join(att.oss_url);
            }
          });
          setHtml(makeHtmlReadable(htmlStr));

          const pdfList = (allAttachments ?? [])
            .filter((item) => (item.filename || '').toLowerCase().endsWith('.pdf'))
            .map((item) => ({
              attachmentName: item.filename,
              attachmentTypeUrl: item.oss_url,
            }));
          setAttachments(pdfList);

          const mergedResult = Array.isArray(raw)
            ? raw.map((item) => deepMerge(RESULT_TEMPLATE, item))
            : deepMerge(RESULT_TEMPLATE, raw);
          setRawResult(raw ?? null);
          setResult(mergedResult);
          savedSnapshotRef.current = { result: mergedResult, rawResult: raw ?? null };
        } else {
          setRawResult(null);
          setResult(deepMerge(RESULT_TEMPLATE, null));
          savedSnapshotRef.current = { result: deepMerge(RESULT_TEMPLATE, null), rawResult: null };
        }
      })
      .catch(() => {
        setRawResult(null);
        setResult(deepMerge(RESULT_TEMPLATE, null));
        savedSnapshotRef.current = { result: deepMerge(RESULT_TEMPLATE, null), rawResult: null };
      })
      .finally(() => {
        setHtmlLoading(false);
        setResultLoading(false);
      });
  }, [id]);

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

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Button
            size="large"
            type="primary"
          >
            审核/提交
          </Button>
          <Button
            size="large"
            type="primary"
            danger>
            审核不通过
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
                {isImageUrl(attachments[activeIdx].attachmentTypeUrl) ? (
                  <img
                    src={attachments[activeIdx].attachmentTypeUrl}
                    alt={attachments[activeIdx].attachmentName}
                    style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
                ) : (
                  <iframe
                    title={`attachment-${activeIdx}`}
                    src={`${attachments[activeIdx].attachmentTypeUrl}#view=FitH&toolbar=0`}
                    style={{ width: '100%', height: '100%', border: '1px solid #e8e8e8', borderRadius: 6 }}
                  />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          解析信息
          {resultLoading && <Spin size="small" />}
        </div>
        {sortedEntries(resultObj).map(([k, v, path]) => (
          <ResultField key={path.join('.')} label={k} value={v}
            onChange={(v === null || typeof v !== 'object') && !isUrl(String(v ?? '')) ? (val) => onFieldChange(path, val) : undefined}
            linkUrl={k === 'houseBillNo' ? resultObj.hblUrl : k === 'masterBillNo' ? resultObj.mblUrl : undefined}
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
