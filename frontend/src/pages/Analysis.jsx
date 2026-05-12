import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarOutlined,
  DownOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import {
  fetchAnalyzeSummaryDetail,
  fetchAnalyzeSummaryList,
} from "../api";

const VIEW_TABS = [
  { label: "每日", api: "daily" },
  { label: "每周", api: "weekly" },
  { label: "每月", api: "monthly" },
];

const PAGE_SIZE = 15;

export default function Analysis() {
  const [viewLabel, setViewLabel] = useState("每日");
  const apiView = useMemo(
    () => VIEW_TABS.find((t) => t.label === viewLabel)?.api || "daily",
    [viewLabel]
  );

  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExists, setDetailExists] = useState(false);
  const [detailContent, setDetailContent] = useState("");
  const [detailNote, setDetailNote] = useState("");

  const contentRefs = useRef({});

  const loadList = useCallback(async () => {
    setListLoading(true);
    setSelectedKey("");
    setDetailContent("");
    setDetailExists(false);
    setDetailNote("");
    setVisibleCount(PAGE_SIZE);
    try {
      const res = await fetchAnalyzeSummaryList(apiView);
      if (res.success) {
        const list = res.items || [];
        setItems(list);
        if (list.length > 0) {
          setSelectedKey(list[0].key);
        }
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [apiView]);

  useEffect(() => {
    loadList();
    window.scrollTo(0, 0);
  }, [loadList]);

  useEffect(() => {
    if (!selectedKey) {
      setDetailContent("");
      setDetailExists(false);
      setDetailNote("");
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchAnalyzeSummaryDetail(apiView, selectedKey)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setDetailExists(!!res.exists);
          setDetailContent(res.content || "");
          setDetailNote(res.message || "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailExists(false);
          setDetailContent("");
          setDetailNote("加载失败，请稍后重试");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiView, selectedKey]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );

  const scrollToSection = (key) => {
    contentRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleTabChange = (label) => {
    setViewLabel(label);
    window.scrollTo(0, 0);
  };

  const sidebarTitle = useMemo(() => {
    if (viewLabel === "每日") return "按业务日";
    if (viewLabel === "每周") return "按周六截止";
    return "按自然月";
  }, [viewLabel]);

  return (
    <div className="page-shell analyze-page">
      <div className="analyze-journal-wrap">
        <div className="analyze-journal-tabs">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={
                viewLabel === tab.label
                  ? "analyze-tab analyze-tab-active"
                  : "analyze-tab"
              }
              onClick={() => handleTabChange(tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="analyze-journal-body">
          <aside className="analyze-journal-sidebar">
            {listLoading ? (
              <div className="analyze-sidebar-empty">加载列表…</div>
            ) : visibleItems.length === 0 ? (
              <div className="analyze-sidebar-empty">
                暂无已生成的总结。定时任务运行后会出现在此处。
              </div>
            ) : (
              <div className="analyze-sidebar-list">
                {visibleItems.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    className={
                      selectedKey === row.key
                        ? "analyze-sidebar-item analyze-sidebar-item-active"
                        : "analyze-sidebar-item"
                    }
                    onClick={() => {
                      setSelectedKey(row.key);
                      scrollToSection(row.key);
                    }}
                  >
                    <span className="analyze-sidebar-hash">#</span>
                    <span className="analyze-sidebar-title">{row.title}</span>
                  </button>
                ))}
                {visibleCount < items.length && (
                  <button
                    type="button"
                    className="analyze-load-more"
                    onClick={() =>
                      setVisibleCount((n) => n + PAGE_SIZE)
                    }
                  >
                    <span>显示更多</span>
                    <DownOutlined />
                  </button>
                )}
              </div>
            )}
          </aside>

          <main className="analyze-journal-main">
            <div className="analyze-main-inner">
              {!selectedKey && !listLoading ? (
                <div className="analyze-placeholder">
                  <QuestionCircleOutlined className="analyze-placeholder-icon" />
                  <p>请选择左侧一期总结，或等待定时任务生成。</p>
                </div>
              ) : (
                <article
                  className="analyze-article"
                  ref={(el) => {
                    contentRefs.current[selectedKey] = el;
                  }}
                >
                  <div className="analyze-article-head">
                    <div className="analyze-article-icon">
                      <CalendarOutlined />
                    </div>
                    <h2 className="analyze-article-title">
                      {items.find((i) => i.key === selectedKey)?.title ||
                        selectedKey}
                    </h2>
                  </div>

                  <div className="analyze-article-card">
                    {detailLoading ? (
                      <p className="analyze-muted">加载中…</p>
                    ) : !detailExists ? (
                      <div className="analyze-placeholder analyze-placeholder-inline">
                        <p>
                          {detailNote ||
                            "该期尚未生成总结（Cron 尚未写入或无符合条件的日报）。"}
                        </p>
                      </div>
                    ) : (
                      <div className="analysis-markdown analyze-summary-markdown">
                        <ReactMarkdown>{detailContent}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </article>
              )}
            </div>
          </main>
        </div>
      </div>
      <div className="analyze-journal-stack" aria-hidden />
    </div>
  );
}
