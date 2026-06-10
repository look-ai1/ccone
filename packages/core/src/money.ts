import { Decimal } from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type MoneyString = string;

export function yuan(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(4);
}

export function yuan2(value: Decimal.Value): MoneyString {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2);
}

export function addMoney(values: Decimal.Value[]): Decimal {
  let sum = new Decimal(0);
  for (const value of values) {
    sum = sum.plus(value);
  }
  return sum;
}

export function multiplyMoney(value: Decimal.Value, multiplier: Decimal.Value): Decimal {
  return new Decimal(value).mul(multiplier).toDecimalPlaces(4);
}

export function grossMarginRate(revenue: Decimal.Value, cost: Decimal.Value): MoneyString {
  const revenueDecimal = new Decimal(revenue);
  if (revenueDecimal.isZero()) {
    return "0.00";
  }
  return revenueDecimal.minus(cost).div(revenueDecimal).mul(100).toDecimalPlaces(2).toFixed(2);
}
