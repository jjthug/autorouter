import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import { get } from 'lodash';
import 'dotenv/config';

import { ChainId, log, NATIVE_NAMES_BY_ID, WRAPPED_NATIVE_CURRENCY } from '../../../../util';
import { CurrencyAmount } from '../../../../util/amounts';
import { RiverexRouteWithValidQuote } from '../../entities/route-with-valid-quote';
import { BuildRiverexGasModelFactoryType, IGasModel, IRiverexGasModelFactory, usdGasTokensByChain } from '../gas-model';
import { RiverexPair } from '../../entities/riverex-pool';
import axios from 'axios';
import { isTronChain } from '../../../../util/checkTron';
import { TIMEOUT } from '../../../../util/timeout_values';

// Constant cost for doing any swap regardless of pools.
export const BASE_SWAP_COST = BigNumber.from(process.env.BASE_SWAP_COST);
const BASE_SWAP_COST_TRON = BigNumber.from(process.env.BASE_SWAP_COST_TRON);

// Constant per extra hop in the route.
export const COST_PER_EXTRA_HOP = BigNumber.from(process.env.COST_PER_EXTRA_HOP);
const COST_PER_EXTRA_HOP_TRON = BigNumber.from(process.env.COST_PER_EXTRA_HOP_TRON);
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
                               token
                             }: BuildRiverexGasModelFactoryType): Promise<IGasModel<RiverexRouteWithValidQuote>> {
    if (token.equals(WRAPPED_NATIVE_CURRENCY[chainId]!)) {

      const usdPool: RiverexPair|null = await this.getHighestLiquidityUSDPool(
        chainId,
      );

      if(!usdPool){
        return {
          estimateGasCost: (routeWithValidQuote: RiverexRouteWithValidQuote) => {
            const { gasCostInEth, gasUse } = this.estimateGas(
              routeWithValidQuote,
              gasPriceWei,
              chainId
            );

            const gasCostInUSD = CurrencyAmount.fromRawAmount(
              token,
              '0'
            );

            return {
              gasEstimate: BigNumber.from(gasUse),
              gasCostInToken: gasCostInEth,
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

          // ethTokenPrice = 2000 USD/ETH
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
      token
    );

    if (!ethPool) {
      log.info(
        'Unable to find native pool with the quote token to produce gas adjusted costs.'
      );
    }

    const usdPool: RiverexPair|null = await this.getHighestLiquidityUSDPool(
      chainId
    );

    return {
      estimateGasCost: (routeWithValidQuote: RiverexRouteWithValidQuote) => {

        const {gasCostInEth, gasUse} = this.estimateGas(
          routeWithValidQuote,
          gasPriceWei,
          chainId
        );

        let gasCostInTermsOfUSD: CurrencyAmount;
        if(usdPool){

          const ethToken0USDPool =
            usdPool.token0.address == WRAPPED_NATIVE_CURRENCY[chainId]!.address;

          // price of USD in token, 1 USD = x token
          const ethTokenPriceUSDPool = ethToken0USDPool
            ? usdPool.token0Price
            : usdPool.token1Price;

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
            log.error(err)
            throw Error("Failed to compute USD gas price");
          }
        } else{
          gasCostInTermsOfUSD = CurrencyAmount.fromRawAmount(
            token,
            '0'
          );
        }

        if (!ethPool) {

          const gasCostInToken = CurrencyAmount.fromRawAmount(
            token,
            '0'
          );

          return {
            gasEstimate: gasUse,
            gasCostInToken: gasCostInToken,
            gasCostInUSD: gasCostInTermsOfUSD!,
          };

        }
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
            log.error(err)
            throw Error("eth price token issue");
          }

          return {
            gasEstimate: gasUse,
            gasCostInToken: gasCostInTermsOfQuoteToken,
            gasCostInUSD: gasCostInTermsOfUSD!,
          };
      },
    };
  }

  private estimateGas(
    routeWithValidQuote: RiverexRouteWithValidQuote,
    gasPriceWei: BigNumber,
    chainId: ChainId
  ) {
    const hops = routeWithValidQuote.route.pairs.length;
    const gasUse =isTronChain(chainId)?
      BASE_SWAP_COST_TRON.add(COST_PER_EXTRA_HOP_TRON.mul(hops-1)) :
      BASE_SWAP_COST.add(COST_PER_EXTRA_HOP.mul(hops - 1));

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
    retry: number = 1
  ): Promise<RiverexPair | null> {

    try {
      //api for token price

      let price='';

      const symbol = token.symbol;
      const address = token.address;

      if(symbol == undefined || address == undefined) return null;

      let url = (process.env.URL_FOR_TOKEN_NATIVE_PRICE_GENERIC!)
        .replace('{symbol}', symbol)
        .replace('{chainId}', chainId.toString())
        .replace('{address}', address)
        .replace('{native}',NATIVE_NAMES_BY_ID[chainId]![0]!);

      await axios.get(url, { timeout: TIMEOUT})
        .then(response => {
          // Handle the response data here
          console.log(`price of token ${token.symbol} in eth= `, response.data.price);
          price = response.data.price;
        })
        .catch(async _error => {
          // Handle any errors that occurred
          if (retry <= 1) {
            console.log(`didnt get price of token ${token.symbol} in native token`);
            return null;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          return await this.getEthPool(chainId, token, retry - 1);
        });

      console.log(`price of token ${symbol} = ${price}`)

      if(!price) return null;

      const weth = WRAPPED_NATIVE_CURRENCY[chainId]!;

      let reserve0 = (parseFloat(price) * 10 **(30) * 10 ** (weth.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')
      let reserve1 =(10 **(30) * 10 ** (token.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')

      const pool = new RiverexPair(
        '',
        '0',
        CurrencyAmount.fromRawAmount(weth, reserve0),
        CurrencyAmount.fromRawAmount(token, reserve1)
      );

      return pool;
    } catch(e){
      return null;
    }
  }

  private async getHighestLiquidityUSDPool(
    chainId: ChainId,
  ): Promise<RiverexPair | null> {
    try {
      //api for native price in usd
      let price = '';

      const symbol = get(NATIVE_NAMES_BY_ID, `${chainId}.0`, '');
      const address = get(NATIVE_NAMES_BY_ID, `${chainId}.2`, '');

      if (!symbol || !address) return null;

      const url = process.env.URL_FOR_NATIVE_USD_PRICE_GENERIC!
        .replace('{symbol}', symbol)
        .replace('{chainId}', chainId.toString())
        .replace('{address}', address);

      await axios.get(url,{ timeout: TIMEOUT})
        .then(response => {
          // Handle the response data here
          console.log(`price of native in usd= `, response.data.price);
          price = response.data.price;
        })
        .catch(_error => {
          // Handle any errors that occurred
          console.error("didnt get the price of native in usd");
          return null;
        });

      if (!price) return null;
      console.log(`price of native ${symbol} = ${price} USD`)

      let usdToken = usdGasTokensByChain[chainId]![0]!;
      let WNATIVEToken = WRAPPED_NATIVE_CURRENCY[chainId];

      let token0, token1: Token;

      token0 = new Token(chainId, usdToken.address, usdToken.decimals);
      token1 = new Token(chainId, WNATIVEToken.address, WNATIVEToken.decimals);

      let reserve0 = (parseFloat(price) * 10 ** (30) * 10 ** (usdToken.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')
      let reserve1 = (10 ** (30) * 10 ** (WNATIVEToken.decimals)).toLocaleString('fullwide', { maximumFractionDigits: 20 }).toString().replace(/,/g, '')

      return new RiverexPair(
        '',
        '0',
        CurrencyAmount.fromRawAmount(token0, reserve0),
        CurrencyAmount.fromRawAmount(token1, reserve1)
      );
    } catch(e){
      return null;
    }
  }
}
