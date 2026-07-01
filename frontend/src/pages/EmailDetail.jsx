import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { ArrowLeftOutlined, LinkOutlined } from '@ant-design/icons';
import { fetchEmailHtml, fetchEmailResult } from '../api';

function EditableText({ value, onChange, style }) {
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
    <span onDoubleClick={() => { setDraft(value); setEditing(true); }} style={{ ...style, cursor: 'text', display: 'block' }}>
      {value}
    </span>
  );
}

const FIELD_LABEL = {
  agentEmail: '代理邮箱', agentName: '代理名称',
  collectAmountUSD: '到付金额(USD)', collectItem: '到付项目',
  consigneeAddress: '收货人地址', consigneeEmail: '收货人邮箱',
  consigneeName: '收货人', consigneeTel: '收货人电话',
  containerType: '箱型', ctrNumber: '箱号',
  customerType: '客户类型', descriptionOfGoods: '货物描述',
  grossWeight: '毛重', houseBillNo: 'HBL号',
  hblUrl: 'HBL链接', isSuspicious: '是否可疑',
  mark: '唛头', masterBillNo: 'MBL号',
  masterBillNoFromEmail: 'MBL(邮件)', notifyAddress: '通知方地址',
  notifyEmails: '通知方邮箱', notifyName: '通知方',
  notifyTel: '通知方电话', orderType: '单据类型',
  packageUnit: '包装单位', pieces: '件数',
  shipperAddress: '发货人地址', shipperEmail: '发货人邮箱',
  shipperName: '发货人', shipperTel: '发货人电话',
  summary: '备注', volume: '体积(CBM)',
  expenseAmount: '费用金额',
  expenseName: '费用名称', handlingFee: '操作费',
};

const FIELD_ORDER = [
  'masterBillNo', 'houseBillNo',
  'consigneeEmail', 'consigneeName', 'consigneeAddress',
  'notifyName', 'notifyAddress',
  'shipperName', 'shipperAddress',
  'descriptionOfGoods', 'mark', 'pieces', 'packageUnit', 'grossWeight', 'volume', 'containerType',
  'expenseItem', 'expenseAmount', 'expenseName', 'handlingFee',
];

const flattenValue = (val) => {
  if (Array.isArray(val)) {
    return val.flatMap((item) =>
      item && typeof item === 'object' ? Object.entries(item) : []
    );
  }
  if (val && typeof val === 'object') {
    return Object.entries(val);
  }
  return [];
};

const sortedEntries = (obj) => {
  const entries = Object.entries(obj);
  const ordered = FIELD_ORDER.flatMap((k) => {
    const found = entries.find(([key]) => key === k);
    if (!found) return [];
    if (k === 'expenseItem') return flattenValue(found[1]);
    return [found];
  });
  const rest = entries.filter(([k]) => !FIELD_ORDER.includes(k));
  return [...ordered, ...rest];
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

  if (display === null) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
        <span style={{ width: 90, flexShrink: 0, fontWeight: 700, color: '#1a1a1a', fontSize: 13 }}>{friendlyLabel}</span>
        <span style={{ color: '#ccc', fontSize: 13 }}>—</span>
      </div>
    );
  }

  if (typeof display === 'object') {
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: 13, marginBottom: 4 }}>{friendlyLabel}</div>
        <div style={{ paddingLeft: 8, borderLeft: '2px solid #e8e8e8' }}>
          {Object.entries(display).map(([k, v]) => (
            <ResultField key={k} label={k} value={v} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'flex-start' }}>
      <span style={{ width: 90, flexShrink: 0, fontWeight: 700, color: '#1a1a1a', fontSize: 13, paddingTop: 1 }}>{friendlyLabel}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
        {isUrl(display) ? (
          <a href={display} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#1677ff' }}>
            <LinkOutlined /> 查看链接
          </a>
        ) : onChange ? (
          <EditableText value={display} onChange={onChange} style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff', flex: 1 }} />
        ) : (
          <span style={{ fontSize: 13, wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: '#1677ff' }}>{display}</span>
        )}
        {linkUrl && (
          <a href={linkUrl} target="_blank" rel="noreferrer" title="查看文件" style={{ color: '#1677ff', flexShrink: 0 }}>
            <LinkOutlined />
          </a>
        )}
      </span>
    </div>
  );
}

export default function EmailDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const orderingId = searchParams.get('ordering_id');
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from ?? '/email';
  const subject = location.state?.subject ?? '';

  const [html, setHtml] = useState('');
  const [htmlLoading, setHtmlLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [visible, setVisible] = useState(false);
  const iframeRef = useRef(null);

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
  const [activeIdx, setActiveIdx] = useState(0);

  const onFieldChange = (key, val) => {
    setResult((prev) => {
      if (Array.isArray(prev)) return [{ ...(prev[0] ?? {}), [key]: val }, ...prev.slice(1)];
      return { ...prev, [key]: val };
    });
  };

  const resultObj = result ? (Array.isArray(result) ? result[0] ?? {} : result) : null;

  useEffect(() => {
    fetchEmailHtml(id)
      .then((res) => {
        if (res?.code === 200) {
          const htmlContent = res.data.html_content;
          if (Array.isArray(htmlContent)) {
            let htmlStr = htmlContent[0] || '';
            const inlineImages = htmlContent[1] || [];
            inlineImages.forEach((att) => {
              if (att.content_id && att.oss_url) {
                const cid = att.content_id.replace(/^<|>$/g, '');
                htmlStr = htmlStr.split(`cid:${cid}`).join(att.oss_url);
              }
            });
            setHtml(makeHtmlReadable(htmlStr));
          } else {
            setHtml(makeHtmlReadable(htmlContent || ''));
          }
        }
      })
      .finally(() => setHtmlLoading(false));

    if (orderingId) {
      setResultLoading(true);
      fetchEmailResult(orderingId)
        .then((res) => {
          if (res?.code === 200) {
            setResult(res.data.result);
            setAttachments(res.data.attachments?.attachments ?? []);
          }
        })
        .finally(() => setResultLoading(false));
    }
  }, [id, orderingId]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', zIndex: 100, transform: visible ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s ease' }}>
      <div style={{ padding: '8px 16px', borderBottom: '2px solid #d0d0d0', flexShrink: 0 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 第一列：附件列表（直接内嵌展示内容） */}
      <div style={{ width: '50%', flexShrink: 0, borderRight: '2px solid #d0d0d0', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 14px' }}>
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

      {/* 第二列：邮件预览 */}
      <div style={{ width: '20%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '2px solid #d0d0d0' }}>
        <div style={{ padding: '12px 14px', flexShrink: 0, borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>邮件主题</div>
          {subject ? (
            <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.6, wordBreak: 'break-all', fontWeight: 500 }}>{subject}</div>
          ) : (
            <div style={{ fontSize: 13, color: '#ccc' }}>—</div>
          )}
        </div>
        <div style={{ padding: '8px 14px 4px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>邮件内容</div>
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
              srcDoc={`<style>
                ::-webkit-scrollbar{display:none}
                html,body{scrollbar-width:none;-ms-overflow-style:none;font-size:24px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;word-break:break-word}
                img{max-width:100%;height:auto}
                table{max-width:100%}
              </style>${html || '<p style="color:#aaa;padding:24px">无 HTML 内容</p>'}`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-same-origin"
              onLoad={handleEmailLoad}
            />
          )}
        </div>
      </div>

      {/* 第三列：解析信息 */}
      <div className="scrollbar-hidden" style={{ width: '30%', flexShrink: 0, padding: '16px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>解析信息</div>
        {resultLoading ? (
          <Spin size="small" />
        ) : resultObj ? (
          sortedEntries(resultObj).map(([k, v]) => (
            <ResultField key={k} label={k} value={v}
              onChange={typeof v !== 'object' && !isUrl(String(v ?? '')) ? (val) => onFieldChange(k, val) : undefined}
              linkUrl={k === 'houseBillNo' ? resultObj.hblUrl : k === 'masterBillNo' ? resultObj.mblUrl : undefined}
            />
          ))
        ) : (
          <div style={{ color: '#aaa', fontSize: 12 }}>
            {orderingId ? '暂无解析结果' : '无 ordering_id'}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
