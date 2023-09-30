import { CurrencyAmount } from '@uniswap/sdk-core';
import { BigintIsh } from '@uniswap/sdk-core/dist/constants';
import { Currency } from '@uniswap/sdk-core/dist/entities/currency';

export class ExtendedCurrencyAmount<T extends Currency> extends CurrencyAmount<T>{
  constructor(currency: T, numerator: BigintIsh, denominator?: BigintIsh) {
    super(currency, numerator, denominator);
  }
}