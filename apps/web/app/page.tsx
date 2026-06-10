import { ClipboardList, MonitorCog, ShieldCheck } from "lucide-react";
import Link from "next/link";

const portals = [
  {
    href: "/super-admin",
    title: "超管端",
    subtitle: "总控制台",
    color: "blue",
    icon: ShieldCheck,
    items: ["门店开通", "子门店审批", "租户隔离监控", "系统配置"]
  },
  {
    href: "/admin",
    title: "门店后台管理端",
    subtitle: "运营后台",
    color: "green",
    icon: MonitorCog,
    items: ["订单管理", "菜品管理", "进货入库", "毛利报表"]
  },
  {
    href: "/tablet",
    title: "点餐 App",
    subtitle: "平板端",
    color: "orange",
    icon: ClipboardList,
    items: ["菜品图片", "价格展示", "购物车", "提交点餐单"]
  }
];

export default function HomePage() {
  return (
    <main className="portal-shell compact">
      <h1 className="portal-title green">省多多 <span>SaaS 三端工作台</span></h1>
      <section className="board admin">
        {portals.map((portal) => {
          const Icon = portal.icon;
          return (
            <Link className="panel" href={portal.href} key={portal.href}>
              <div className={`portal-title ${portal.color}`} style={{ borderRadius: 0, margin: 0, width: "100%" }}>
                <Icon size={22} /> {portal.title} <span>{portal.subtitle}</span>
              </div>
              <div className="panel-pad">
                <div className="metrics" style={{ gridTemplateColumns: "1fr 1fr", padding: 0 }}>
                  {portal.items.map((item) => (
                    <div className="metric" key={item}>
                      <span>模块</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
