import { Layout, Menu, theme } from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  LineChartOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ReportForm from "./pages/ReportForm.jsx";
import Analysis from "./pages/Analysis.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import CompanySearch from "./pages/Company.jsx";
import WechatBotKnowledge from "./pages/WechatBotKnowledge.jsx";
import Email from "./pages/Email.jsx";

const { Sider, Content } = Layout;

function SideMenu() {
  const location = useLocation();
  const selected = location.pathname.startsWith("/knowledge")
    ? ["/knowledge"]
    : location.pathname.startsWith("/analyze")
      ? ["/analyze"]
      : location.pathname.startsWith("/wechat-bot-knowledge")
        ? ["/wechat-bot-knowledge"]
        : location.pathname.startsWith("/company-search")
          ? ["/company-search"]
          : location.pathname.startsWith("/email")
          ? ["/email"]
          : ["/"];

  const menuItems = [
    {
      key: "/",
      icon: <FileTextOutlined />,
      label: <Link to="/">日报管理</Link>,
    },
    {
      key: "/analyze",
      icon: <LineChartOutlined />,
      label: <Link to="/analyze">问题总结</Link>,
    },
    {
      key: "/knowledge",
      icon: <BookOutlined />,
      label: <Link to="/knowledge">知识库</Link>,
    },
    {
      key: "/company-search",
      icon: <BookOutlined />,
      label: <Link to="/company-search">公司检索</Link>,
    },
    {
      key: "/wechat-bot-knowledge",
      icon: <BookOutlined />,
      label: <Link to="/wechat-bot-knowledge">Wechat Bot 知识库</Link>,
    },
    {
      key: "/email",
      icon: <BookOutlined />,
      label: <Link to="/email">email管理</Link>,
    }
  ];

  return (
    <>
      <div className="app-sider-brand">
        <div className="app-sider-brand-icon">
          <RobotOutlined />
        </div>
        <div className="app-sider-brand-text">
          <span className="app-sider-title">客服日报</span>
          <span className="app-sider-sub">AI 工作台</span>
        </div>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={selected}
        style={{ borderInlineEnd: "none", marginTop: 8 }}
        items={menuItems}
      />
    </>
  );
}

export default function App() {
  const { token } = theme.useToken();
  const location = useLocation();
  const contentClass =
    location.pathname.startsWith("/analyze") ||
    location.pathname.startsWith("/knowledge") ||
    location.pathname.startsWith("/wechat-bot-knowledge")
      ? "app-content app-content--analyze-spread"
      : "app-content";

  return (
    <Layout className="app-root" style={{ minHeight: "100vh" }}>
      <Sider
        className="app-sider"
        width={232}
        breakpoint="lg"
        collapsedWidth={0}
        theme="dark"
      >
        <SideMenu />
      </Sider>
      <Layout className="app-main" style={{ background: token.colorBgLayout }}>
        <Content className={contentClass}>
          <Routes>
            <Route path="/" element={<ReportForm />} />
            <Route path="/analyze" element={<Analysis />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/company-search" element={<CompanySearch />} />
            <Route path="/wechat-bot-knowledge" element={<WechatBotKnowledge />} />
            <Route path="/email" element={<Email />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
