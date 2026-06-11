import { pbkdf2Sync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password: string) {
  const iterations = 120_000;
  const salt = randomBytes(16).toString("hex");
  const key = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${key}`;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`缺少环境变量 ${key}，请在 .env 中设置后再运行 seed`);
  return value;
}

async function main() {
  const seedSuperAdminPassword = requireEnv("SEED_SUPER_ADMIN_PASSWORD");
  const seedStoreAdminPassword = requireEnv("SEED_STORE_ADMIN_PASSWORD");
  const seedStaffPassword = requireEnv("SEED_STAFF_PASSWORD");
  const superRole = await prisma.role.upsert({
    where: { key: "SUPER_ADMIN" },
    update: {
      permissions: ["*"]
    },
    create: {
      key: "SUPER_ADMIN",
      name: "超管",
      permissions: ["*"]
    }
  });

  const storeAdminRole = await prisma.role.upsert({
    where: { key: "STORE_ADMIN" },
    update: {
      permissions: ["auth:read", "store:read", "dish:write", "order:write", "inventory:write", "report:read"]
    },
    create: {
      key: "STORE_ADMIN",
      name: "门店管理员",
      permissions: ["auth:read", "store:read", "dish:write", "order:write", "inventory:write", "report:read"]
    }
  });

  const staffRole = await prisma.role.upsert({
    where: { key: "STAFF" },
    update: {
      permissions: ["auth:read", "order:write"]
    },
    create: {
      key: "STAFF",
      name: "服务员",
      permissions: ["auth:read", "order:write"]
    }
  });

  const store = await prisma.store.upsert({
    where: { id: "store_demo" },
    update: { name: "川湘轩总店", contactName: "张三", phone: "13800138000", status: "ACTIVE" },
    create: { id: "store_demo", name: "川湘轩总店", contactName: "张三", phone: "13800138000", status: "ACTIVE" }
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: "shengduoduo.saas" },
    update: { displayName: "省多多超管", isSuperAdmin: true, passwordHash: hashPassword(seedSuperAdminPassword) },
    create: {
      email: "shengduoduo.saas",
      displayName: "省多多超管",
      isSuperAdmin: true,
      passwordHash: hashPassword(seedSuperAdminPassword)
    }
  });

  const storeAdmin = await prisma.user.upsert({
    where: { email: "admin@shengduoduo.local" },
    update: { displayName: "门店管理员", passwordHash: hashPassword(seedStoreAdminPassword) },
    create: {
      email: "admin@shengduoduo.local",
      displayName: "门店管理员",
      passwordHash: hashPassword(seedStoreAdminPassword)
    }
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@shengduoduo.local" },
    update: { displayName: "点餐服务员", passwordHash: hashPassword(seedStaffPassword) },
    create: {
      email: "staff@shengduoduo.local",
      displayName: "点餐服务员",
      passwordHash: hashPassword(seedStaffPassword)
    }
  });

  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: superAdmin.id } },
    update: { roleId: superRole.id },
    create: { storeId: store.id, userId: superAdmin.id, roleId: superRole.id }
  });
  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: storeAdmin.id } },
    update: { roleId: storeAdminRole.id },
    create: { storeId: store.id, userId: storeAdmin.id, roleId: storeAdminRole.id }
  });
  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: staff.id } },
    update: { roleId: staffRole.id },
    create: { storeId: store.id, userId: staff.id, roleId: staffRole.id }
  });

  const category = await prisma.dishCategory.upsert({
    where: { storeId_name: { storeId: store.id, name: "热销菜" } },
    update: { sortOrder: 1 },
    create: { storeId: store.id, name: "热销菜", sortOrder: 1 }
  });

  const ingredientInputs = [
    { key: "pork", name: "猪肉", grams: "5000.000", unitCostYuan: "0.0240" },
    { key: "pepper", name: "青椒", grams: "3000.000", unitCostYuan: "0.0100" },
    { key: "egg", name: "鸡蛋", grams: "4000.000", unitCostYuan: "0.0120" },
    { key: "tomato", name: "番茄", grams: "5000.000", unitCostYuan: "0.0080" },
    { key: "seaweed", name: "紫菜", grams: "500.000", unitCostYuan: "0.0600" }
  ];
  const ingredients = new Map<string, Awaited<ReturnType<typeof prisma.ingredient.upsert>>>();
  for (const item of ingredientInputs) {
    const ingredient = await prisma.ingredient.upsert({
      where: { storeId_name: { storeId: store.id, name: item.name } },
      update: { unit: "gram", isActive: true },
      create: { id: `ingredient_${item.key}`, storeId: store.id, name: item.name, unit: "gram", isActive: true }
    });
    ingredients.set(item.key, ingredient);
    await prisma.stockBatch.upsert({
      where: { id: `batch_${item.key}_1` },
      update: {
        ingredientId: ingredient.id,
        initialGrams: item.grams,
        remainingGrams: item.grams,
        unitCostYuan: item.unitCostYuan,
        receivedAt: new Date("2026-06-01T00:00:00.000Z")
      },
      create: {
        id: `batch_${item.key}_1`,
        storeId: store.id,
        ingredientId: ingredient.id,
        initialGrams: item.grams,
        remainingGrams: item.grams,
        unitCostYuan: item.unitCostYuan,
        receivedAt: new Date("2026-06-01T00:00:00.000Z")
      }
    });
  }

  const dishInputs = [
    {
      key: "pork",
      name: "青椒肉丝",
      priceYuan: "28.00",
      imageUrl: "/dishes/pork.svg",
      recipe: [
        { key: "pork", gramsPerDish: "250.000" },
        { key: "pepper", gramsPerDish: "80.000" }
      ]
    },
    {
      key: "egg",
      name: "番茄炒蛋",
      priceYuan: "18.00",
      imageUrl: "/dishes/egg.svg",
      recipe: [
        { key: "egg", gramsPerDish: "120.000" },
        { key: "tomato", gramsPerDish: "180.000" }
      ]
    },
    {
      key: "soup",
      name: "紫菜蛋花汤",
      priceYuan: "12.00",
      imageUrl: "/dishes/soup.svg",
      recipe: [
        { key: "egg", gramsPerDish: "40.000" },
        { key: "seaweed", gramsPerDish: "8.000" }
      ]
    }
  ];
  const dishes = new Map<string, Awaited<ReturnType<typeof prisma.dish.upsert>>>();
  for (const item of dishInputs) {
    const dish = await prisma.dish.upsert({
      where: { storeId_name: { storeId: store.id, name: item.name } },
      update: {
        categoryId: category.id,
        priceYuan: item.priceYuan,
        imageUrl: item.imageUrl,
        isAvailable: true
      },
      create: {
        id: `dish_${item.key}`,
        storeId: store.id,
        categoryId: category.id,
        name: item.name,
        priceYuan: item.priceYuan,
        imageUrl: item.imageUrl,
        isAvailable: true
      }
    });
    dishes.set(item.key, dish);
    const recipeVersion = await prisma.recipeVersion.upsert({
      where: { dishId_version: { dishId: dish.id, version: 1 } },
      update: { note: "演示基础配方" },
      create: { id: `recipe_${item.key}_v1`, storeId: store.id, dishId: dish.id, version: 1, note: "演示基础配方" }
    });
    for (const recipeItem of item.recipe) {
      const ingredient = ingredients.get(recipeItem.key);
      if (!ingredient) continue;
      await prisma.recipeItem.upsert({
        where: { recipeVersionId_ingredientId: { recipeVersionId: recipeVersion.id, ingredientId: ingredient.id } },
        update: { gramsPerDish: recipeItem.gramsPerDish },
        create: {
          storeId: store.id,
          recipeVersionId: recipeVersion.id,
          ingredientId: ingredient.id,
          gramsPerDish: recipeItem.gramsPerDish
        }
      });
    }
    await prisma.dish.update({
      where: { id: dish.id },
      data: { activeRecipeVersionId: recipeVersion.id }
    });
  }

  const demoOrder = await prisma.order.upsert({
    where: { id: "order_demo_001" },
    update: { status: "CONFIRMED", totalYuan: "74.00", costYuan: "24.00", confirmedAt: new Date() },
    create: {
      id: "order_demo_001",
      storeId: store.id,
      status: "CONFIRMED",
      tableNo: "A03",
      totalYuan: "74.00",
      costYuan: "24.00",
      confirmedAt: new Date()
    }
  });
  const porkDish = dishes.get("pork");
  const eggDish = dishes.get("egg");
  if (porkDish && eggDish) {
    await prisma.orderItem.upsert({
      where: { id: "order_item_demo_001" },
      update: { quantity: 2, priceYuan: "28.00", costYuan: "18.00", dishNameSnapshot: porkDish.name },
      create: {
        id: "order_item_demo_001",
        storeId: store.id,
        orderId: demoOrder.id,
        dishId: porkDish.id,
        dishNameSnapshot: porkDish.name,
        quantity: 2,
        priceYuan: "28.00",
        costYuan: "18.00"
      }
    });
    await prisma.orderItem.upsert({
      where: { id: "order_item_demo_002" },
      update: { quantity: 1, priceYuan: "18.00", costYuan: "6.00", dishNameSnapshot: eggDish.name },
      create: {
        id: "order_item_demo_002",
        storeId: store.id,
        orderId: demoOrder.id,
        dishId: eggDish.id,
        dishNameSnapshot: eggDish.name,
        quantity: 1,
        priceYuan: "18.00",
        costYuan: "6.00"
      }
    });
    await prisma.printJob.upsert({
      where: { id: "print_demo_001" },
      update: { status: "PENDING", attempts: 0, payload: { orderId: demoOrder.id, tableNo: demoOrder.tableNo } },
      create: {
        id: "print_demo_001",
        storeId: store.id,
        orderId: demoOrder.id,
        status: "PENDING",
        payload: { orderId: demoOrder.id, tableNo: demoOrder.tableNo }
      }
    });
  }

  await prisma.storeApplication.upsert({
    where: { id: "application_demo_001" },
    update: {
      requesterStoreId: store.id,
      requestedName: "川湘轩朝阳分店",
      applicantName: "张三",
      applicantPhone: "13800138101",
      reason: "业务扩张，需要开设新分店",
      status: "PENDING",
      approvedStoreId: null,
      decidedAt: null
    },
    create: {
      id: "application_demo_001",
      requesterStoreId: store.id,
      requestedName: "川湘轩朝阳分店",
      applicantName: "张三",
      applicantPhone: "13800138101",
      reason: "业务扩张，需要开设新分店"
    }
  });

  await prisma.storeApplication.upsert({
    where: { id: "application_demo_002" },
    update: {
      requesterStoreId: store.id,
      requestedName: "川湘轩海淀分店",
      applicantName: "张三",
      applicantPhone: "13800138102",
      reason: "覆盖周边商圈堂食业务",
      status: "PENDING",
      approvedStoreId: null,
      decidedAt: null
    },
    create: {
      id: "application_demo_002",
      requesterStoreId: store.id,
      requestedName: "川湘轩海淀分店",
      applicantName: "张三",
      applicantPhone: "13800138102",
      reason: "覆盖周边商圈堂食业务"
    }
  });

  await prisma.systemConfig.upsert({
    where: { key: "ocr" },
    update: {
      value: {
        provider: "豆包 OCR",
        apiKey: "********",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3",
        status: "正常"
      }
    },
    create: {
      key: "ocr",
      value: {
        provider: "豆包 OCR",
        apiKey: "********",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3",
        status: "正常"
      }
    }
  });

  await prisma.systemConfig.upsert({
    where: { key: "printer" },
    update: {
      value: {
        provider: "飞鹅打印",
        retryCount: "5",
        status: "正常"
      }
    },
    create: {
      key: "printer",
      value: {
        provider: "飞鹅打印",
        retryCount: "5",
        status: "正常"
      }
    }
  });

  await prisma.systemConfig.upsert({
    where: { key: "permissions" },
    update: {
      value: {
        storeAdmin: "菜单、库存、订单、报表",
        waiter: "点餐、订单查看",
        kitchen: "打印任务、制作状态"
      }
    },
    create: {
      key: "permissions",
      value: {
        storeAdmin: "菜单、库存、订单、报表",
        waiter: "点餐、订单查看",
        kitchen: "打印任务、制作状态"
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
