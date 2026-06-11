import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { addMoney, buildGrossProfitReport, confirmOrderWithFifo, multiplyMoney, refundOrderItem, yuan2 } from "@restaurant/core";
import type { ConsumptionLine, OrderItemInput, StockBatch } from "@restaurant/core";
import { hashPassword, verifyPassword } from "./security/password.js";

interface StoreRecord {
  id: string;
  parentStoreId?: string;
  name: string;
  contactName?: string;
  phone?: string;
  status: "ACTIVE" | "SUSPENDED";
}

interface DishRecord {
  id: string;
  storeId: string;
  name: string;
  priceYuan: string;
  imageUrl?: string;
  isAvailable: boolean;
  recipeItems: Array<{ ingredientId: string; gramsPerDish: string }>;
}

interface OrderRecord {
  id: string;
  storeId: string;
  status: "DRAFT" | "CONFIRMED" | "PARTIALLY_REFUNDED";
  tableNo?: string;
  items: OrderItemInput[];
  totalYuan: string;
  costYuan: string;
}

interface StoreApplicationRecord {
  id: string;
  requesterStoreId: string;
  requestedName: string;
  applicantName?: string;
  applicantPhone?: string;
  reason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedStoreId?: string;
  createdAt: Date;
  decidedAt?: Date;
}

interface AuditLogRecord {
  id: string;
  storeId?: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId: string;
  payload?: unknown;
  createdAt: Date;
}

interface SystemConfigRecord {
  id: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isSuperAdmin: boolean;
}

interface StoreMemberRecord {
  id: string;
  storeId: string;
  userId: string;
  role: "STORE_ADMIN" | "STAFF";
  permissions: string[];
}

interface StoreAdminCredential {
  storeId: string;
  account: string;
  initialPassword: string;
  adminLoginUrl: string;
  role: "STORE_ADMIN";
}

const STORE_ADMIN_PERMISSIONS = ["auth:read", "store:read", "dish:write", "order:write", "inventory:write", "report:read"];

@Injectable()
export class InMemoryStore {
  private stores: StoreRecord[] = [{ id: "store_demo", name: "川湘轩总店", contactName: "张三", phone: "13800138000", status: "ACTIVE" }];
  private applications: StoreApplicationRecord[] = [
    {
      id: "application_demo_001",
      requesterStoreId: "store_demo",
      requestedName: "川湘轩朝阳分店",
      applicantName: "张三",
      applicantPhone: "13800138101",
      reason: "业务扩张，需要开设新分店",
      status: "PENDING",
      createdAt: new Date("2026-06-09T10:00:00.000Z")
    },
    {
      id: "application_demo_002",
      requesterStoreId: "store_demo",
      requestedName: "川湘轩海淀分店",
      applicantName: "张三",
      applicantPhone: "13800138102",
      reason: "覆盖周边商圈堂食业务",
      status: "PENDING",
      createdAt: new Date("2026-06-09T10:20:00.000Z")
    }
  ];
  private auditLogs: AuditLogRecord[] = [
    {
      id: "audit_demo_001",
      actorId: "system",
      action: "API 健康检查",
      entity: "system",
      entityId: "health",
      payload: { result: "成功" },
      createdAt: new Date()
    }
  ];
  private systemConfigs: SystemConfigRecord[] = [
    {
      id: "config_ocr",
      key: "ocr",
      value: { provider: "豆包 OCR", apiKey: "********", endpoint: "https://ark.cn-beijing.volces.com/api/v3", status: "正常" },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "config_printer",
      key: "printer",
      value: { provider: "飞鹅打印", retryCount: "5", status: "正常" },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "config_permissions",
      key: "permissions",
      value: { storeAdmin: "菜单、库存、订单、报表", waiter: "点餐、订单查看", kitchen: "打印任务、制作状态" },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  private dishes: DishRecord[] = [
    {
      id: "dish_pork",
      storeId: "store_demo",
      name: "青椒肉丝",
      priceYuan: "28.00",
      imageUrl: "/dishes/pork.svg",
      isAvailable: true,
      recipeItems: [
        { ingredientId: "ingredient_pork", gramsPerDish: "250.000" },
        { ingredientId: "ingredient_pepper", gramsPerDish: "80.000" }
      ]
    },
    {
      id: "dish_egg",
      storeId: "store_demo",
      name: "番茄炒蛋",
      priceYuan: "18.00",
      imageUrl: "/dishes/egg.svg",
      isAvailable: true,
      recipeItems: [
        { ingredientId: "ingredient_egg", gramsPerDish: "120.000" },
        { ingredientId: "ingredient_tomato", gramsPerDish: "180.000" }
      ]
    },
    {
      id: "dish_soup",
      storeId: "store_demo",
      name: "紫菜蛋花汤",
      priceYuan: "12.00",
      imageUrl: "/dishes/soup.svg",
      isAvailable: true,
      recipeItems: [
        { ingredientId: "ingredient_egg", gramsPerDish: "40.000" },
        { ingredientId: "ingredient_seaweed", gramsPerDish: "8.000" }
      ]
    }
  ];
  private stockBatches: StockBatch[] = [
    {
      id: "batch_pork_1",
      storeId: "store_demo",
      ingredientId: "ingredient_pork",
      receivedAt: "2026-06-01T00:00:00.000Z",
      initialGrams: "5000.000",
      remainingGrams: "5000.000",
      unitCostYuan: "0.0240"
    },
    {
      id: "batch_pepper_1",
      storeId: "store_demo",
      ingredientId: "ingredient_pepper",
      receivedAt: "2026-06-01T00:00:00.000Z",
      initialGrams: "3000.000",
      remainingGrams: "3000.000",
      unitCostYuan: "0.0100"
    },
    {
      id: "batch_egg_1",
      storeId: "store_demo",
      ingredientId: "ingredient_egg",
      receivedAt: "2026-06-01T00:00:00.000Z",
      initialGrams: "4000.000",
      remainingGrams: "4000.000",
      unitCostYuan: "0.0120"
    },
    {
      id: "batch_tomato_1",
      storeId: "store_demo",
      ingredientId: "ingredient_tomato",
      receivedAt: "2026-06-01T00:00:00.000Z",
      initialGrams: "5000.000",
      remainingGrams: "5000.000",
      unitCostYuan: "0.0080"
    },
    {
      id: "batch_seaweed_1",
      storeId: "store_demo",
      ingredientId: "ingredient_seaweed",
      receivedAt: "2026-06-01T00:00:00.000Z",
      initialGrams: "500.000",
      remainingGrams: "500.000",
      unitCostYuan: "0.0600"
    }
  ];
  private orders: OrderRecord[] = [];
  private consumptions: ConsumptionLine[] = [];
  private printJobs: Array<{ id: string; storeId: string; orderId: string; status: string; payload: unknown; attempts: number }> = [];
  private users: UserRecord[] = [
    {
      id: "user_store_admin_demo",
      email: "admin@shengduoduo.local",
      passwordHash: hashPassword(process.env.SEED_STORE_ADMIN_PASSWORD ?? "change-me-in-env"),
      displayName: "门店管理员",
      isSuperAdmin: false
    }
  ];
  private storeMembers: StoreMemberRecord[] = [
    {
      id: "member_store_admin_demo",
      storeId: "store_demo",
      userId: "user_store_admin_demo",
      role: "STORE_ADMIN",
      permissions: STORE_ADMIN_PERMISSIONS
    }
  ];

  listStores() {
    return this.stores;
  }

  stats() {
    return {
      totalStores: this.stores.length,
      activeStores: this.stores.filter((store) => store.status === "ACTIVE").length,
      suspendedStores: this.stores.filter((store) => store.status === "SUSPENDED").length,
      pendingApplications: this.applications.filter((application) => application.status === "PENDING").length,
      approvedApplications: this.applications.filter((application) => application.status === "APPROVED").length,
      rejectedApplications: this.applications.filter((application) => application.status === "REJECTED").length
    };
  }

  createStore(name: string, parentStoreId?: string, input?: { contactName?: string; phone?: string }) {
    const store = { id: `store_${Date.now()}`, parentStoreId, name, contactName: input?.contactName, phone: input?.phone, status: "ACTIVE" as const };
    this.stores.push(store);
    return store;
  }

  createStoreWithAdmin(name: string, parentStoreId?: string, input?: { contactName?: string; phone?: string; initialPassword?: string }) {
    const store = this.createStore(name, parentStoreId, input);
    const credential = this.createOrResetStoreAdmin(store.id, {
      account: this.buildAdminAccount(input?.phone, store.id),
      displayName: input?.contactName ?? `${name}管理员`,
      initialPassword: input?.initialPassword
    });
    return { store, adminCredential: credential };
  }

  updateStore(id: string, input: { name?: string; contactName?: string; phone?: string; status?: "ACTIVE" | "SUSPENDED" }) {
    const store = this.stores.find((candidate) => candidate.id === id);
    if (!store) throw new NotFoundException("Store not found");
    if (input.name !== undefined) store.name = input.name;
    if (input.contactName !== undefined) store.contactName = input.contactName;
    if (input.phone !== undefined) store.phone = input.phone;
    if (input.status !== undefined) store.status = input.status;
    return store;
  }

  suspendStore(id: string) {
    return this.updateStore(id, { status: "SUSPENDED" });
  }

  listApplications() {
    return this.applications.map((application) => ({
      ...application,
      requesterStore: this.stores.find((store) => store.id === application.requesterStoreId)
    }));
  }

  applySubStore(storeId: string, requestedName: string, input?: { applicantName?: string; applicantPhone?: string; reason?: string }) {
    const application: StoreApplicationRecord = {
      id: `application_${Date.now()}`,
      requesterStoreId: storeId,
      requestedName,
      applicantName: input?.applicantName,
      applicantPhone: input?.applicantPhone,
      reason: input?.reason,
      status: "PENDING",
      createdAt: new Date()
    };
    this.applications.push(application);
    return application;
  }

  approveApplication(id: string) {
    const application = this.applications.find((candidate) => candidate.id === id);
    if (!application) throw new NotFoundException("Application not found");
    if (application.status !== "PENDING") throw new NotFoundException("Application already decided");
    application.status = "APPROVED";
    application.decidedAt = new Date();
    const { store, adminCredential } = this.createStoreWithAdmin(application.requestedName, application.requesterStoreId, {
      contactName: application.applicantName,
      phone: application.applicantPhone ?? "待补充"
    });
    application.approvedStoreId = store.id;
    return { application, store, adminCredential };
  }

  rejectApplication(id: string) {
    const application = this.applications.find((candidate) => candidate.id === id);
    if (!application) throw new NotFoundException("Application not found");
    if (application.status !== "PENDING") throw new NotFoundException("Application already decided");
    application.status = "REJECTED";
    application.decidedAt = new Date();
    return application;
  }

  addAudit(input: { storeId?: string; actorId?: string; action: string; entity: string; entityId: string; payload?: unknown }) {
    const log: AuditLogRecord = {
      id: `audit_${Date.now()}`,
      storeId: input.storeId,
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      payload: input.payload,
      createdAt: new Date()
    };
    this.auditLogs.unshift(log);
    return log;
  }

  listAuditLogs() {
    return this.auditLogs;
  }

  listSystemConfigs() {
    return this.systemConfigs;
  }

  updateSystemConfig(key: string, value: unknown) {
    const current = this.systemConfigs.find((config) => config.key === key);
    if (current) {
      current.value = value;
      current.updatedAt = new Date();
      return current;
    }
    const created = { id: `config_${Date.now()}`, key, value, createdAt: new Date(), updatedAt: new Date() };
    this.systemConfigs.push(created);
    return created;
  }

  createOrResetStoreAdmin(storeId: string, input: { account?: string; displayName?: string; initialPassword?: string }): StoreAdminCredential {
    const store = this.stores.find((candidate) => candidate.id === storeId);
    if (!store) throw new NotFoundException("Store not found");
    const initialPassword = input.initialPassword ?? this.generateInitialPassword();
    const account = input.account ?? this.buildAdminAccount(store.phone, store.id);
    let user = this.users.find((candidate) => candidate.email === account);
    if (!user) {
      user = {
        id: `user_${Date.now()}_${this.users.length}`,
        email: account,
        passwordHash: hashPassword(initialPassword),
        displayName: input.displayName ?? store.contactName ?? `${store.name}管理员`,
        isSuperAdmin: false
      };
      this.users.push(user);
    } else {
      user.passwordHash = hashPassword(initialPassword);
      user.displayName = input.displayName ?? user.displayName;
    }

    const exists = this.storeMembers.some((member) => member.storeId === storeId && member.userId === user.id);
    if (!exists) {
      this.storeMembers.push({
        id: `member_${Date.now()}_${this.storeMembers.length}`,
        storeId,
        userId: user.id,
        role: "STORE_ADMIN",
        permissions: STORE_ADMIN_PERMISSIONS
      });
    }

    return {
      storeId,
      account,
      initialPassword,
      adminLoginUrl: "/admin",
      role: "STORE_ADMIN"
    };
  }

  findUserByCredentials(email: string, password: string) {
    const user = this.users.find((candidate) => candidate.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return {
      id: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      memberships: this.storeMembers
        .filter((member) => member.userId === user.id)
        .map((member) => ({
          storeId: member.storeId,
          role: member.role,
          permissions: member.permissions
        }))
    };
  }

  private buildAdminAccount(phone: string | undefined, storeId: string) {
    const digits = phone?.replace(/\D/g, "");
    if (digits && digits.length >= 6) return digits;
    return `admin-${storeId.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}@shengduoduo.local`;
  }

  private generateInitialPassword() {
    return `Sdd@${randomBytes(4).toString("hex")}`;
  }

  listDishes(storeId: string) {
    return this.dishes.filter((dish) => dish.storeId === storeId && dish.isAvailable);
  }

  adminDashboard(storeId: string) {
    const store = this.stores.find((candidate) => candidate.id === storeId);
    const dishes = this.dishes.filter((dish) => dish.storeId === storeId);
    const orders = this.orders.filter((order) => order.storeId === storeId);
    const confirmedOrders = orders.filter((order) => order.status !== "DRAFT");
    const ingredients = new Map<string, { ingredientId: string; name: string; remainingGrams: string; unit: string }>();
    for (const batch of this.stockBatches.filter((candidate) => candidate.storeId === storeId)) {
      const current = ingredients.get(batch.ingredientId);
      const remainingGrams = current ? addMoney([current.remainingGrams, batch.remainingGrams]).toFixed(3) : batch.remainingGrams;
      ingredients.set(batch.ingredientId, {
        ingredientId: batch.ingredientId,
        name: batch.ingredientId.replace(/^ingredient_/, ""),
        remainingGrams,
        unit: "克"
      });
    }
    const report = this.report(storeId);
    return {
      store: store
        ? { id: store.id, name: store.name, status: store.status, contactName: store.contactName, phone: store.phone }
        : { id: storeId, name: storeId, status: "ACTIVE" },
      metrics: {
        todayRevenueYuan: addMoney(confirmedOrders.map((order) => order.totalYuan)).toFixed(2),
        todayOrders: orders.length,
        grossMarginRate: report.totals.grossMarginRate,
        stockWarnings: [...ingredients.values()].filter((item) => Number(item.remainingGrams) <= 1000).length
      },
      dishes,
      stock: [...ingredients.values()],
      orders: orders.slice(-10).reverse().map((order) => ({
        id: order.id,
        tableNo: order.tableNo,
        status: order.status,
        totalYuan: order.totalYuan,
        costYuan: order.costYuan,
        itemCount: order.items.length
      })),
      report,
      printJobs: this.listPrintJobs(storeId)
    };
  }

  listTabletDishes(storeId: string) {
    return this.listDishes(storeId).map(({ id, name, priceYuan, imageUrl, isAvailable }) => ({
      id,
      name,
      priceYuan,
      imageUrl,
      isAvailable
    }));
  }

  createDish(storeId: string, input: { name: string; priceYuan: string; recipeItems: DishRecord["recipeItems"] }) {
    const dish = {
      id: `dish_${Date.now()}`,
      storeId,
      name: input.name,
      priceYuan: input.priceYuan,
      isAvailable: true,
      recipeItems: input.recipeItems
    };
    this.dishes.push(dish);
    return dish;
  }

  confirmPurchase(storeId: string, input: { items: Array<{ ingredientId: string; grams: string; unitCostYuan: string }> }) {
    const receivedAt = new Date().toISOString();
    const batches = input.items.map((item, index) => ({
      id: `batch_${Date.now()}_${index}`,
      storeId,
      ingredientId: item.ingredientId,
      receivedAt,
      initialGrams: item.grams,
      remainingGrams: item.grams,
      unitCostYuan: item.unitCostYuan
    }));
    this.stockBatches.push(...batches);
    return { status: "CONFIRMED", batches };
  }

  createDraftOrder(storeId: string, input: { tableNo?: string; items: Array<{ dishId: string; quantity: number }> }) {
    const items = input.items.map((item, index) => {
      const dish = this.dishes.find((candidate) => candidate.storeId === storeId && candidate.id === item.dishId);
      if (!dish) throw new NotFoundException(`Dish ${item.dishId} not found`);
      return {
        id: `order_item_${Date.now()}_${index}`,
        dishId: dish.id,
        quantity: item.quantity,
        priceYuan: dish.priceYuan,
        recipeItems: dish.recipeItems
      };
    });
    const total = yuan2(addMoney(items.map((item) => multiplyMoney(item.priceYuan, item.quantity))));
    const order = { id: `order_${Date.now()}`, storeId, status: "DRAFT" as const, tableNo: input.tableNo, items, totalYuan: total, costYuan: "0.00" };
    this.orders.push(order);
    return order;
  }

  toTabletOrder(order: OrderRecord) {
    return {
      id: order.id,
      storeId: order.storeId,
      status: order.status,
      tableNo: order.tableNo,
      totalYuan: order.totalYuan,
      costYuan: order.costYuan,
      items: order.items.map((item) => ({
        id: item.id,
        dishId: item.dishId,
        quantity: item.quantity,
        priceYuan: item.priceYuan
      }))
    };
  }

  confirmOrder(storeId: string, orderId: string) {
    const order = this.orders.find((candidate) => candidate.id === orderId && candidate.storeId === storeId);
    if (!order) throw new NotFoundException("Order not found");
    const result = confirmOrderWithFifo({ storeId, orderId, orderItems: order.items, stockBatches: this.stockBatches });
    this.stockBatches = this.stockBatches.map((batch) => result.updatedBatches.find((updated) => updated.id === batch.id) ?? batch);
    this.consumptions.push(...result.consumptions);
    order.status = "CONFIRMED";
    order.costYuan = result.totalCostYuan;
    order.totalYuan = result.totalRevenueYuan;
    const printJob = {
      id: `print_${Date.now()}`,
      storeId,
      orderId,
      status: "PENDING",
      attempts: 0,
      payload: { orderId, tableNo: order.tableNo, items: order.items }
    };
    this.printJobs.push(printJob);
    return { order, inventory: result, printJob };
  }

  refundItem(storeId: string, input: { orderItemId: string; made: boolean; refundYuan: string }) {
    const result = refundOrderItem({
      storeId,
      refundId: `refund_${Date.now()}`,
      orderItemId: input.orderItemId,
      made: input.made,
      stockBatches: this.stockBatches,
      consumptions: this.consumptions
    });
    this.stockBatches = this.stockBatches.map((batch) => result.updatedBatches.find((updated) => updated.id === batch.id) ?? batch);
    const order = this.orders.find((candidate) => candidate.items.some((item) => item.id === input.orderItemId));
    if (order) order.status = "PARTIALLY_REFUNDED";
    return result;
  }

  report(storeId: string) {
    const confirmed = this.orders.filter((order) => order.storeId === storeId && order.status !== "DRAFT");
    return buildGrossProfitReport(
      confirmed.flatMap((order) =>
        order.items.map((item) => {
          const dish = this.dishes.find((candidate) => candidate.id === item.dishId);
          const cost = addMoney(
            this.consumptions
              .filter((line) => line.orderItemId === item.id)
              .map((line) => line.costYuan)
          ).toFixed(4);
          return {
            dishId: item.dishId,
            dishName: dish?.name ?? item.dishId,
            quantity: item.quantity,
            revenueYuan: yuan2(multiplyMoney(item.priceYuan, item.quantity)),
            costYuan: cost
          };
        })
      )
    );
  }

  listPrintJobs(storeId: string) {
    return this.printJobs.filter((job) => job.storeId === storeId);
  }
}
