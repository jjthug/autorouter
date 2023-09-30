import { BigNumber } from '@ethersproject/bignumber';
import { Currency, Fraction, Token, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import { RiverexPoolProvider, RiverexProvider, RiverexQuoteProvider } from '../../providers';
import { CurrencyAmount } from '../../util/amounts';
import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import { buildSwapMethodParameters } from '../../util/methodParameters';
import { metric, MetricLoggerUnit } from '../../util/metric';
import { IRouter, MethodParameters, RiverexRoute, SwapOptions, SwapRoute } from '../router';

import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from './config';
import { RouteWithValidQuote } from './entities/route-with-valid-quote';
import { BestSwapRoute, getBestSwapRoute } from './functions/best-swap-route';
import { CandidatePoolsBySelectionCriteria } from './functions/get-candidate-pools';
import { IRiverexGasModelFactory } from './gas-models/gas-model';
import { GetQuotesResult } from './quoters';
import { RiverexQuoter } from './quoters/riverdex-quoter';
import { IRiverexProvider } from '../../providers/riverdex/riverex-provider';
import { IRiverexPoolProvider } from '../../providers/riverdex/pool-provider';
import { IRiverexQuoteProvider } from '../../providers/riverdex/quote-provider';
import { RiverexHeuristicGasModelFactory } from './gas-models/riverex/riverex-heuristic-gas-model';
import { Protocol } from '../../util';
import axios from 'axios';
import { isTronChain } from '../../util/checkTron';
import Timeout from 'await-timeout';
import { TIMEOUT } from '../../util/timeout_values';
const { fromHex } = require('tron-format-address')

export type AlphaRouterParams = {
  /**
   * The chain id for this instance of the Alpha Router.
   */
  chainId: ChainId;
  riverexProvider?: IRiverexProvider;
  riverexPoolProvider?: IRiverexPoolProvider;
  riverexQuoteProvider?: IRiverexQuoteProvider;
  riverexGasModelFactory?: IRiverexGasModelFactory;
};

export class MapWithLowerCaseKey<V> extends Map<string, V> {
  override set(key: string, value: V): this {
    return super.set(key.toLowerCase(), value);
  }
}

/**
 * Determines the pools that the algorithm will consider when finding the optimal swap.
 *
 * All pools on each protocol are filtered based on the heuristics specified here to generate
 * the set of candidate pools. The Top N pools are taken by Total Value Locked (TVL).
 *
 * Higher values here result in more pools to explore which results in higher latency.
 */
export type ProtocolPoolSelection = {
  /**
   * The top N pools by TVL out of all pools on the protocol.
   */
  topN: number;
  /**
   * The top N pools by TVL of pools that consist of tokenIn and tokenOut.
   */
  topNDirectSwaps: number;
  /**
   * The top N pools by TVL of pools where one token is tokenIn and the
   * top N pools by TVL of pools where one token is tokenOut tokenOut.
   */
  topNTokenInOut: number;
  /**
   * Given the topNTokenInOut pools, gets the top N pools that involve the other token.
   * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
   * a value of 2 would find the top 2 pools that involve DAI and top 2 pools that involve USDT.
   */
  topNSecondHop: number;
  /**
   * Given the topNTokenInOut pools and a token address,
   * gets the top N pools that involve the other token.
   * If token address is not on the list, we default to topNSecondHop.
   * E.g. for a WETH -> USDC swap, if topNTokenInOut found WETH -> DAI and WETH -> USDT,
   * and there's a mapping USDT => 4, but no mapping for DAI
   * it would find the top 4 pools that involve USDT, and find the topNSecondHop pools that involve DAI
   */
  topNSecondHopForTokenAddress?: MapWithLowerCaseKey<number>;
  /**
   * The top N pools for token in and token out that involve a token from a list of
   * hardcoded 'base tokens'. These are standard tokens such as WETH, USDC, DAI, etc.
   * This is similar to how the legacy routing algorithm used by Uniswap would select
   * pools and is intended to make the new pool selection algorithm close to a superset
   * of the old algorithm.
   */
  topNWithEachBaseToken: number;
  /**
   * Given the topNWithEachBaseToken pools, takes the top N pools from the full list.
   * E.g. for a WETH -> USDC swap, if topNWithEachBaseToken found WETH -0.05-> DAI,
   * WETH -0.01-> DAI, WETH -0.05-> USDC, WETH -0.3-> USDC, a value of 2 would reduce
   * this set to the top 2 pools from that full list.
   */
  topNWithBaseToken: number;
};

export type AlphaRouterConfig = {
  /**
   * The block number to use for all on-chain data. If not provided, the router will
   * use the latest block returned by the provider.
   */
  blockNumber?: number | Promise<number>;
  /**
   * The protocols to consider when finding the optimal swap. If not provided all protocols
   * will be used.
   */
  protocols?: Protocol[];
  /**
   * Config for selecting which pools to consider routing via on V2.
   */
  v2PoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on riverex.
   */
  riverexPoolSelection: ProtocolPoolSelection;
  /**
   * Config for selecting which pools to consider routing via on V3.
   */
  v3PoolSelection: ProtocolPoolSelection;
  /**
   * For each route, the maximum number of hops to consider. More hops will increase latency of the algorithm.
   */
  maxSwapsPerPath: number;
  /**
   * The maximum number of splits in the returned route. A higher maximum will increase latency of the algorithm.
   */
  maxSplits: number;
  /**
   * The minimum number of splits in the returned route.
   * This parameters should always be set to 1. It is only included for testing purposes.
   */
  minSplits: number;
  /**
   * Forces the returned swap to route across all protocols.
   * This parameter should always be false. It is only included for testing purposes.
   */
  forceCrossProtocol: boolean;
  /**
   * Force the alpha router to choose a mixed route swap.
   * Default will be falsy. It is only included for testing purposes.
   */
  forceMixedRoutes?: boolean;
  /**
   * The minimum percentage of the input token to use for each route in a split route.
   * All routes will have a multiple of this value. For example is distribution percentage is 5,
   * a potential return swap would be:
   *
   * 5% of input => Route 1
   * 55% of input => Route 2
   * 40% of input => Route 3
   */
  distributionPercent: number;
};

export class AlphaRouter
  implements IRouter<AlphaRouterConfig> {
  protected chainId: ChainId;
  protected riverexQuoter: RiverexQuoter;
  protected riverexProvider: IRiverexProvider;
  protected riverexPoolProvider: IRiverexPoolProvider;
  protected riverexQuoteProvider: IRiverexQuoteProvider;
  protected riverexGasModelFactory: IRiverexGasModelFactory;

  constructor({
    chainId,
    riverexProvider,
    riverexPoolProvider,
    riverexQuoteProvider,
    riverexGasModelFactory,
  }: AlphaRouterParams) {
    this.chainId = chainId;

    this.riverexPoolProvider =
      riverexPoolProvider ??
      new RiverexPoolProvider(chainId);

    this.riverexQuoteProvider = riverexQuoteProvider ?? new RiverexQuoteProvider();

    if (riverexProvider) {
      this.riverexProvider = riverexProvider;
    } else {
      this.riverexProvider = new RiverexProvider(
        chainId
      );
    }

    this.riverexGasModelFactory =
      riverexGasModelFactory ?? new RiverexHeuristicGasModelFactory();


    // Initialize the Quoters.
    // Quoters are an abstraction encapsulating the business logic of fetching routes and quotes.

    this.riverexQuoter = new RiverexQuoter(
      this.riverexProvider,
      this.riverexPoolProvider,
      this.riverexQuoteProvider,
      this.riverexGasModelFactory,
      this.chainId,
    );
  }

  /**
   * @inheritdoc IRouter
   */
  public async route(
      amount: CurrencyAmount,
      quoteCurrency: Currency,
      tradeType: TradeType,
      swapConfig?: SwapOptions,
      partialRoutingConfig: Partial<AlphaRouterConfig> = {}
  ): Promise<SwapRoute | null> {
      const { currencyIn, currencyOut } = this.determineCurrencyInOutFromTradeType(tradeType, amount, quoteCurrency);

      const tokenIn = currencyIn.wrapped;
      const tokenOut = currencyOut.wrapped;

    metric.setProperty('chainId', this.chainId);
    metric.setProperty('pair', `${tokenIn.symbol}/${tokenOut.symbol}`);
    metric.setProperty('tokenIn', tokenIn.address);
    metric.setProperty('tokenOut', tokenOut.address);
    metric.setProperty('tradeType', tradeType === TradeType.EXACT_INPUT ? 'ExactIn' : 'ExactOut');

    metric.putMetric(
      `QuoteRequestedForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    const routingConfig: AlphaRouterConfig = _.merge(
      {},
      DEFAULT_ROUTING_CONFIG_BY_CHAIN(this.chainId),
      partialRoutingConfig
    );

    const gasPriceWei = await this.getGasPriceWei();
    const quoteToken = quoteCurrency.wrapped;

    // Create a Set to sanitize the protocols input, a Set of undefined becomes an empty set,
    // Then create an Array from the values of that Set.
    const protocols: Protocol[] = Array.from(new Set(routingConfig.protocols).values());

    const swapRouteFromChain = await this.getSwapRouteFromChain(
      amount,
      tokenIn,
      tokenOut,
      protocols,
      quoteToken,
      tradeType,
      routingConfig,
      gasPriceWei
    );

    let swapRouteRaw: BestSwapRoute | null;
    swapRouteRaw = swapRouteFromChain;

    if (!swapRouteRaw) {
      return null;
    }

    const {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      routes: routeAmounts,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
    } = swapRouteRaw;

    metric.putMetric(
      `QuoteFoundForChain${this.chainId}`,
      1,
      MetricLoggerUnit.Count
    );

    // Build Trade object that represents the optimal swap.

    let trade;

    let methodParameters: MethodParameters | undefined;

    // If user provided recipient, deadline etc. we also generate the calldata required to execute
    // the swap and return it too.
    if (swapConfig && trade) {
      methodParameters = buildSwapMethodParameters(
        trade,
        swapConfig,
        this.chainId
      );
    }

    let swapRoute: SwapRoute = {
      quote,
      quoteGasAdjusted,
      estimatedGasUsed,
      estimatedGasUsedQuoteToken,
      estimatedGasUsedUSD,
      gasPriceWei,
      route: routeAmounts,
      tradeType,
      methodParameters,
    };

    // if tron chain, change all addresses to base58
    if(isTronChain(this.chainId)) {
      swapRoute.route = swapRoute.route.map(rout => {
        return ({ ...rout, route: (
            ({
                ...rout.route,
                path: rout.route.path.map(path => ({ ...path, address: fromHex(path.address) })),
                pairs: rout.route.pairs.map(pair => ({ ...pair, address: fromHex(pair.address) })),
                input:{...rout.route.input, address: fromHex(rout.route.input.address)},
                output:{...rout.route.output, address: fromHex(rout.route.output.address)}
              }
            ) as RiverexRoute),
          tokenPath: (rout.tokenPath.map(path => ({
            ...path,
            address: fromHex(path.address)
          })))as Token[],
          poolAddresses: rout.poolAddresses.map(address => fromHex(address))
        })
      })
    }

    console.log(swapRoute.route)
    return swapRoute;
  }

  private async getSwapRouteFromChain(
    amount: CurrencyAmount,
    tokenIn: Token,
    tokenOut: Token,
    protocols: Protocol[],
    quoteToken: Token,
    tradeType: TradeType,
    routingConfig: AlphaRouterConfig,
    gasPriceWei: BigNumber
  ): Promise<BestSwapRoute | null> {
    // Generate our distribution of amounts, i.e. fractions of the input amount.
    // We will get quotes for fractions of the input amount for different routes, then
    // combine to generate split routes.
    const [percents, amounts] = this.getAmountDistribution(
      amount,
      routingConfig
    );

    const noProtocolsSpecified = protocols.length === 0;
    const riverdexProtocolSpecified = protocols.includes(Protocol.RIVERDEX);

    const quotePromises: Promise<GetQuotesResult>[] = [];

    // Maybe Quote riverdex - if riverdex is specified, or no protocol is specified
    if (riverdexProtocolSpecified || noProtocolsSpecified) {
      log.info({ protocols, tradeType }, 'Routing across Riverdex');
      quotePromises.push(
        this.riverexQuoter.getRoutesThenQuotes(
          tokenIn,
          tokenOut,
          amounts,
          percents,
          quoteToken,
          tradeType,
          routingConfig,
          undefined,
          gasPriceWei
        )
      );
    }

    const getQuotesResults = await Promise.all(quotePromises);

    const allRoutesWithValidQuotes: RouteWithValidQuote[] = [];
    const allCandidatePools: CandidatePoolsBySelectionCriteria[] = [];
    getQuotesResults.forEach((getQuoteResult) => {
      allRoutesWithValidQuotes.push(...getQuoteResult.routesWithValidQuotes);
      if (getQuoteResult.candidatePools) {
        allCandidatePools.push(getQuoteResult.candidatePools);
      }
    });

    if (allRoutesWithValidQuotes.length === 0) {
      log.info({ allRoutesWithValidQuotes }, 'Received no valid quotes');
      return null;
    }

    // Given all the quotes for all the amounts for all the routes, find the best combination.
    const bestSwapRoute = await getBestSwapRoute(
      amount,
      percents,
      allRoutesWithValidQuotes,
      tradeType,
      this.chainId,
      routingConfig,
    );

    return bestSwapRoute;
  }

  private determineCurrencyInOutFromTradeType(tradeType: TradeType, amount: CurrencyAmount, quoteCurrency: Currency) {
    if (tradeType === TradeType.EXACT_INPUT) {
      return {
        currencyIn: amount.currency,
        currencyOut: quoteCurrency
      };
    } else {
      return {
        currencyIn: quoteCurrency,
        currencyOut: amount.currency
      };
    }
  }

  private async getGasPriceWei(retryNumber: number = 2): Promise<BigNumber> {
    // Tron has fixed gas price
    if(isTronChain(this.chainId)){
      return BigNumber.from("1");
    }

    const config = {
      headers: {
        'APP_INTERNAL_AUTH': process.env.APP_INTERNAL_AUTH
      }
    };

    const gasPriceURL = process.env.GAS_PRICE_URL!.replace("{chainId}", this.chainId.toString()) as string;
    const timeout = new Timeout();

    try {
      const getGasPricePromise = axios.get(gasPriceURL, config);
      const timerPromise = timeout.set(TIMEOUT).then(() => {
        throw new Error(
          `Timed out getting gas price from api: ${timeout}`
        );
      });
      const response = await Promise.race([getGasPricePromise,timerPromise]);

      console.log(`gas price of chainId ${this.chainId}=`, response.data.data);
      return BigNumber.from(response.data.data);
    } catch(error) {
      console.log("retrying gas price fetch");
      if(retryNumber <= 1) {
        console.error("didn't get gas price");
        return BigNumber.from(0);
      }
      // If failed, wait for a second and then retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return await this.getGasPriceWei(retryNumber - 1);
    }
  }

  // Note multiplications here can result in a loss of precision in the amounts (e.g. taking 50% of 101)
  // This is reconcilled at the end of the algorithm by adding any lost precision to one of
  // the splits in the route.
  private getAmountDistribution(
    amount: CurrencyAmount,
    routingConfig: AlphaRouterConfig
  ): [number[], CurrencyAmount[]] {
    const { distributionPercent } = routingConfig;
    const percents = [];
    const amounts = [];

    for (let i = 1; i <= 100 / distributionPercent; i++) {
      percents.push(i * distributionPercent);
      amounts.push(amount.multiply(new Fraction(i * distributionPercent, 100)));
    }

    return [percents, amounts];
  }
}
