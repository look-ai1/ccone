# 省多多 MVP

这是按需求方案搭建的省多多首版工程骨架，重点落地多租户、PWA 点餐、后台确认下单、FIFO 批次库存、退菜回补、毛利报表和超管门店管理。

## 技术结构

- `apps/web`: Next.js 后台与平板 PWA 页面骨架
- `apps/api`: NestJS API 骨架，包含租户上下文、订单、进货、报表示例接口
- `packages/core`: 金额、重量、FIFO 库存、退菜、报表等可测试领域逻辑
- `packages/database`: Prisma/PostgreSQL schema，金额单位为元并使用 `Decimal`

## 关键规则

- 金额统一按“元”，使用 `DECIMAL`/`Decimal`，接口建议返回字符串。
- 重量统一按克入库计算，界面可显示斤。
- 确认下单时才扣库存；点餐草稿不扣库存。
- 退菜分未制作和已制作，未制作必须按原消耗批次回补。
- 主门店和子门店都是独立 `store`，业务表必须带 `store_id`。

## 常用命令

```bash
npm install
npm run db:up
npm run db:setup
npm test
npm run typecheck
npm run dev
npm run dev:api
```

## 登录与数据库

本地入口：

- 超管端：`http://127.0.0.1:3000/super-admin`
- 门店后台端：`http://127.0.0.1:3000/admin`
- 平板点餐端：`http://127.0.0.1:3000/tablet`
- 后端 API：`http://127.0.0.1:4000/api`

真实持久化依赖 PostgreSQL。先启动 Docker Desktop，再执行：

```bash
npm run db:up
npm run db:setup
```

种子账号：

- 超管、门店管理员、服务员的账号密码见 `packages/database/prisma/seed.ts`，不在文档中记录。

没有完成数据库迁移和 seed 前，API 会降级到本地内存演示数据；这只能用于开发预览，不能作为验收生产数据。

## 当前边界

首版代码把核心风险逻辑写成可测试领域层，并提供 API/UI 骨架。OCR、真实打印客户端、对象存储上传、生产数据库备份和正式部署需要在后续接入具体供应商配置。
