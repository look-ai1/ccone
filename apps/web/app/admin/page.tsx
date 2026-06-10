"use client";

import { BarChart3, Boxes, ClipboardList, Download, FileText, Printer, Settings, Utensils } from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

const orders = [
  { no: "DD202405180001", amountYuan: "236.00", table: "A03", status: "已下单" },
  { no: "DD202405180002", amountYuan: "128.00", table: "B01", status: "待下单" },
  { no: "DD202405180003", amountYuan: "89.00", table: "C06", status: "已完成" }
];

const dishes = [
  { name: "水煮牛肉", priceYuan: "38.00", image: "/dishes/pork.svg", on: true },
  { name: "宫保鸡丁", priceYuan: "28.00", image: "/dishes/egg.svg", on: true },
  { name: "鱼香肉丝", priceYuan: "26.00", image: "/dishes/soup.svg", on: true },
  { name: "麻婆豆腐", priceYuan: "22.00", image: "/dishes/egg.svg", on: false }
];

const stockRows = [
  { name: "猪肉", current: "120.50", warn: "20", unit: "克" },
  { name: "青椒", current: "80.00", warn: "10", unit: "克" },
  { name: "鸡蛋", current: "45.20", warn: "10", unit: "克" },
  { name: "豆腐", current: "60.00", warn: "5", unit: "克" }
];

interface LoginUser {
  email: string;
  isSuperAdmin?: boolean;
  memberships: Array<{ storeId: string; role: string }>;
}

interface AdminDashboard {
  store: { id: string; name: string; status: string; contactName?: string | null; phone?: string | null };
  metrics: { todayRevenueYuan: string; todayOrders: number; grossMarginRate: string; stockWarnings: number };
  dishes: Array<{ id: string; name: string; priceYuan: string; imageUrl?: string | null; isAvailable: boolean }>;
  stock: Array<{ ingredientId: string; name: string; remainingGrams: string; unit: string }>;
  orders: Array<{ id: string; tableNo?: string | null; status: string; totalYuan: string; costYuan: string; itemCount: number }>;
  report: { totals: { revenueYuan: string; costYuan: string; grossProfitYuan: string; grossMarginRate: string } };
  printJobs: Array<{ id: string; orderId: string; status: string; attempts: number }>;
}

export default function AdminPage() {
  const [account, setAccount] = useState("admin@shengduoduo.local");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [currentStoreId, setCurrentStoreId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [dashboardMessage, setDashboardMessage] = useState("");

  useEffect(() => {
    let disposed = false;

    async function verifyStoreSession() {
      localStorage.removeItem("shengduoduo_token");
      const token = localStorage.getItem("shengduoduo_admin_token");
      if (!token) {
        if (!disposed) setIsAuthenticated(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const user = (await response.json()) as LoginUser | null;
        const storeId = user?.memberships?.[0]?.storeId;
        if (!user || user.isSuperAdmin || !storeId) {
          throw new Error("Not a store account");
        }
        localStorage.setItem("shengduoduo_admin_store_id", storeId);
        if (!disposed) {
          setCurrentStoreId(storeId);
          setIsAuthenticated(true);
        }
        void loadDashboard(storeId, token);
      } catch {
        localStorage.removeItem("shengduoduo_admin_token");
        localStorage.removeItem("shengduoduo_admin_store_id");
        if (!disposed) {
          setCurrentStoreId("");
          setIsAuthenticated(false);
        }
      }
    }

    void verifyStoreSession();
    return () => {
      disposed = true;
    };
  }, []);

  async function loadDashboard(storeId: string, token = localStorage.getItem("shengduoduo_admin_token") ?? "") {
    if (!storeId || !token) return;
    setDashboardMessage("");
    try {
      const response = await fetch(`${API_BASE}/admin/dashboard`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-store-id": storeId
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setDashboard((await response.json()) as AdminDashboard);
    } catch {
      setDashboard(null);
      setDashboardMessage("门店数据加载失败，当前显示本地占位数据");
    }
  }

  async function login() {
    setIsLoggingIn(true);
    setLoginMessage("");
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account, password })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        token: string;
        user: LoginUser;
      };
      if (result.user.isSuperAdmin) {
        throw new Error("Super admin cannot use store backend");
      }
      const storeId = result.user.memberships[0]?.storeId;
      if (!storeId) {
        throw new Error("No store membership");
      }
      localStorage.removeItem("shengduoduo_token");
      localStorage.setItem("shengduoduo_admin_token", result.token);
      localStorage.setItem("shengduoduo_admin_store_id", storeId);
      setCurrentStoreId(storeId);
      setIsAuthenticated(true);
      await loadDashboard(storeId, result.token);
      setLoginMessage(`登录成功，当前门店：${storeId}`);
    } catch {
      setIsAuthenticated(false);
      setLoginMessage("登录失败：请确认账号密码正确，且这是门店管理员账号");
    } finally {
      setIsLoggingIn(false);
    }
  }

  const metricData = dashboard?.metrics ?? { todayRevenueYuan: "18760.00", todayOrders: 128, grossMarginRate: "68.35", stockWarnings: 23 };
  const visibleDishes = dashboard?.dishes.map((dish) => ({
    name: dish.name,
    priceYuan: dish.priceYuan,
    image: dish.imageUrl ?? "/dishes/pork.svg",
    on: dish.isAvailable
  })) ?? dishes;
  const visibleStockRows = dashboard?.stock.map((item) => ({
    name: item.name,
    current: item.remainingGrams,
    warn: "1000",
    unit: item.unit === "gram" ? "克" : item.unit
  })) ?? stockRows;
  const visibleOrders = dashboard?.orders.map((order) => ({
    no: order.id,
    amountYuan: order.totalYuan,
    table: order.tableNo ?? "-",
    status: order.status
  })) ?? orders;
  const reportTotals = dashboard?.report.totals ?? { revenueYuan: "10760.00", costYuan: "4560.00", grossProfitYuan: "6200.00", grossMarginRate: "33.07" };

  function renderLoginCard() {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title"><ClipboardList size={18} /> 登录页</h2>
        </div>
        <div className="login-card">
          <span className="login-icon green"><Utensils size={22} /></span>
          <h2>门店后台管理系统</h2>
          <p className="muted">{currentStoreId ? `已绑定门店：${currentStoreId}` : "请输入门店管理员账号登录"}</p>
          <input className="input" placeholder="请输入账号" value={account} onChange={(event) => setAccount(event.target.value)} />
          <input className="input" placeholder="请输入密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button" disabled={isLoggingIn} onClick={login} type="button">{isLoggingIn ? "登录中" : "登录"}</button>
          {loginMessage ? <p className={loginMessage.includes("失败") ? "form-message error" : "form-message"}>{loginMessage}</p> : null}
        </div>
      </section>
    );
  }

  if (isAuthenticated === null) {
    return (
      <main className="portal-shell compact">
      <h1 className="portal-title green">门店后台管理端</h1>
      {dashboardMessage ? <p className="form-message error">{dashboardMessage}</p> : null}
      <section className="board admin">
          <div className="stack">
            <section className="panel">
              <h2 className="panel-title">正在检查登录状态</h2>
              <p className="muted">正在确认当前账号是否属于门店后台</p>
            </section>
          </div>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="portal-shell compact">
        <h1 className="portal-title green">门店后台管理端</h1>
        <section className="board admin">
          <div className="stack">
            {renderLoginCard()}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell compact">
      <h1 className="portal-title green">门店后台管理端</h1>
        <section className="board admin">
          <div className="stack">
            {renderLoginCard()}

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><Boxes size={18} /> 原材料管理</h2>
            </div>
            <table className="table">
              <thead>
                <tr><th>原材料名称</th><th>当前库存</th><th>预警库存</th><th>单位</th></tr>
              </thead>
              <tbody>
                {visibleStockRows.map((row) => (
                  <tr key={row.name}><td>{row.name}</td><td>{row.current}</td><td>{row.warn}</td><td>{row.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="side-layout">
              <nav className="sidebar">
                {["首页", "订单", "菜品", "配方", "进货", "库存", "报表"].map((item, index) => (
                  <div className={index === 0 ? "active" : ""} key={item}>{item}</div>
                ))}
              </nav>
              <div>
                <div className="panel-header">
                  <h2 className="panel-title"><BarChart3 size={18} /> 后台首页</h2>
                  <button className="button secondary"><Download size={16} /> 导出</button>
                </div>
                <div className="metrics">
                  <div className="metric good"><span>今日营收</span><strong>{metricData.todayRevenueYuan} 元</strong></div>
                  <div className="metric"><span>今日订单</span><strong>{metricData.todayOrders}</strong></div>
                  <div className="metric good"><span>毛利率</span><strong>{metricData.grossMarginRate}%</strong></div>
                  <div className="metric warn"><span>库存预警</span><strong>{metricData.stockWarnings}</strong></div>
                </div>
                <div className="chart">
                  <svg viewBox="0 0 520 150" aria-label="营收趋势">
                    <polyline fill="none" stroke="#0d8f48" strokeWidth="4" points="10,112 70,98 130,106 190,74 250,88 310,62 370,70 430,42 510,28" />
                    <path d="M10 112 70 98 130 106 190 74 250 88 310 62 370 70 430 42 510 28 V145 H10Z" fill="#e9f8ef" />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><FileText size={18} /> 点餐单管理</h2>
            </div>
            <table className="table">
              <thead><tr><th>单号</th><th>金额</th><th>桌号</th><th>状态</th></tr></thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.no}><td>{order.no}</td><td>{order.amountYuan} 元</td><td>{order.table}</td><td><span className="tag green">{order.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><BarChart3 size={18} /> 数据报表（日/周/月）</h2>
            </div>
            <div className="donut">
              <div className="donut-ring" />
              <div className="legend">
                <strong>{reportTotals.revenueYuan} 元 销售额</strong>
                <span><i style={{ background: "#0d8f48" }} />毛利 {reportTotals.grossProfitYuan} 元</span>
                <span><i style={{ background: "#ff850f" }} />成本 {reportTotals.costYuan} 元</span>
                <span><i style={{ background: "#125ee8" }} />毛利率 {reportTotals.grossMarginRate}%</span>
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><Utensils size={18} /> 菜品管理</h2>
            </div>
            <div className="product-list">
              {visibleDishes.map((dish) => (
                <div className="product-row" key={dish.name}>
                  <img className="thumb" src={dish.image} alt={dish.name} />
                  <div><strong>{dish.name}</strong><div className="price">{dish.priceYuan} 元</div></div>
                  <span className={dish.on ? "switch" : "tag red"}>{dish.on ? "" : "下架"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><Settings size={18} /> 菜品配方管理</h2>
            </div>
            <table className="table">
              <thead><tr><th>原料</th><th>配比(斤)</th><th>成本</th></tr></thead>
              <tbody>
                <tr><td>猪肉</td><td>0.50</td><td>12.00 元/斤</td></tr>
                <tr><td>青椒</td><td>0.20</td><td>12.00 元/斤</td></tr>
                <tr><td>豆腐</td><td>0.30</td><td>12.00 元/斤</td></tr>
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title"><Printer size={18} /> 打印机管理</h2>
            </div>
            <table className="table">
              <tbody>
                <tr><td>后厨打印机1</td><td>QY-001</td><td><span className="tag green">在线</span></td></tr>
                <tr><td>后厨打印机2</td><td>QY-002</td><td><span className="tag red">离线</span></td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </section>
    </main>
  );
}
