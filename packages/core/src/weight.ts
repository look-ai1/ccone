import { Decimal } from "decimal.js";

export type GramString = string;

export function grams(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(3);
}

export function jinToGrams(value: Decimal.Value): Decimal {
  return new Decimal(value).mul(500).toDecimalPlaces(3);
}

export function gramsToJin(value: Decimal.Value): Decimal {
  return new Decimal(value).div(500).toDecimalPlaces(3);
}
