import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarOutlined,
  DownOutlined,
  QuestionCircleOutlined,
  LoadingOutlined,
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

const PAGE_SIZE = 30;

export default function Analysis() {
  const [viewLabel, setViewLabel] = useState("每日");
  const apiView = useMemo(
    () => VIEW_TABS.find((t) => t.label === viewLabel)?.api || "daily",
    [viewLabel]
  );

  const [items, setItems] = useState([]); 
  const [listLoading, setListLoading] = useState(false);
  const [activeKey, setActiveKey] = useState(""); 
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailsMap, setDetailsMap] = useState({});

  const contentRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const isClickScrolling = useRef(false); // 记录是否是点击触发的滚动

  // 1. 加载列表
  const loadList = useCallback(async () => {
    setListLoading(true);
    setItems([]);
    setDetailsMap({});
    setVisibleCount(PAGE_SIZE);
    try {
      const res = await fetchAnalyzeSummaryList(apiView);
      if (res.success) {
        const list = res.items || [];
        setItems(list);
        if (list.length > 0) setActiveKey(list[0].key);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, [apiView]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // 2. 并行加载详情
  useEffect(() => {
    visibleItems.forEach((item) => {
      if (detailsMap[item.key]) return;
      setDetailsMap(prev => ({ ...prev, [item.key]: { loading: true } }));

      fetchAnalyzeSummaryDetail(apiView, item.key).then((res) => {
        setDetailsMap(prev => ({
          ...prev,
          [item.key]: {
            loading: false,
            exists: !!res.exists,
            content: res.content || "",
            note: res.message || "暂无数据"
          },
        }));
      });
    });
  }, [visibleItems, apiView]);

  // 3. 核心功能：滚动联动左侧高亮 (IntersectionObserver)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // 如果是点击触发的平滑滚动，暂时不通过监听器改变 activeKey，防止抖动
        if (isClickScrolling.current) return;

        entries.forEach((entry) => {
          // 当区块进入视口上部区域时（见 rootMargin 设定）
          if (entry.isIntersecting) {
            setActiveKey(entry.target.getAttribute("data-key"));
          }
        });
      },
      {
        root: scrollContainerRef.current,
        // rootMargin 格式: 上 右 下 左
        // "-10% 0px -70% 0px" 表示只探测容器顶端下 10% 到 30% 的这一窄条区域
        // 这样可以保证滚动到顶部的项被精准激活
        rootMargin: "-15% 0px -80% 0px",
        threshold: 0,
      }
    );

    // 观察所有内容块
    const elements = document.querySelectorAll(".analyze-article-item");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [visibleItems]); // 当加载更多项时重新绑定观察

  // 4. 点击左侧跳转
  const scrollToSection = (key) => {
    isClickScrolling.current = true;
    setActiveKey(key);
    
    const target = contentRefs.current[key];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // 1秒后解除锁定，恢复滚动监听逻辑
    setTimeout(() => {
      isClickScrolling.current = false;
    }, 1000);
  };

  return (
    <div className="page-shell analyze-page">
      <div className="analyze-journal-wrap">
        {/* 顶部 Tab */}
        <div className="analyze-journal-tabs">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.label}
              className={`analyze-tab ${viewLabel === tab.label ? "analyze-tab-active" : ""}`}
              onClick={() => setViewLabel(tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="analyze-journal-body">
          {/* 左侧导航：固定不动 */}
          <aside className="analyze-journal-sidebar">
            <div className="analyze-sidebar-list">
              {listLoading ? (
                <div className="p-4 text-stone-400">加载中...</div>
              ) : (
                <>
                  {visibleItems.map((row) => (
                    <button
                      key={row.key}
                      className={`analyze-sidebar-item ${activeKey === row.key ? "analyze-sidebar-item-active" : ""}`}
                      onClick={() => scrollToSection(row.key)}
                    >
                      <span className="analyze-sidebar-hash">#</span>
                      <span className="analyze-sidebar-title">{row.title}</span>
                    </button>
                  ))}
                  {visibleCount < items.length && (
                    <button 
                      className="analyze-load-more" 
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    >
                      加载更多 <DownOutlined />
                    </button>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* 右侧主栏：滚动流 */}
          <main 
            className="analyze-journal-main scroll-smooth" 
            ref={scrollContainerRef}
            style={{ overflowY: 'auto', position: 'relative' }}
          >
            <div className="analyze-main-inner" style={{ paddingBottom: '20vh' }}>
              {visibleItems.map((item) => {
                const detail = detailsMap[item.key] || {};
                return (
                  <article
                    key={item.key}
                    data-key={item.key}
                    ref={(el) => (contentRefs.current[item.key] = el)}
                    /* 增加区块间距：mb-24 (96px) 让块与块之间呼吸感更强 */
                    className="analyze-article-item mb-24 last:mb-0 transition-opacity duration-500"
                  >
                    {/* 日期标题栏 */}
                    <div className="analyze-article-head flex items-center gap-3 mb-4 mt-4">
                      <div className="analyze-article-icon text-blue-500">
                        <CalendarOutlined />
                      </div>
                      <h2 className="analyze-article-title text-xl font-bold">
                        {item.title}
                      </h2>
                    </div>

                    {/* 内容卡片 */}
                    <div className="analyze-article-card bg-white p-8 rounded-2xl border border-stone-100 shadow-sm min-h-[300px]">
                      {detail.loading ? (
                        <div className="py-10 text-stone-400 flex items-center gap-2">
                          <LoadingOutlined /> 加载详情中...
                        </div>
                      ) : !detail.exists ? (
                        <div className="py-10 text-stone-300 italic">{detail.note}</div>
                      ) : (
                        <div className="analysis-markdown analyze-summary-markdown leading-relaxed">
                          <ReactMarkdown>{detail.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        </div>
      </div>
      {/* 视觉堆叠效果 */}
      <div className="analyze-journal-stack" />
    </div>
  );
}