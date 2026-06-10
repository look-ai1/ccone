import { Body, Controller, Get, Post } from "@nestjs/common";
import { InMemoryStore } from "./in-memory-store.js";
import { RequirePermissions } from "./auth.decorators.js";
import { TenantContext, type TenantContextValue } from "./tenant-context.js";

@Controller()
export class CatalogController {
  constructor(private readonly store: InMemoryStore) {}

  @Get("tablet/dishes")
  tabletDishes(@TenantContext() tenant: TenantContextValue) {
    return this.store.listTabletDishes(tenant.storeId);
  }

  @Get("admin/dishes")
  @RequirePermissions("store:read")
  adminDishes(@TenantContext() tenant: TenantContextValue) {
    return this.store.listDishes(tenant.storeId);
  }

  @Post("admin/dishes")
  @RequirePermissions("dish:write")
  createDish(
    @TenantContext() tenant: TenantContextValue,
    @Body() body: { name: string; priceYuan: string; recipeItems: Array<{ ingredientId: string; gramsPerDish: string }> }
  ) {
    return this.store.createDish(tenant.storeId, body);
  }
}
