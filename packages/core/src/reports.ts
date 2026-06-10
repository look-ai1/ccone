import { Decimal } from "decimal.js";
import { grossMarginRate, yuan2 } from "./money.js";

export interface ReportOrderItem {
  dishId: string;
  dishName: string;
  quantity: number;
  revenueYuan: string;
  costYuan: string;
}

export interface DishGrossProfitRow {
  dishId: string;
  dishName: string;
  quantity: number;
  revenueYuan: string;
  costYuan: string;
  grossProfitYuan: string;
  grossMarginRate: string;
}

export function buildGrossProfitReport(items: ReportOrderItem[]): {
  rows: DishGrossProfitRow[];
  totals: Omit<DishGrossProfitRow, "dishId" | "dishName">;
} {
  const grouped = new Map<string, DishGrossProfitRow>();

  for (const item of items) {
    const key = item.dishId;
    const current =
      grouped.get(key) ??
      ({
        dishId: item.dishId,
        dishName: item.dishName,
        quantity: 0,
        revenueYuan: "0.00",
        costYuan: "0.00",
        grossProfitYuan: "0.00",
        grossMarginRate: "0.00"
      } satisfies DishGrossProfitRow);

    const revenue = new Decimal(current.revenueYuan).plus(item.revenueYuan);
    const cost = new Decimal(current.costYuan).plus(item.costYuan);
    current.quantity += item.quantity;
    current.revenueYuan = yuan2(revenue);
    current.costYuan = yuan2(cost);
    current.grossProfitYuan = yuan2(revenue.minus(cost));
    current.grossMarginRate = grossMarginRate(revenue, cost);
    grouped.set(key, current);
  }

  const rows = [...grouped.values()];
  const totalRevenue = rows.reduce((sum, row) => sum.plus(row.revenueYuan), new Decimal(0));
  const totalCost = rows.reduce((sum, row) => sum.plus(row.costYuan), new Decimal(0));

  return {
    rows,
    totals: {
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      revenueYuan: yuan2(totalRevenue),
      costYuan: yuan2(totalCost),
      grossProfitYuan: yuan2(totalRevenue.minus(totalCost)),
      grossMarginRate: grossMarginRate(totalRevenue, totalCost)
    }
  };
}
