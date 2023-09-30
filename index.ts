import * as ar from "./src/routers/alpha-router/alpha-router"
import * as  ethers from "ethers"
import { Token, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
// import { encodeRouteToPath } from '@uniswap/v3-sdk'
import { nativeOnChain } from './src/util/chains'
// import {V3Route} from "/Users/jossy/WebstormProjects/autorouter_uni/build/main/routers/router";
import JSBI from "jsbi";
import { Protocol }  from './src/util';

// parse tokens
let NMR="0x1776e1F26f98b1A5dF9cD347953a26dd3Cb46671"
let ASM="0x2565ae0385659badCada1031DB704442E1b69982"
let WETH="0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
let WBTC="0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
let TUSD="0xdAC17F958D2ee523a2206206994597C13D831ec7"
let THETA="0x3883f5e181fccaF8410FA61e12b59BAd963fb645"
let HPO="0xa0ED3C520dC0632657AD2EaaF19E26C4fD431a84"
let BUSD="0x4Fabb145d64652a948d72533023f6E7A623C7C53"
let WELLE="0x1376a81fe3eE7D0e431f1Ac24286b00f3CCf44e7"
let AAVE="0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9"
const getTokens = (chainId:number) => ({
  native: nativeOnChain(chainId),
  nmr: new Token(chainId, NMR, 18, 'NMR'),
  asm: new Token(chainId, ASM, 18, 'ASM'),
  weth: new Token(chainId, WETH, 18, 'WETH'),
  wbtc: new Token(chainId, WBTC, 18, 'WBTC'),
  tusd: new Token(chainId, TUSD, 18, 'TUSD'),
  theta: new Token(chainId, THETA, 18, 'THETA'),
  hpo: new Token(chainId, HPO, 18, "HPO"),
  busd: new Token(chainId, BUSD, 18, "BUSD"),
  aave: new Token(chainId, AAVE, 18, "AAVE"),
  welle: new Token(chainId, WELLE, 18, "WELLE")
})
const main = async () => {

  console.log(Protocol.RIVERDEX)

  const chainId = 1
  const router = new ar.AlphaRouter({
    chainId,
    provider: new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_PROVIDER),
  })

  console.log(router)
  const tokens = getTokens(chainId)
  const tokenIn = tokens.aave
  // @ts-ignore
  const tokenOut = tokens.welle
  const keyPrice = ethers.utils.parseEther('100')
  // const signer="0x372837e1a161d8EBd9985997709ccaC727a79798"
  const inputAmount = CurrencyAmount.fromRawAmount(tokenIn, JSBI.BigInt(keyPrice))

  // call router
  const route = await router.route(
    inputAmount,
    tokenOut,
    // EXACT_INPUT => we provide input value, we get output value
    TradeType.EXACT_INPUT,
    undefined,
    {
      protocols:[Protocol.RIVERDEX]
    }
  )

  // show results
  // const bestRoute:V2Route = route?.route[0]?.route as V2Route
  // console.log(route?.route[0]?.route)

  // parse path
  // const path = encodeRouteToPath(bestRoute, true)
  // console.log(bestRoute)
  // console.log(path)

  // log some prices
  console.log("****************************************************")
  console.log(route?.route)
  console.log(route?.route.length)
  console.log(`Quote Exact Out: ${route?.quote.toFixed(2)}`);
  console.log(`Gas Adjusted Quote Out: ${route?.quoteGasAdjusted.toFixed(2)}`);
  console.log(`Gas Used USD: ${route?.estimatedGasUsedUSD.toFixed(6)}`);
}

main()