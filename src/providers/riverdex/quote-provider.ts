import { BigNumber } from '@ethersproject/bignumber';
import { TradeType } from '@uniswap/sdk-core';
import {
  InsufficientInputAmountError,
  InsufficientReservesError,
} from '@uniswap/v2-sdk';

import {RiverexRoute} from '../../routers/router';
import { CurrencyAmount } from '../../util/amounts';
import { log } from '../../util/log';
import { routeToString } from '../../util/routes';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type RiverexAmountQuote = {
  amount: CurrencyAmount;
  quote: BigNumber | null;
};

export type RiverexRouteWithQuotes = [RiverexRoute, RiverexAmountQuote[]];

export interface IRiverexQuoteProvider {
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: RiverexRoute[]
  ): Promise<{ routesWithQuotes: RiverexRouteWithQuotes[] }>;

  getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: RiverexRoute[]
  ): Promise<{ routesWithQuotes: RiverexRouteWithQuotes[] }>;
}

/**
 * Computes quotes for Riverex off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class RiverexQuoteProvider
 */
export class RiverexQuoteProvider implements IRiverexQuoteProvider {
  /* eslint-disable @typescript-eslint/no-empty-function */
  constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: RiverexRoute[]
  ): Promise<{ routesWithQuotes: RiverexRouteWithQuotes[] }> {
    return this.getQuotes(amountIns, routes, TradeType.EXACT_INPUT);
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: RiverexRoute[]
  ): Promise<{ routesWithQuotes: RiverexRouteWithQuotes[] }> {
    return this.getQuotes(amountOuts, routes, TradeType.EXACT_OUTPUT);
  }

  private async getQuotes(
    amounts: CurrencyAmount[],
    routes: RiverexRoute[],
    tradeType: TradeType
  ): Promise<{ routesWithQuotes: RiverexRouteWithQuotes[] }> {
    const routesWithQuotes: RiverexRouteWithQuotes[] = [];

    const debugStrs: string[] = [];
    for (const route of routes) {
      const amountQuotes: RiverexAmountQuote[] = [];

      let insufficientInputAmountErrorCount = 0;
      let insufficientReservesErrorCount = 0;
      for (const amount of amounts) {
        try {
          if (tradeType == TradeType.EXACT_INPUT) {
            let outputAmount = amount.wrapped;

            for (const pair of route.pairs) {
              const [outputAmountNew] = pair.getOutputAmount(outputAmount);
              outputAmount = outputAmountNew;
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(outputAmount.quotient.toString()),
            });
          } else {
            let inputAmount = amount.wrapped;

            for (let i = route.pairs.length - 1; i >= 0; i--) {
              const pair = route.pairs[i]!;
              [inputAmount] = pair.getInputAmount(inputAmount);
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(inputAmount.quotient.toString()),
            });
          }
        } catch (err) {
          // Can fail to get quotes, e.g. throws InsufficientReservesError or InsufficientInputAmountError.
          if (err instanceof InsufficientInputAmountError) {
            insufficientInputAmountErrorCount =
              insufficientInputAmountErrorCount + 1;
            amountQuotes.push({ amount, quote: null });
          } else if (err instanceof InsufficientReservesError) {
            insufficientReservesErrorCount = insufficientReservesErrorCount + 1;
            amountQuotes.push({ amount, quote: null });
          } else {
            throw err;
          }
        }
      }

      if (
        insufficientInputAmountErrorCount > 0 ||
        insufficientReservesErrorCount > 0
      ) {
        debugStrs.push(
          `${[
            routeToString(route),
          ]} Input: ${insufficientInputAmountErrorCount} Reserves: ${insufficientReservesErrorCount} }`
        );
      }

      routesWithQuotes.push([route, amountQuotes]);
    }

    if (debugStrs.length > 0) {
      log.info({ debugStrs }, `Failed quotes for Riverex routes`);
    }

    return {
      routesWithQuotes,
    };
  }
}
