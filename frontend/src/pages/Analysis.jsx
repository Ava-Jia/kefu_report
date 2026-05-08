import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ThunderboltOutlined,
  TeamOutlined,
  CalendarOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import ReactMarkdown from "react-markdown";
import { analyzeReports, fetchReports } from "../api";

const { RangePicker } = DatePicker;
const { Title, Text, Paragraph } = Typography;

export default function Analysis() {
  const [staffOptions, setStaffOptions] = useState([]);
  const [names, setNames] = useState([]);
  const [range, setRange] = useState(() => [
    dayjs().subtract(7, "day"),
    dayjs(),
  ]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState("");
  const [fromCache, setFromCache] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const res = await fetchReports();
      if (res.success) {
        const list = res.reports || [];
        const uniq = [...new Set(list.map((r) => r.name).filter(Boolean))];
        uniq.sort();
        setStaffOptions(uniq.map((n) => ({ label: n, value: n })));
      }
    } catch (e) {
      message.warning(e?.message || "加载客服列表失败");
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const hint = useMemo(() => {
    if (!names?.length) return "全部人员";
    return `已选择 ${names.length} 人`;
  }, [names]);

  const runAnalyze = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      if (!range || range.length !== 2 || !range[0] || !range[1]) {
        if (!silent) message.warning("请选择日期范围");
        return;
      }
      const start_date = range[0].format("YYYY-MM-DD");
      const end_date = range[1].format("YYYY-MM-DD");
      setAnalyzing(true);
      setFromCache(false);
      setResult("");
      try {
        const payload = {
          names: names && names.length > 0 ? names : [],
          start_date,
          end_date,
        };
        const res = await analyzeReports(payload);
        if (res.success) {
          setResult(res.analysis || "");
          setFromCache(!!res.cached);
          if (!silent) {
            message.success(
              res.cached ? "已加载已保存的分析报告（未重新调用 AI）" : "分析完成"
            );
          }
        } else {
          message.error(res.message || "分析失败");
        }
      } catch (e) {
        message.error(e?.response?.data?.message || e.message || "分析失败");
      } finally {
        setAnalyzing(false);
      }
    },
    [names, range]
  );

  const runAnalyzeRef = useRef(runAnalyze);
  runAnalyzeRef.current = runAnalyze;

  /** 选中「单一客服 + 单日」时自动拉取分析（优先命中本地缓存，无需再点按钮） */
  useEffect(() => {
    const singleDay =
      range?.length === 2 &&
      range[0] &&
      range[1] &&
      range[0].isSame(range[1], "day");
    if (!singleDay || names?.length !== 1) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      runAnalyzeRef.current({ silent: true });
    }, 480);
    return () => window.clearTimeout(id);
  }, [names, range]);

  const onAnalyzeClick = () => {
    runAnalyze({ silent: false });
  };

  return (
    <div className="page-shell">
      <div className="page-header-block">
        <div>
          <Title level={3} className="page-title" style={{ marginBottom: 4 }}>
            日报分析
          </Title>
          <Space size="small" wrap>
            <Text type="secondary">基于客服日报生成洞察；相同筛选条件会优先读取已保存报告</Text>
            <Tag color="processing">{hint}</Tag>
          </Space>
        </div>
      </div>

      <Card className="page-card filter-card" variant="borderless">
        <Row gutter={[24, 16]} align="bottom">
          <Col xs={24} md={10} lg={9}>
            <div className="filter-label">
              <TeamOutlined /> 客服人员
            </div>
            <Select
              mode="multiple"
              allowClear
              placeholder="不选 = 全部人员；可选多人"
              style={{ width: "100%" }}
              options={staffOptions}
              loading={loadingStaff}
              value={names}
              onChange={setNames}
              maxTagCount="responsive"
              size="large"
            />
          </Col>
          <Col xs={24} md={10} lg={9}>
            <div className="filter-label">
              <CalendarOutlined /> 日期范围
            </div>
            <RangePicker
              value={range}
              onChange={(v) => setRange(v || [])}
              format="YYYY-MM-DD"
              style={{ width: "100%" }}
              size="large"
            />
          </Col>
          <Col xs={24} md={4} lg={6}>
            <Button
              type="primary"
              size="large"
              block
              icon={<ThunderboltOutlined />}
              onClick={onAnalyzeClick}
              loading={analyzing}
            >
              开始分析
            </Button>
          </Col>
        </Row>
        <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          单日分析请将起止设为同一天。
        </Paragraph>
      </Card>

      <Card
        className="page-card result-card"
        variant="borderless"
        title={
          <Space>
            <span className="result-card-title">分析结果</span>
            {analyzing && <Tag color="processing">生成中</Tag>}
            {!analyzing && fromCache && result && (
              <Tag icon={<HistoryOutlined />} color="success">
                已保存的报告
              </Tag>
            )}
          </Space>
        }
      >
        <Spin spinning={analyzing} tip="正在调用 AI，请稍候…">
          {result ? (
            <div className="analysis-markdown analysis-markdown-panel">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          ) : (
            <div className="analysis-placeholder">
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {analyzing
                  ? "模型正在阅读日报并生成结构化结论…"
                  : "设置筛选条件后点击「开始分析」，或选择「单一客服 + 单日」自动展示"}
              </Paragraph>
            </div>
          )}
        </Spin>
      </Card>
    </div>
  );
}
