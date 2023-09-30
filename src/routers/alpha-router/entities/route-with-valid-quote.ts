import { BigNumber } from '@ethersproject/bignumber';
import { Token, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';
import { CurrencyAmount } from '../../../util/amounts';
import { routeToString } from '../../../util/routes';
import {MixedRoute, RiverexRoute, V2Route, V3Route} from '../../router';
import { IGasModel } from '../gas-models/gas-model';
import {RiverexPair} from "./riverex-pool";
import {Protocol} from "../../../util/protocols";

/**
 * Represents a route, a quote for swapping some amount on it, and other
 * metadata used by the routing algorithm.
 *
 * @export
 * @interface IRouteWithValidQuote
 * @template Route
 */
export interface IRouteWithValidQuote<
  Route extends V3Route | V2Route | MixedRoute | RiverexRoute
> {
  amount: CurrencyAmount;
  percent: number;
  // If exact in, this is (quote - gasCostInToken). If exact out, this is (quote + gasCostInToken).
  quoteAdjustedForGas: CurrencyAmount;
  quote: CurrencyAmount;
  route: Route;
  gasEstimate: BigNumber;
  // The gas cost in terms of the quote token.
  gasCostInToken: CurrencyAmount;
  gasCostInUSD: CurrencyAmount;
  tradeType: TradeType;
  poolAddresses: string[];
  tokenPath: Token[];
}

export type IRiverexRouteWithValidQuote = {
  protocol: Protocol.RIVERDEX;
} & IRouteWithValidQuote<RiverexRoute>;

export type RouteWithValidQuote = RiverexRouteWithValidQuote;

export type RiverexRouteWithValidQuoteParams = {
  amount: CurrencyAmount;
  rawQuote: BigNumber;
  percent: number;
  route: RiverexRoute;
  gasModel: IGasModel<RiverexRouteWithValidQuote>;
  quoteToken: Token;
  tradeType: TradeType;
};
/**
 * Represents a quote for swapping on a Riverex only route. Contains all information
 * such as the route used, the amount specified by the user, the type of quote
 * (exact in or exact out), the quote itself, and gas estimates.
 *
 * @export
 * @class RiverexRouteWithValidQuote
 */
export class RiverexRouteWithValidQuote implements IRiverexRouteWithValidQuote {
  public readonly protocol = Protocol.RIVERDEX;
  public amount: CurrencyAmount;
  // The BigNumber representing the quote.
  public rawQuote: BigNumber;
  public quote: CurrencyAmount;
  public quoteAdjustedForGas: CurrencyAmount;
  public percent: number;
  public route: RiverexRoute;
  public quoteToken: Token;
  public gasModel: IGasModel<RiverexRouteWithValidQuote>;
  public gasEstimate: BigNumber;
  public gasCostInToken: CurrencyAmount;
  public gasCostInUSD: CurrencyAmount;
  public tradeType: TradeType;
  public poolAddresses: string[];
  public tokenPath: Token[];
  public amountParsed?: string;
  public quoteParsed ?: string;

  public toString(): string {
    return `${this.percent.toFixed(
      2
    )}% QuoteGasAdj[${this.quoteAdjustedForGas.toExact()}] Quote[${this.quote.toExact()}] Gas[${this.gasEstimate.toString()}] = ${routeToString(
      this.route
    )}`;
  }

  constructor({
                amount,
                rawQuote,
                percent,
                route,
                gasModel,
                quoteToken,
                tradeType,
              }: RiverexRouteWithValidQuoteParams) {
    this.amount = amount;
    this.rawQuote = rawQuote;
    this.quote = CurrencyAmount.fromRawAmount(quoteToken, rawQuote.toString());
    this.percent = percent;
    this.route = route;
    this.gasModel = gasModel;
    this.quoteToken = quoteToken;
    this.tradeType = tradeType;

    const { gasEstimate, gasCostInToken, gasCostInUSD } =
      this.gasModel.estimateGasCost(this);

    this.gasCostInToken = gasCostInToken;
    this.gasCostInUSD = gasCostInUSD;
    this.gasEstimate = gasEstimate;

    // If its exact out, we need to request *more* of the input token to account for the gas.
    if (this.tradeType == TradeType.EXACT_INPUT) {
      const quoteGasAdjusted = this.quote.subtract(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    } else {
      const quoteGasAdjusted = this.quote.add(gasCostInToken);
      this.quoteAdjustedForGas = quoteGasAdjusted;
    }

    this.poolAddresses = _.map(
      route.pairs,
      (p: RiverexPair) => p.address
    );

    this.tokenPath = this.route.path;
  }
}
