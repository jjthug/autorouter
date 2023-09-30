import { parseUnits } from '@ethersproject/units';
import {
  Currency,
  CurrencyAmount as CurrencyAmountRaw,
} from '@uniswap/sdk-core';
import JSBI from 'jsbi';

export class CurrencyAmount extends CurrencyAmountRaw<Currency> {}


// Try to parse a user entered amount for a given token
export function parseAmount(value: string, currency: Currency): CurrencyAmount {
  // value = parseFloat(value).toFixed(currency.decimals);
  value = parseFloat(value).toFixed(currency.decimals);
  const typedValueParsed = parseUnits(value, currency.decimals).toString();
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
}