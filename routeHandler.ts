import {CurrencyAmount, Token, TradeType} from '@uniswap/sdk-core';
import {Protocol, RiverexRoute, RiverexRouteWithValidQuote} from './src';
import * as ar from './src/routers/alpha-router/alpha-router';
import JSBI from 'jsbi';
import {isTronChain} from './src/util/checkTron';

const { toHex } = require('tron-format-address')

export interface TokenReq {
  address: string;
  decimals: number;
  symbol?: string;
}

export interface BestRouteRequest {
  chainId: number;
  rpc?: string;
  tradeType: TradeType;
  Protocol?: Protocol;
  InputAmount: string;
  tokenIn: TokenReq;
  tokenOut: TokenReq;
  maxSwapsPerPath?: number;
  maxSplits?: number;
}

interface BestRouteResponseRoute {
  protocol: string;
  route: RiverexRoute;
  amountParsed: string | undefined;
  quoteParsed: string | undefined;
  tokenPath: Token[];
  percent: number;
  poolAddresses: string[];
}

export interface BestRouteResponse {
  route: BestRouteResponseRoute[] | undefined;
  quote: string | undefined;
  quoteGasAdjusted: string | undefined;
  estimatedGasUsedUSD: string | undefined;
  tradeType: string;
  inputAmount: string;
}

export async function getBestRoute(data: BestRouteRequest): Promise<BestRouteResponse> {
  const chainId = data.chainId;
  let inputToken, quoteToken;
  const tradeType = data.tradeType;

  if (isTronChain(chainId)){
    data.tokenIn.address=toHex(data.tokenIn.address)
    data.tokenOut.address=toHex(data.tokenOut.address)
  }

  if (tradeType == TradeType.EXACT_INPUT) {
    inputToken = new Token(chainId, data.tokenIn.address, data.tokenIn.decimals, data.tokenIn.symbol);
    quoteToken = new Token(chainId, data.tokenOut.address, data.tokenOut.decimals, data.tokenOut.symbol);
  } else {
    inputToken = new Token(chainId, data.tokenOut.address, data.tokenOut.decimals, data.tokenOut.symbol);
    quoteToken = new Token(chainId, data.tokenIn.address, data.tokenIn.decimals, data.tokenIn.symbol);
  }

  const amount = CurrencyAmount.fromRawAmount(inputToken, JSBI.BigInt(data.InputAmount));

  const router = new ar.AlphaRouter({
    chainId: chainId
  });

  const route = await router.route(
    amount,
    quoteToken,
    data.tradeType,
    undefined,
    {
      protocols: [Protocol.RIVERDEX],
      maxSwapsPerPath: data.maxSwapsPerPath,
      maxSplits: data.maxSplits
    }
  );

  for (let rout of (route?.route || [])) {
    rout.amountParsed = rout.amount.multiply(10 ** (rout.amount.currency.decimals)).toFixed(0)
    console.log(rout.amount.multiply(10 ** (rout.amount.currency.decimals)).toExact());
    rout.quoteParsed = rout.rawQuote.toString();
  }

  let amountIn=BigInt(0);

  if(route && route.route && route.route.length > 0) {
    for (let i = 0; i < route.route.length; i++) {
      amountIn += BigInt(route.route[i]!.amountParsed!)
    }
  }

  return {
    estimatedGasUsedUSD: route?.estimatedGasUsedUSD ? route.estimatedGasUsedUSD.toFixed(route.estimatedGasUsedUSD.currency.decimals) : undefined,
    quote: route?.quote ? route.quote.toFixed(quoteToken.decimals) : undefined,
    quoteGasAdjusted: route?.quoteGasAdjusted ? route.quoteGasAdjusted.toFixed(quoteToken.decimals) : undefined,
    tradeType: (route?.tradeType == TradeType.EXACT_INPUT) ? "EXACT_IN" : "EXACT_OUT",
    inputAmount: amountIn.toString(),
    route: route?.route.map((rout: RiverexRouteWithValidQuote) => ({
      protocol: rout.protocol,
      route: rout.route,
      amountParsed: rout.amountParsed,
      quoteParsed: rout.quoteParsed,
      tokenPath: rout.tokenPath,
      percent: rout.percent,
      poolAddresses: rout.poolAddresses
    }))
  };
}
