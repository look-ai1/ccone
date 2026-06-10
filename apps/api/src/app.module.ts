import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { AdminDashboardController } from "./admin-dashboard.controller.js";
import { AuthController } from "./auth.controller.js";
import { PermissionGuard } from "./auth.guard.js";
import { TenantMiddleware } from "./tenant.middleware.js";
import { CatalogController } from "./catalog.controller.js";
import { HealthController } from "./health.controller.js";
import { InMemoryStore } from "./in-memory-store.js";
import { OrdersController } from "./orders.controller.js";
import { PrismaService } from "./prisma.service.js";
import { PurchasesController } from "./purchases.controller.js";
import { ReportsController } from "./reports.controller.js";
import { StoresController } from "./stores.controller.js";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: "global",
        ttl: 60_000,
        limit: 60
      }
    ])
  ],
  controllers: [HealthController, AuthController, StoresController, AdminDashboardController, CatalogController, PurchasesController, OrdersController, ReportsController],
  providers: [
    InMemoryStore,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new PermissionGuard(reflector),
      inject: [Reflector]
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
