import { describe, expect, it } from "vitest";
import { buildGrossProfitReport } from "../src/reports.js";

describe("gross profit report", () => {
  it("groups sales by dish with yuan decimal totals", () => {
    const report = buildGrossProfitReport([
      { dishId: "dish_1", dishName: "青椒肉丝", quantity: 1, revenueYuan: "28.00", costYuan: "9.1250" },
      { dishId: "dish_1", dishName: "青椒肉丝", quantity: 2, revenueYuan: "56.00", costYuan: "18.2500" },
      { dishId: "dish_2", dishName: "番茄炒蛋", quantity: 1, revenueYuan: "18.00", costYuan: "5.0000" }
    ]);

    expect(report.rows.find((row) => row.dishId === "dish_1")?.revenueYuan).toBe("84.00");
    expect(report.rows.find((row) => row.dishId === "dish_1")?.costYuan).toBe("27.38");
    expect(report.totals.revenueYuan).toBe("102.00");
    expect(report.totals.grossProfitYuan).toBe("69.62");
  });
});
