import {BigNumber} from '@ethersproject/bignumber';
import {Token} from '@uniswap/sdk-core';
import _ from 'lodash';
import {gql, GraphQLClient} from 'graphql-request';
import 'dotenv/config'

import { ChainId, log, parseAmount, WRAPPED_NATIVE_CURRENCY } from '../../../../util';
import {CurrencyAmount} from '../../../../util/amounts';
import {RiverexRouteWithValidQuote,} from '../../entities/route-with-valid-quote';
import {BuildRiverexGasModelFactoryType, IGasModel, IRiverexGasModelFactory, usdGasTokensByChain,} from '../gas-model';
import {RawRiverexPool} from "../../../../providers";
import retry from 'async-retry';
import {RiverexPair} from '../../entities/riverex-pool';
import { URL_FOR_NATIVE_USD_PRICE } from '../../../../util/pricing';

// Constant cost for doing any swap regardless of pools.
export const BASE_SWAP_COST = BigNumber.from(process.env.BASE_SWAP_COST);

// Constant per extra hop in the route.
export const COST_PER_EXTRA_HOP = BigNumber.from(process.env.COST_PER_EXTRA_HOP);
/**
 * Computes a gas estimate for a riverex swap using heuristics.
 * Considers number of hops in the route and the typical base cost for a swap.
 *
 * We compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929. We would have to make a request for every swap we wanted to estimate.
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * Note, certain tokens e.g. rebasing/fee-on-transfer, may incur higher gas costs than
 * what we estimate here. This is because they run extra logic on token transfer.
 *
 * @export
 * @class RiverexHeuristicGasModelFactory
 */
export class RiverexHeuristicGasModelFactory extends IRiverexGasModelFactory {
  constructor() {
    super();
  }

  public async buildGasModel({
                               chainId,
                               gasPriceWei,
                               token,
                               rawPools
                             }: BuildRiverexGasModelFactoryType): Promise<IGasModel<RiverexRouteWithValidQuote>> {
    if (token.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {

      // todo if no usd pools in api list then get from subgraph
      const usdPool: RiverexPair|null = await this.getHighestLiquidityUSDPool(
        chainId,
        rawPools
      );

      if(!usdPool){
        return {
          // todo fix me
          estimateGasCost: (_routeWithValidQuote: RiverexRouteWithValidQuote) => {

            const gasCostInToken = CurrencyAmount.fromRawAmount(
              token,
              '0'
            );

            const gasCostInUSD = CurrencyAmount.fromRawAmount(
              token,
              '0'
            );

            return {
              gasEstimate: BigNumber.from("0"),
              gasCostInToken,
              gasCostInUSD,
            };
          },
        };
      }

      return {
        estimateGasCost: (routeWithValidQuote: RiverexRouteWithValidQuote) => {
          const { gasCostInEth, gasUse } = this.estimateGas(
            routeWithValidQuote,
            gasPriceWei,
            chainId
          );

          const ethToken0 =
            usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          const ethTokenPrice = ethToken0
            ? usdPool.token0Price
            : usdPool.token1Price;

          const gasCostInTermsOfUSD: CurrencyAmount = ethTokenPrice.quote(
            gasCostInEth
          ) as CurrencyAmount;

          return {
            gasEstimate: gasUse,
            gasCostInToken: gasCostInEth,
            gasCostInUSD: gasCostInTermsOfUSD,
          };
        },
      };
    }

    // If the quote token is not WETH, we convert the gas cost to be in terms of the quote token.
    // We do this by getting the highest liquidity <token>/ETH pool.
    // weth/token pool
    let ethPool: RiverexPair | null = await this.getEthPool(
      chainId,
      token,
      rawPools!,
    );

    // pool with token/USD
    const usdTokenPool: RiverexPair | null = await this.getUSDTokenPool(
      chainId,
      token,
      rawPools!,
    );

    if (!ethPool) {
      log.info(
        'Unable to find ETH pool with the quote token to produce gas adjusted costs.'
      );
    }

    if (!usdTokenPool) {
      log.info(
        'Unable to find USD pool with the quote token to produce gas adjusted costs. Route will not account for gas.'
      );
    }

    const usdPool: RiverexPair|null = await this.getHighestLiquidityUSDPool(
      chainId,
      rawPools,
      token.address
    );

    const usdTokenAddresses = usdGasTokensByChain[chainId]!.map(usdToken=> usdToken.address)
    const tokenExistsInUsdAddresses = usdTokenAddresses.includes(token.address)
    if (tokenExistsInUsdAddresses && usdPool) {
      ethPool = usdPool;

      let usdReserve = token.decimals < usdPool.token0.decimals ?
        (parseFloat(usdPool.reserve0.toExact())/10**(usdPool.token0.decimals - token.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')
        :(parseFloat(usdPool.reserve0.toExact())*10**(usdPool.token0.decimals - token.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')

      ethPool = new RiverexPair(
        usdPool.fee.toString(),
        CurrencyAmount.fromRawAmount(new Token(chainId, token.address, (token.decimals)), usdReserve),
        CurrencyAmount.fromRawAmount(new Token(chainId, usdPool.token1.address, (usdPool.token1.decimals)), usdPool.reserve1.toExact())
      )
    }

    if(!usdPool){
      return {
        // @ts-ignore
        estimateGasCost: (routeWithValidQuote: RiverexRouteWithValidQuote) => {

          const gasCostInToken = CurrencyAmount.fromRawAmount(
            token,
            '0'
          );

          const gasCostInUSD = CurrencyAmount.fromRawAmount(
            token,
            '0'
          );

          return {
            gasEstimate: BigNumber.from("0"),
            gasCostInToken,
            gasCostInUSD,
          };
        },
      };
    }

    return {
      estimateGasCost: (routeWithValidQuote: RiverexRouteWithValidQuote) => {
        const usdToken =
          usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address
            ? usdPool.token1
            : usdPool.token0;

        const {gasCostInEth, gasUse} = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          chainId
        );

        if (ethPool) {
          const ethToken0 =
            (ethPool as RiverexPair).token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          const ethTokenPrice = ethToken0
            ? ethPool.token0Price
            : ethPool.token1Price;

          let gasCostInTermsOfQuoteToken: CurrencyAmount;
          try {
            gasCostInTermsOfQuoteToken = ethTokenPrice.quote(
              gasCostInEth
            ) as CurrencyAmount;
          } catch (err) {
            log.error(
              {
                ethTokenPriceBase: ethTokenPrice.baseCurrency,
                ethTokenPriceQuote: ethTokenPrice.quoteCurrency,
                gasCostInEth: gasCostInEth.currency,
              },
              'Debug eth price token issue'
            );
            throw err;
          }

          const ethToken0USDPool =
            usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          // price of USD in token, 1 USD = x token
          const ethTokenPriceUSDPool = ethToken0USDPool
            ? usdPool.token0Price
            : usdPool.token1Price;

          let gasCostInTermsOfUSD: CurrencyAmount;
          try {
            gasCostInTermsOfUSD = ethTokenPriceUSDPool.quote(
              gasCostInEth
            ) as CurrencyAmount;
          } catch (err) {
            log.error(
              {
                usdT1: usdPool.token0.symbol,
                usdT2: usdPool.token1.symbol,
                gasCostInEthToken: gasCostInEth.currency.symbol,
              },
              'Failed to compute USD gas price'
            );
            throw err;
          }

          console.log({gasCostInTermsOfUSD});

          return {
            gasEstimate: gasUse,
            gasCostInToken: gasCostInTermsOfQuoteToken,
            gasCostInUSD: gasCostInTermsOfUSD!,
          };
        }
        // if no eth/usd pool then try to estimate the gas using usd/weth and token/weth pools
        if (!usdTokenPool) {
          return {
            gasEstimate: gasUse,
            gasCostInToken: CurrencyAmount.fromRawAmount(token, 0),
            gasCostInUSD: CurrencyAmount.fromRawAmount(usdToken, 0),
          };
        } else {

          const usdTokenPoolToken0 =
            usdPool.token0.address == token.address;

          const tokenUSDPoolUSDDecimals = usdTokenPoolToken0? usdPool.token1.decimals : usdPool.token0.decimals;
          // token price in USD
          const tokenUsdPrice = usdTokenPoolToken0
            ? usdTokenPool?.token1Price
            : usdTokenPool?.token0Price;

          const usdETHPoolToken0 =
            usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          const usdETHPoolUSDDecimals = usdTokenPoolToken0? usdPool.token1.decimals : usdPool.token0.decimals;

          // ETH price in USD
          const ethUsdPrice = usdETHPoolToken0
            ? usdPool.token0Price
            : usdPool.token1Price;

          // gas cost in terms of token
          let gasCostInTermsOfQuoteToken: CurrencyAmount;

          let ethDecimals = usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address ? usdPool.token0.decimals : usdPool.token1.decimals

          // todo consider decimals of ethUsdPrice and tokenUsdPrice in ethDecimals
          const gasCostInTermsOfQuoteTokenValue = (parseInt(gasCostInEth.numerator.toString()) * (parseFloat(ethUsdPrice.toFixed())/(parseFloat(tokenUsdPrice!.toFixed()))))/10**(ethDecimals+usdETHPoolUSDDecimals-tokenUSDPoolUSDDecimals)
          gasCostInTermsOfQuoteToken = parseAmount(gasCostInTermsOfQuoteTokenValue.toString(),token)

          let gasCostInTermsOfUSD: CurrencyAmount;
          try {
            gasCostInTermsOfUSD = ethUsdPrice.quote(
              gasCostInEth
            ) as CurrencyAmount;
          } catch (err) {
            log.error(
              {
                usdT1: usdPool.token0.symbol,
                usdT2: usdPool.token1.symbol,
                gasCostInEthToken: gasCostInEth.currency.symbol,
              },
              'Failed to compute USD gas price'
            );
            throw err;
          }
          log.info("gasCostInTermsOfUSD=",gasCostInTermsOfUSD)


          return {
            gasEstimate: gasUse,
            gasCostInToken: gasCostInTermsOfQuoteToken,
            gasCostInUSD: gasCostInTermsOfUSD!,
          };
        }
      },
    };
  }

  private estimateGas(
    routeWithValidQuote: RiverexRouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId
  ) {
    const hops = routeWithValidQuote.route.pairs.length;
    const gasUse = BASE_SWAP_COST.add(COST_PER_EXTRA_HOP.mul(hops - 1));

    const totalGasCostWei = gasPriceWei.mul(gasUse);

    const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

    const gasCostInEth = CurrencyAmount.fromRawAmount(
      weth,
      totalGasCostWei.toString()
    );

    return { gasCostInEth, gasUse };
  }

  private async getEthPool(
    chainId: ChainId,
    token: Token,
    rawPools: RawRiverexPool[]
  ): Promise<RiverexPair | null> {
    const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;
    const pool = rawPools!.filter(rawPool =>{
      return (rawPool.firstToken.address == token.address && rawPool.secondToken.address == weth.address ||
        rawPool.secondToken.address == token.address && rawPool.firstToken.address == weth.address)
    })[0]

    if (!pool || parseInt(pool.reserve0) == 0 || parseInt(pool.reserve1) == 0) {
      log.error(
        {
          weth,
          token,
          reserve0: pool?.reserve0,
          reserve1: pool?.reserve1,
        },
        `Could not find a valid WETH pool with ${token.symbol} for computing gas costs.`
      );

      return null;
    }

    return new RiverexPair(
      pool.fee.toString(),
      CurrencyAmount.fromRawAmount(new Token(chainId, pool.firstToken.address, (pool.firstToken.decimals)), pool.reserve0),
      CurrencyAmount.fromRawAmount(new Token(chainId, pool.secondToken.address, (pool.secondToken.decimals)), pool.reserve1)
    )
  }

  private async getHighestLiquidityUSDPool(
    chainId: ChainId,
    rawPools?: RawRiverexPool[],
    tokenAddress?: string,
  ): Promise<RiverexPair | null> {
    const usdTokens = usdGasTokensByChain[chainId];

    if (!usdTokens) {
      throw new Error(
        `Could not find a USD token for computing gas costs on ${chainId}`
      );
    }

    const usdTokenAddresses = usdTokens.map(usdToken=> usdToken.address.toLowerCase())
    const isTokenUSD = usdTokenAddresses.includes(tokenAddress?.toLowerCase() || "")


    if (!WRAPPED_NATIVE_CURRENCY[chainId]){
      throw new Error(`No wrapped native for this chainId ${chainId}`)
    }

    let wrappedNativeTokenAddress = WRAPPED_NATIVE_CURRENCY[chainId].address;

    let usdTokenPools: RiverexPair[] = []
    if (usdTokenAddresses!.length > 0 && WRAPPED_NATIVE_CURRENCY[chainId]) {
      usdTokenPools = rawPools!
        .filter(pool => {
          const {firstToken, secondToken} = pool;
          return ((usdTokenAddresses.includes(firstToken.address) && wrappedNativeTokenAddress == secondToken.address)
            || (usdTokenAddresses.includes(secondToken.address) && wrappedNativeTokenAddress == firstToken.address));
        }).map(usdTokenPoolRaw =>{ return new RiverexPair(
            usdTokenPoolRaw.fee.toString(),
            CurrencyAmount.fromRawAmount(new Token(chainId, isTokenUSD && usdTokenAddresses.includes(usdTokenPoolRaw.firstToken.address.toLowerCase())? tokenAddress! : usdTokenPoolRaw.firstToken.address, (usdTokenPoolRaw.firstToken.decimals), usdTokenPoolRaw.firstToken.symbol), usdTokenPoolRaw.reserve0),
            CurrencyAmount.fromRawAmount(new Token(chainId, isTokenUSD && usdTokenAddresses.includes(usdTokenPoolRaw.secondToken.address.toLowerCase())? tokenAddress! : usdTokenPoolRaw.secondToken.address, (usdTokenPoolRaw.secondToken.decimals), usdTokenPoolRaw.firstToken.symbol), usdTokenPoolRaw.reserve1),
          )}
        );
    }

    const USD_POOL_BY_CHAIN: { [chainId in ChainId]?: string } = {
      [ChainId.MAINNET]:
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"
    };

    if (usdTokenPools.length > 0) {

      return _.maxBy(usdTokenPools, (pool) => {
        if (pool.token0.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {
          return parseFloat(pool.reserve0.toSignificant(2));
        } else {
          return parseFloat(pool.reserve1.toSignificant(2));
        }
      }) as RiverexPair;
    }
    else
      //URL_FOR_NATIVE_USD_PRICE[chainId]
    if (URL_FOR_NATIVE_USD_PRICE[chainId]) {

      // todo implement api call
      //api for native price
      let price = "1900";

      let usdToken = usdGasTokensByChain[chainId]![0]!;
      let WNATIVEToken = WRAPPED_NATIVE_CURRENCY[chainId];

      let token0, token1: Token;

      token0 = new Token(chainId, usdToken.address, usdToken.decimals);
      token1 = new Token(chainId, WNATIVEToken.address, WNATIVEToken.decimals);

      let reserve0 = (parseFloat(price) * 10 **(30) * 10 ** (usdToken.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')
      let reserve1 =(10 **(30) * 10 ** (WNATIVEToken.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')

      const pool = new RiverexPair(
        '0',
        CurrencyAmount.fromRawAmount(token0, reserve0),
        CurrencyAmount.fromRawAmount(token1, reserve1)
      );

      return pool;
    }
    //USD_POOL_BY_CHAIN[chainId]
    else if (USD_POOL_BY_CHAIN[chainId] && false) {
      log.error(
        `Could not find a USD/NATIVE pool for computing gas costs.`
      );

      type RawV2SubgraphPool = {
        id: string;
        token0: {
          symbol: string;
          id: string;
          decimals: string;
        };
        token1: {
          symbol: string;
          id: string;
          decimals: string;
        };
        totalSupply: string;
        trackedReserveETH: string;
        reserveUSD: string;
        reserve0: string;
        reserve1: string;
      };

      log.info('trying to fetch USD/NATIVE pool from Uniswap v2');

      // todo check
      const SUBGRAPH_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
        [ChainId.MAINNET]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/uniswapv2',
        [ChainId.RINKEBY]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v2-rinkeby',
        [ChainId.OPTIMISM]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
        [ChainId.ARBITRUM_ONE]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
        [ChainId.POLYGON]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
        [ChainId.CELO]:
          'https://api.thegraph.com/subgraphs/name/jesse-sawa/uniswap-celo',
        [ChainId.GÖRLI]:
          'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-gorli',
        [ChainId.BSC]:
          'https://api.thegraph.com/subgraphs/name/ilyamk/uniswap-v3---bnb-chain'
      };

      let pairs: RawV2SubgraphPool[] = [];
      let retries = 3;
      let url = SUBGRAPH_URL_BY_CHAIN[chainId] || '';

      const pairId = USD_POOL_BY_CHAIN[chainId];

      const query2 = gql`{
          query GetPair($pairId: ID!) {
            pair(id: $pairId){
                id
                token0 {
                    id
                    symbol
                    decimals
                }
                token1 {
                    id
                    symbol
                    decimals
                }
                reserveUSD
                volumeUSD
                reserve0
                reserve1
            }
        } 
      }
      `;

      // let pools_usd_weth_uni: RawRiverexCompatPool[] = [];

      // get pool from uniswap
      const client = new GraphQLClient(url);
      await retry(
        async () => {
          const pairsResult = await client.request<{
            pair: RawV2SubgraphPool;
          }>(query2, {pairId});

          pairs = pairs.concat(pairsResult.pair);
        },
        {
          retries: retries,
          onRetry: (err, retry) => {
            log.info(
              { err },
              `Failed request for page of pools from subgraph. Retry attempt: ${retry}`
            );
          }
        }
      );

      let token0, token1: Token;

      if (isTokenUSD) {
        token0 = new Token(chainId, usdTokenAddresses.includes(pairs[0]!.token0.id) ? tokenAddress! : pairs[0]!.token0.id, parseInt(pairs[0]!.token0.decimals), pairs[0]!.token0.symbol); // reserve is returned without decimals
        token1 = new Token(chainId, usdTokenAddresses.includes(pairs[0]!.token1.id) ? tokenAddress! : pairs[0]!.token1.id, parseInt(pairs[0]!.token1.decimals), pairs[0]!.token1.symbol);
      } else {
        token0 = new Token(chainId, pairs[0]!.token0.id, parseInt(pairs[0]!.token0.decimals), pairs[0]!.token0.symbol); // reserve is returned without decimals
        token1 = new Token(chainId, pairs[0]!.token1.id, parseInt(pairs[0]!.token1.decimals), pairs[0]!.token1.symbol);
      }

      // @ts-ignore
      let reserve0 = (parseFloat(pairs[0]!.reserve0) * 10 ** (pairs[0]!.token0.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '');
      // @ts-ignore
      let reserve1 = (parseFloat(pairs[0]!.reserve1) * 10 ** (pairs[0]!.token1.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '');

      const pool = new RiverexPair(
        '300',
        CurrencyAmount.fromRawAmount(token0, reserve0),
        CurrencyAmount.fromRawAmount(token1, reserve1)
      );

      return pool;
      // throw new Error(`Can't find USD/WETH pool for computing gas costs.`);
    }
    else {
      return null;
    }
  }

  private async getUSDTokenPool(chainId: ChainId, token: Token, rawPools: RawRiverexPool[]): Promise<RiverexPair | null> {

    const usdTokens = usdGasTokensByChain[chainId];

    if (!usdTokens) {
      throw new Error(
        `Could not find a USD token for computing gas costs on ${chainId}`
      );
    }

    const usdTokenAddresses = usdTokens.map(usdToken=> usdToken.address)

    let usdTokenPools: RiverexPair[] = []
    usdTokenPools = rawPools!
      .filter(pool => {
        const {firstToken, secondToken} = pool;
        return ((usdTokenAddresses.includes(firstToken.address) && token.address == secondToken.address)
          || (usdTokenAddresses.includes(secondToken.address) && token.address == firstToken.address));
      }).map(usdTokenPoolRaw =>{ return new RiverexPair(
          usdTokenPoolRaw.fee.toString(),
          CurrencyAmount.fromRawAmount(new Token(chainId, usdTokenPoolRaw.firstToken.address, usdTokenPoolRaw.firstToken.decimals, usdTokenPoolRaw.firstToken.symbol), usdTokenPoolRaw.reserve0),
          CurrencyAmount.fromRawAmount(new Token(chainId, usdTokenPoolRaw.secondToken.address, usdTokenPoolRaw.secondToken.decimals, usdTokenPoolRaw.secondToken.symbol), usdTokenPoolRaw.reserve1),
        )}
      );

// todo use max by reserve
    return usdTokenPools[0] || null;
  }
}
