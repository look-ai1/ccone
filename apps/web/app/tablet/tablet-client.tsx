"use client";

import { Check, Minus, Plus, Search, Send, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

const dishes = [
  { id: "dish_pork", category: "热菜", name: "水煮牛肉", priceYuan: "38.00", imageUrl: "/dishes/pork.svg" },
  { id: "dish_egg", category: "热菜", name: "宫保鸡丁", priceYuan: "28.00", imageUrl: "/dishes/egg.svg" },
  { id: "dish_soup", category: "汤类", name: "紫菜蛋花汤", priceYuan: "12.00", imageUrl: "/dishes/soup.svg" }
];

const history = [
  { no: "DD202405180001", amount: "178.00", status: "待确认", time: "2024-05-18 10:30" },
  { no: "DD202405180000", amount: "236.00", status: "已下单", time: "2024-05-18 09:50" },
  { no: "DD202405170098", amount: "128.00", status: "已取消", time: "2024-05-17 21:30" }
];

type Cart = Record<string, number>;

function yuanToCents(value: string) {
  const [yuan = "0", cents = "0"] = value.split(".");
  return BigInt(yuan) * 100n + BigInt((cents + "00").slice(0, 2));
}

function centsToYuan(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export default function TabletClient() {
  const [cart, setCart] = useState<Cart>({ dish_pork: 2, dish_egg: 1 });
  const [tableNo, setTableNo] = useState("A03");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [lastOrderNo, setLastOrderNo] = useState("");
  const [lastTotal, setLastTotal] = useState("");

  const cartItems = dishes.filter((dish) => cart[dish.id]);
  const total = useMemo(
    () => centsToYuan(dishes.reduce((sum, dish) => sum + yuanToCents(dish.priceYuan) * BigInt(cart[dish.id] ?? 0), 0n)),
    [cart]
  );

  function changeQty(id: string, delta: number) {
    setMessage("");
    setCart((current) => {
      const nextQty = Math.max(0, (current[id] ?? 0) + delta);
      const next = { ...current };
      if (nextQty === 0) {
        delete next[id];
      } else {
        next[id] = nextQty;
      }
      return next;
    });
  }

  async function submitOrder() {
    if (cartItems.length === 0) {
      setMessage("请先选择菜品");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/tablet/orders/drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-store-id": "store_demo"
        },
        body: JSON.stringify({
          tableNo: tableNo.trim() || undefined,
          items: cartItems.map((dish) => ({ dishId: dish.id, quantity: cart[dish.id] }))
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const draft = (await response.json()) as { id: string; totalYuan: string };
      setLastOrderNo(draft.id);
      setLastTotal(draft.totalYuan);
      setCart({});
      setMessage(`点餐单提交成功，合计 ${draft.totalYuan} 元`);
    } catch {
      setMessage("提交失败，请确认 API 服务已启动");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="portal-shell compact">
      <h1 className="portal-title orange">点餐 App <span>平板端</span></h1>
      <section className="board tablet">
        <div className="stack">
          <section className="phone-frame">
            <div className="phone-top">
              <div className="phone-card">
                <strong>门店登录</strong>
                <input className="input" placeholder="请输入门店账号" />
                <input className="input" placeholder="请输入密码" type="password" />
                <button className="button">登录</button>
                <span className="muted">或扫码绑定设备</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><h2 className="panel-title">菜品详情页</h2></div>
            <img src="/dishes/pork.svg" alt="水煮牛肉" style={{ width: "100%", display: "block" }} />
            <div className="panel-pad">
              <h2 style={{ margin: "0 0 8px" }}>水煮牛肉</h2>
              <div className="price">38.00 元 / 份</div>
              <p className="muted">鲜香麻辣，适合堂食点单。</p>
              <div className="qty-control">
                <button className="qty-btn" type="button"><Minus size={16} /></button><span>2</span><button className="qty-btn" type="button"><Plus size={16} /></button>
              </div>
              <button className="button" style={{ marginTop: 14, width: "100%" }} type="button">加入购物车</button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="tablet-page">
            <div className="tablet-header">
              <strong>汉阳明档点心</strong>
              <div className="input" style={{ alignItems: "center", display: "flex", maxWidth: 260 }}><Search size={16} /> 搜索菜品</div>
              <span className="tag orange">购物车 {cartItems.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "108px 1fr" }}>
              <nav className="category-list">
                {["全部", "热菜", "汤类", "主食", "酒水", "饮料"].map((item, index) => (
                  <button className={index === 1 ? "active" : ""} key={item}>{item}</button>
                ))}
              </nav>
              <div className="menu-grid">
                {dishes.map((dish) => (
                  <article className="menu-card" key={dish.id}>
                    <img src={dish.imageUrl} alt={dish.name} />
                    <div className="menu-card-body">
                      <span className="menu-card-title">{dish.name}</span>
                      <div className="menu-card-footer">
                        <span className="price">{dish.priceYuan} 元</span>
                        <button className="round-add" onClick={() => changeQty(dish.id, 1)} type="button"><Plus size={17} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="cart-bar">
              <strong><ShoppingCart size={18} /> 已点 {cartItems.length} 种</strong>
              <strong className="price">{total} 元</strong>
            </div>
          </section>

          <section className="tablet-page">
            <div className="panel-header">
              <h2 className="panel-title">购物车页</h2>
              <input className="input" value={tableNo} onChange={(event) => setTableNo(event.target.value)} style={{ maxWidth: 140 }} />
            </div>
            <div className="cart-list">
              {cartItems.length === 0 ? <p className="muted">购物车为空</p> : null}
              {cartItems.map((dish) => (
                <div className="cart-item" key={dish.id}>
                  <img className="thumb" src={dish.imageUrl} alt={dish.name} />
                  <div><strong>{dish.name}</strong><div className="price">{dish.priceYuan} 元</div></div>
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => changeQty(dish.id, -1)} type="button"><Minus size={15} /></button>
                    <span>{cart[dish.id]}</span>
                    <button className="qty-btn" onClick={() => changeQty(dish.id, 1)} type="button"><Plus size={15} /></button>
                    <button className="qty-btn" onClick={() => changeQty(dish.id, -(cart[dish.id] ?? 0))} type="button"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-bar">
              <button className="button secondary" onClick={() => setCart({})} type="button">清空</button>
              <strong>合计：<span className="price">{total} 元</span></strong>
              <button className="button" disabled={isSubmitting || cartItems.length === 0} onClick={submitOrder} type="button">
                <Send size={18} /> {isSubmitting ? "提交中" : "提交点餐单"}
              </button>
            </div>
            {message ? <p className={message.includes("失败") ? "form-message error" : "form-message"} style={{ padding: "0 16px 14px" }}>{message}</p> : null}
          </section>
        </div>

        <div className="stack">
          <section className="panel success-card">
            <div className="success-icon"><Check size={46} /></div>
            <h2>点餐单提交成功</h2>
            <p>点餐单号：{lastOrderNo || "DD202405180001"}</p>
            <p>合计金额：{lastOrderNo ? lastTotal : "178.00"} 元</p>
            <button className="button" type="button">返回点餐</button>
          </section>

          <section className="panel">
            <div className="panel-header"><h2 className="panel-title">历史点餐单</h2></div>
            <table className="table">
              <tbody>
                {history.map((item) => (
                  <tr key={item.no}>
                    <td><strong>{item.no}</strong><div className="muted">{item.amount} 元</div></td>
                    <td>{item.time}</td>
                    <td><span className={item.status === "已取消" ? "tag red" : item.status === "已下单" ? "tag green" : "tag orange"}>{item.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </section>
    </main>
  );
}
