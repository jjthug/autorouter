import { BigNumber } from '@ethersproject/bignumber';
import {Token, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import {
  IRiverexQuoteProvider,
  IRiverexPoolProvider, RawRiverexPool
} from '../../../providers';
import { ChainId, CurrencyAmount, log, metric, MetricLoggerUnit, routeToString } from '../../../util';
import {RiverexRoute} from '../../router';
import { AlphaRouterConfig } from '../alpha-router';
import {RiverexRouteWithValidQuote} from '../entities';
import {
  computeAllRiverexRoutes,
} from '../functions/compute-all-routes';
import {
  CandidatePoolsBySelectionCriteria,
  getRiverdexCandidatePools,
} from '../functions/get-candidate-pools';
import { IGasModel, IRiverexGasModelFactory} from '../gas-models';

import { BaseQuoter } from './base-quoter';
import { GetQuotesResult } from './model/results/get-quotes-result';
import {GetRoutesResult} from "./model";
import {IRiverexProvider} from "../../../providers/riverdex/riverex-provider";

export class RiverexQuoter extends BaseQuoter<RiverexRoute> {
  protected riverexProvider: IRiverexProvider;
  protected riverexPoolProvider: IRiverexPoolProvider;
  protected riverexQuoteProvider: IRiverexQuoteProvider;
  protected riverexGasModelFactory: IRiverexGasModelFactory;

  constructor(
    riverexProvider: IRiverexProvider,
    riverexPoolProvider: IRiverexPoolProvider,
    riverexQuoteProvider: IRiverexQuoteProvider,
    riverexGasModelFactory: IRiverexGasModelFactory,
    chainId: ChainId,
  ) {
    super(chainId);
    this.riverexProvider = riverexProvider;
    this.riverexPoolProvider = riverexPoolProvider;
    this.riverexQuoteProvider = riverexQuoteProvider;
    this.riverexGasModelFactory = riverexGasModelFactory;
  }

  protected async getRoutes(
    tokenIn: Token,
    tokenOut: Token,
    routingConfig: AlphaRouterConfig
  ): Promise<GetRoutesResult<RiverexRoute>> {
    // Fetch all the pools that we will consider routing via. There are thousands
    // of pools, so we filter them to a set of candidate pools that we expect will
    // result in good prices.
    const { poolAccessor, candidatePools , riverexPoolsRawTokenWithUSD} = await getRiverdexCandidatePools({
      tokenIn,
      tokenOut,
      poolProvider: this.riverexPoolProvider,
      riverexProvider: this.riverexProvider,
      routingConfig,
      chainId: this.chainId,
    });
    const pools = poolAccessor.getAllPools();

    // Given all our candidate pools, compute all the possible ways to route from tokenIn to tokenOut.
    const { maxSwapsPerPath } = routingConfig;
    const routes = computeAllRiverexRoutes(
      tokenIn,
      tokenOut,
      pools,
      maxSwapsPerPath
    );

    return {
      routes,
      rawPools: riverexPoolsRawTokenWithUSD,
      candidatePools,
    };
  }

  public async getQuotes(
    routes: RiverexRoute[],
    amounts: CurrencyAmount[],
    percents: number[],
    quoteToken: Token,
    tradeType: TradeType,
    _routingConfig: AlphaRouterConfig,
    candidatePools?: CandidatePoolsBySelectionCriteria,
    _gasModel?: IGasModel<RiverexRouteWithValidQuote>,
    gasPriceWei?: BigNumber,
    _rawPools?: RawRiverexPool[]
  ): Promise<GetQuotesResult> {
    log.info('Starting to get Riverex quotes');
    if (gasPriceWei === undefined) {
      throw new Error('GasPriceWei for RiverexRoutes is required to getQuotes');
    }
    if (routes.length == 0) {
      return { routesWithValidQuotes: [], candidatePools };
    }

    // For all our routes, and all the fractional amounts, fetch quotes on-chain.
    const quoteFn =
      tradeType == TradeType.EXACT_INPUT
        ? this.riverexQuoteProvider.getQuotesManyExactIn.bind(this.riverexQuoteProvider)
        : this.riverexQuoteProvider.getQuotesManyExactOut.bind(this.riverexQuoteProvider);

    const beforeQuotes = Date.now();

    log.info(
      `Getting quotes for Riverex for ${routes.length} routes with ${amounts.length} amounts per route.`
    );
    const { routesWithQuotes } = await quoteFn(amounts, routes);

    const riverexGasModel = await this.riverexGasModelFactory.buildGasModel({
      chainId: this.chainId,
      gasPriceWei,
      token: quoteToken
    });

    metric.putMetric(
      'RiverexQuotesLoad',
      Date.now() - beforeQuotes,
      MetricLoggerUnit.Milliseconds
    );

    metric.putMetric(
      'RiverexQuotesFetched',
      _(routesWithQuotes)
        .map(([, quotes]) => quotes.length)
        .sum(),
      MetricLoggerUnit.Count
    );

    const routesWithValidQuotes = [];

    for (const routeWithQuote of routesWithQuotes) {
      const [route, quotes] = routeWithQuote;

      for (let i = 0; i < quotes.length; i++) {
        const percent = percents[i]!;
        const amountQuote = quotes[i]!;
        const { quote, amount } = amountQuote;

        if (!quote) {
          log.debug(
            {
              route: routeToString(route),
              amountQuote,
            },
            'Dropping a null riverex quote for route.'
          );
          continue;
        }

        const routeWithValidQuote = new RiverexRouteWithValidQuote({
          route,
          rawQuote: quote,
          amount,
          percent,
          gasModel: riverexGasModel,
          quoteToken,
          tradeType
        });

        routesWithValidQuotes.push(routeWithValidQuote);
      }
    }

    return {
      routesWithValidQuotes,
      candidatePools
    };
  }
}
