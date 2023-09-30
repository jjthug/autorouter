import { Token } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import axios from 'axios';

import { ChainId, WRAPPED_NATIVE_CURRENCY } from '../../util/chains';
import { log } from '../../util/log';
import { ProviderConfig } from '../provider';
import { usdGasTokensByChain } from '../../routers';
import BigNumber from 'bignumber.js';

const { toHex } = require('tron-format-address')

export interface RiverexPool {
  id: string;
  token0: {
    id: string;
  };
  token1: {
    id: string;
  };
  fee: string;
  reserve: number;
  reserve0: string;
  reserve1: string;

  firstToken: {
    "chainId": number;
    "address": string;
    "symbol": string;
    "decimals": number;
  };

  secondToken: {
    "chainId": number;
    "symbol": string;
    "address": string;
    "decimals": number;
  };
}

export type RawRiverexPool = {
  pair: string;
  token0: string;
  token0Symbol: string;
  token0Decimal: number;
  token1: string;
  token1Symbol: string;
  token1Decimal: number;
  reserve0: string;
  reserve1: string;
  fee: string;
  reserveEth?: string;
  reserveUsd: string;
};

const threshold = 0.0;

/**
 * Provider for getting riverex pools from the http api
 *
 * @export
 * @interface IRiverexProvider
 */
export interface IRiverexProvider {
  getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<{pools: RawRiverexPool[], poolsSanitized: RiverexPool[]}>;
}

interface ErrorType{
  code: string;
  message: string;
}

interface PoolsResult{
  data: RawRiverexPool[];
  error?: ErrorType
}

export class RiverexProvider implements IRiverexProvider {
  // private client: GraphQLClient;

  constructor(
    private chainId: ChainId,
    private retries = 1,
    private timeout = 360000
  ) {
    const httpUrl = process.env.URL_FOR_POOLS_GENERIC!.replace('${networkId}', this.chainId.toString());
    if (!httpUrl) {
      throw new Error(`No http url for chain id: ${this.chainId}`);
    }
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
  ): Promise<{pools: RawRiverexPool[]; poolsSanitized: RiverexPool[]}> {

    let pools: RawRiverexPool[] = [];

    const config = {
      headers:{
        'APP_INTERNAL_AUTH':process.env.APP_INTERNAL_AUTH
      }
    };

    await retry(
      async () => {
        const timeout = new Timeout();
        const getPools = async (): Promise<RawRiverexPool[]> => {
          // let lastId = '';
          let pairs: RawRiverexPool[] = [];
          let pairsPage: RawRiverexPool[] = [];

          //do {
            await retry(
              async () => {
                const poolsResult = await axios.get<PoolsResult>(<string>process.env.URL_FOR_POOLS_GENERIC!
                  .replace("{networkId}", this.chainId.toString())
                  .replace("{minLat}",process.env.POOL_API_LATENCY!), config);

                if (poolsResult.data.error) {
                  throw poolsResult.data.error;
                }

                pairsPage = poolsResult.data.data;

                pairs = pairs.concat(pairsPage);
                // lastId = pairs[pairs.length - 1]!.id;
              },
              {
                retries: this.retries,
                onRetry: (err, retry) => {
                  pools = [];
                  log.info(
                    { err },
                    `Failed request for page of pools from http api. Retry attempt: ${retry}`
                  );
                },
              }
            );
          //} while (pairsPage.length > 0);

          return pairs;
        };

        /* eslint-disable no-useless-catch */
        try {
          const getPoolsPromise = getPools();
          const timerPromise = timeout.set(this.timeout).then(() => {
            throw new Error(
              `Timed out getting pools from api: ${this.timeout}`
            );
          });
          pools = await Promise.race([getPoolsPromise,timerPromise]);
          // return;
        } catch (e:any) {
          log.error(e)
          if (e && e.response && e.response.data && e.response.data.error && e.response.data.error.code === process.env.DATA_OUT_OF_SYNC_CODE){
            throw e.response.data.error;
          } else {
            throw Error("failed to get pools");
          }
          // @ts-ignore
        } finally {
          timeout.clear();
        }
        /* eslint-enable no-useless-catch */
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          pools = [];
          log.info(
            { err },
            `Failed to get pools from api. Retry attempt: ${retry}`
          );
        },
      }
    );

    // Filter pools that have tracked reserve ETH less than threshold.

    // TODO: Remove. Temporary fix to ensure tokens without trackedReserveETH are in the list.
    const FEI = '0x956f47f50a910163d8bf957cf5846d573e7f87ca';

    if (String(this.chainId) == String(ChainId.TRON) || String(this.chainId) == String(ChainId.TRON_SHASTA)){
      pools = pools.map(pool => {
        return{
          ...pool,
          pair: toHex(pool.pair),
          token0: toHex(pool.token0),
          token1: toHex(pool.token1)
        }
      })
    }
    const poolsSanitized: RiverexPool[] = pools
      .filter((pool) => {
        return (
          pool.token0 == FEI ||
          pool.token1 == FEI ||
          (parseFloat(pool.reserveEth || "0.0") >= threshold)
        );
      })
      .map((pool) => {
        return {
          id: pool.pair.toLowerCase(),
          firstToken:{
            address: pool.token0,
            chainId: this.chainId,
            symbol: pool.token0Symbol,
            decimals: pool.token0Decimal
          },
          secondToken:{
            address: pool.token1,
            chainId: this.chainId,
            symbol: pool.token1Symbol,
            decimals: pool.token1Decimal
          },
          reserve0: convertToValue(pool.reserve0,pool.token0Decimal),
          reserve1: convertToValue(pool.reserve1,pool.token1Decimal),
          fee: pool.fee!,
          reserve: convertToValueNumber((pool.reserveEth || '0.0'),36).toNumber(),
          token0: {
            id: pool.token0.toLowerCase()
          },
          token1: {
            id: pool.token1.toLowerCase()
          }
        };
      });

    log.info(
      `Got ${pools.length} Riverex pools from the http api. ${poolsSanitized.length} after filtering`
    );

    const usdTokens = usdGasTokensByChain[this.chainId];
    if (!usdTokens) {
      log.error(`Could not find a USD token for computing gas costs on ${this.chainId}`)
      throw new Error(
        `Could not find a USD token for computing gas costs on ${this.chainId}`
      );
    }
    const usdTokenAddresses = usdTokens.map(usdToken=> usdToken.address.toLowerCase())
    const wrappedNativeTokenAddress = WRAPPED_NATIVE_CURRENCY[this.chainId].address;

    pools = pools.filter(pool => {
      const {token0: firstToken, token1: secondToken} = pool;
      return ((usdTokenAddresses.includes(firstToken) && wrappedNativeTokenAddress == secondToken)
        || (usdTokenAddresses.includes(secondToken) && wrappedNativeTokenAddress == firstToken)) ||
        (firstToken == _tokenOut!.address && secondToken == wrappedNativeTokenAddress ||
          secondToken == _tokenOut!.address && firstToken == wrappedNativeTokenAddress);
    })

    return {poolsSanitized,pools};
  }
}

function convertToValue(anumber: string, decimals: number ){
  return BigNumber(anumber).times(BigNumber(10).pow(decimals)).toFixed(0);
}

function convertToValueNumber(anumber: string, decimals: number ){
  return BigNumber(anumber).times(BigNumber(10).pow(decimals));
}