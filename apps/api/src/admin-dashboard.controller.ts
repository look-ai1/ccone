import { Controller, Get } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addMoney, buildGrossProfitReport, multiplyMoney, yuan2 } from "@restaurant/core";
import { RequirePermissions } from "./auth.decorators.js";
import { InMemoryStore } from "./in-memory-store.js";
import { PrismaService } from "./prisma.service.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

function decimalString(value: Prisma.Decimal | string | number, digits = 2) {
  return new Prisma.Decimal(value).toFixed(digits);
}

@Controller("admin")
export class AdminDashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: InMemoryStore
  ) {}

  @Get("dashboard")
  @RequirePermissions("store:read")
  async dashboard(@TenantContext() tenant: TenantContextValue) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [store, dishes, ingredients, orders, orderItems, printJobs] = await Promise.all([
        this.prisma.store.findUnique({
          where: { id: tenant.storeId }
        }),
        this.prisma.dish.findMany({
          where: { storeId: tenant.storeId },
          orderBy: { createdAt: "desc" }
        }),
        this.prisma.ingredient.findMany({
          where: { storeId: tenant.storeId, isActive: true },
          include: { stockBatches: true },
          orderBy: { createdAt: "desc" }
        }),
        this.prisma.order.findMany({
          where: { storeId: tenant.storeId },
          include: { items: true },
          orderBy: { submittedAt: "desc" },
          take: 10
        }),
        this.prisma.orderItem.findMany({
          where: {
            storeId: tenant.storeId,
            order: {
              status: { not: "DRAFT" }
            }
          },
          include: { dish: true }
        }),
        this.prisma.printJob.findMany({
          where: { storeId: tenant.storeId },
          orderBy: { createdAt: "desc" },
          take: 10
        })
      ]);

      const todayOrders = orders.filter((order) => order.submittedAt >= today);
      const todayRevenue = addMoney(todayOrders.filter((order) => order.status !== "DRAFT").map((order) => order.totalYuan.toString()));
      const stock = ingredients.map((ingredient) => {
        const remaining = addMoney(ingredient.stockBatches.map((batch) => batch.remainingGrams.toString()));
        return {
          ingredientId: ingredient.id,
          name: ingredient.name,
          remainingGrams: remaining.toFixed(3),
          unit: ingredient.unit
        };
      });
      const report = buildGrossProfitReport(
        orderItems.map((item) => ({
          dishId: item.dishId,
          dishName: item.dishNameSnapshot || item.dish.name,
          quantity: item.quantity,
          revenueYuan: yuan2(multiplyMoney(item.priceYuan.toString(), item.quantity)),
          costYuan: decimalString(item.costYuan)
        }))
      );

      return {
        store: store
          ? { id: store.id, name: store.name, status: store.status, contactName: store.contactName, phone: store.phone }
          : { id: tenant.storeId, name: tenant.storeId, status: "ACTIVE" },
        metrics: {
          todayRevenueYuan: yuan2(todayRevenue),
          todayOrders: todayOrders.length,
          grossMarginRate: report.totals.grossMarginRate,
          stockWarnings: stock.filter((item) => new Prisma.Decimal(item.remainingGrams).lessThanOrEqualTo(1000)).length
        },
        dishes: dishes.map((dish) => ({
          id: dish.id,
          name: dish.name,
          priceYuan: decimalString(dish.priceYuan),
          imageUrl: dish.imageUrl,
          isAvailable: dish.isAvailable
        })),
        stock,
        orders: orders.map((order) => ({
          id: order.id,
          tableNo: order.tableNo,
          status: order.status,
          totalYuan: decimalString(order.totalYuan),
          costYuan: decimalString(order.costYuan),
          itemCount: order.items.length,
          submittedAt: order.submittedAt.toISOString()
        })),
        report,
        printJobs: printJobs.map((job) => ({
          id: job.id,
          orderId: job.orderId,
          status: job.status,
          attempts: job.attempts,
          createdAt: job.createdAt.toISOString()
        }))
      };
    } catch (error) {
      console.error("[DB_FALLBACK] dashboard:", (error as NodeJS.ErrnoException).code ?? "unknown");
      return this.store.adminDashboard(tenant.storeId);
    }
  }
}
