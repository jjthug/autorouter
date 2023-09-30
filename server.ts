import express, { Request, Response } from 'express';
import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { Protocol } from './src';
import * as ar from './src/routers/alpha-router/alpha-router';
import * as ethers from 'ethers';
import JSBI from 'jsbi';
import { RiverexRouteWithValidQuote } from './build/main';

require('dotenv').config()
const period = process.env.ROUTE_CACHE_PERIOD;

export const CHAIN_ID_TO_RPC = (id: number): string => {
  switch (id) {
    case 1:
      return String(process.env.JSON_RPC_PROVIDER_MAINNET);
    case 137:
      return String(process.env.JSON_RPC_PROVIDER_POLYGON);
    case 56:
      return String(process.env.JSON_RPC_PROVIDER_BINANCE);
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

const app = express();
app.use(express.json());

interface TokenReq {
  address: string;
  decimals: number;
  symbol?:string;
}

interface BestRouteRequest {
  chainId: number;
  rpc?: string;
  tradeType?: TradeType;
  Protocol?: Protocol;
  InputAmount: string;
  tokenIn: TokenReq;
  tokenOut: TokenReq;
  maxSwapsPerPath?: number;
  maxSplits?: number;
}

interface BestRouteResponse{
  route:  RiverexRouteWithValidQuote[] | undefined;
  quote: string|undefined;
  quoteGasAdjusted: string|undefined;
  estimatedGasUsedUSD: string|undefined;
}

app.get("/getBestRoute", async (req: Request, res: Response) => {
  try {
    const chainId = Number(req.query.chainId);
    const inputAmount = String(req.query.InputAmount);
    const tokenInAddress = String(req.query.tokenInAddress);
    const tokenInDecimals = Number(req.query.tokenInDecimals);
    const tokenOutAddress = String(req.query.tokenOutAddress);
    const tokenOutDecimals = Number(req.query.tokenOutDecimals);
    const maxSplits = Number(req.query.maxSplits || undefined);
    const maxSwapsPerPath = Number(req.query.maxSwapsPerPath || undefined);

    const data: BestRouteRequest = {
      chainId,
      InputAmount: inputAmount,
      tokenIn: { address: tokenInAddress, decimals: tokenInDecimals },
      tokenOut: { address: tokenOutAddress, decimals: tokenOutDecimals },
      maxSplits: maxSplits || undefined,
      maxSwapsPerPath: maxSwapsPerPath || undefined
    };

    const result = await getBestRoute(data);
    res.set('Cache-control', `public, max-age=${period}`)
    res.json(result);
  } catch (e) {
    console.error("Error in /getBestRoute:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(process.env.SERVER_PORT, () => {
  console.log(`Server running on port ${process.env.SERVER_PORT}`);
});

async function getBestRoute(data: BestRouteRequest) : Promise<BestRouteResponse> {
  const chainId = data.chainId

  const inputToken = new Token(chainId, data.tokenIn.address, data.tokenIn.decimals, data.tokenIn.symbol)
  // this is also the quote token
  const outputToken = new Token(chainId, data.tokenOut.address, data.tokenOut.decimals, data.tokenOut.symbol)

  const keyPrice = data.InputAmount
  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, JSBI.BigInt(keyPrice))

  const router = new ar.AlphaRouter({
    chainId: chainId,
    provider: new ethers.providers.JsonRpcProvider(CHAIN_ID_TO_RPC(chainId)),
  })

  // call router
  const route = await router.route(
    inputAmount,
    outputToken,
    // EXACT_INPUT => we provide input value, we get output value
    data.tradeType || TradeType.EXACT_INPUT,
    undefined,
    {
      protocols:[data.Protocol || Protocol.RIVERDEX],
      maxSwapsPerPath: data.maxSwapsPerPath,
      maxSplits: data.maxSplits
    }
  )

  return {
    estimatedGasUsedUSD: route?.estimatedGasUsedUSD.toFixed(2), quote: route?.quote.toFixed(2), quoteGasAdjusted: route?.quoteGasAdjusted.toFixed(2), route: route?.route as unknown as RiverexRouteWithValidQuote[]
  }
}