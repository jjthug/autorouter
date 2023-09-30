import { Token } from '@uniswap/sdk-core';
import retry from 'async-retry';
import Timeout from 'await-timeout';
import _ from 'lodash';
import axios from 'axios';

import { ChainId } from '../../util/chains';
import { log } from '../../util/log';
import { ProviderConfig } from '../provider';
import { HTTP_URL_BY_CHAIN } from '../../util/poolsService';
// import { gql, GraphQLClient } from 'graphql-request';

export interface RiverexPool {
  id: string;
  token0: {
    id: string;
  };
  token1: {
    id: string;
  };
  fee: string
  supply: number;
  reserve: number;
  reserveUSD: number;
  reserve0:string;
  reserve1:string;

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
  address: string;
  firstToken: {
    symbol: string;
    address: string;
    decimals:number;
  };
  secondToken: {
    symbol: string;
    address: string;
    decimals:number;
  };
  reserve0:string;
  reserve1:string;
  fee: number;
  trackedReserveETH?: string;
  reserveUsd: string;
};

const threshold = 0.0025;

// const PAGE_SIZE = 1000;

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

interface PoolsResult{
  pairs: RawRiverexPool[];
}

export class RiverexProvider implements IRiverexProvider {
  // private client: GraphQLClient;

  constructor(
    private chainId: ChainId,
    private retries = 2,
    private timeout = 360000,
    private rollback = true,
  ) {
    const httpUrl = HTTP_URL_BY_CHAIN[this.chainId];
    if (!httpUrl) {
      throw new Error(`No http url for chain id: ${this.chainId}`);
    }
    // const subgraphUrl : GraphQLClient=
    // this.client = new GraphQLClient(subgraphUrl);
  }

  public async getPools(
    _tokenIn?: Token,
    _tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<{pools: RawRiverexPool[]; poolsSanitized: RiverexPool[]}> {
    let blockNumber = providerConfig?.blockNumber
      ? await providerConfig.blockNumber
      : undefined;

    let pools: RawRiverexPool[] = [];

    // todo
    const config = {
      headers:{
        Authorization: "",
        'App-Id': ""
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
                const poolsResult = await axios.get<PoolsResult>(<string>HTTP_URL_BY_CHAIN[this.chainId], config);

                pairsPage = poolsResult.data.pairs;

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
          pools = await Promise.race([getPoolsPromise, timerPromise]);
          return;
        } catch (err) {
          throw err;
        } finally {
          timeout.clear();
        }
        /* eslint-enable no-useless-catch */
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          if (
            this.rollback &&
            blockNumber &&
            _.includes(err.message, 'indexed up to')
          ) {
            blockNumber = blockNumber - 10;
            log.info(
              `Detected subgraph indexing error. Rolled back block number to: ${blockNumber}`
            );
          }
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

    // const usdTokens = usdGasTokensByChain[this.chainId]!;
    // const weth = WRAPPED_NATIVE_CURRENCY[this.chainId]!;

    // if no usd pools are present then get from uniswap v2
    // const usd_pools = pools.filter(pool =>{
    //   return(((usdTokens || []).some(tok => tok.address === pool.firstToken.address) && pool.secondToken=== weth) || ((usdTokens || []).some(tok => tok.address === pool.secondToken.address) && pool.firstToken=== weth))
    // })
    //
    //
    // if (usd_pools.length == 0){
    //
    //   // get from uniswap subgraph
    //   const client = new GraphQLClient(SUBGRAPH_URL_UNISWAP_V2_BY_CHAIN[this.chainId]!)
    //
    //   // todo make dynamic
    //   const weth_usd_pool_address = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"
    //
    //   const query2 = gql`
    //       query getPool($weth_usd_pool_address : String!){
    //           pair(id:$weth_usd_pool_address){
    //               id
    //               token0 {
    //                   id
    //                   symbol
    //               }
    //               token1 {
    //                   id
    //                   symbol
    //               }
    //               reserveUSD
    //               volumeUSD
    //               reserve0
    //               reserve1
    //               trackedReserveETH
    //           }
    //       }
    //   `;
    //
    //   let pairPage: RawV2SubgraphPool;
    //   let pairs: RawV2SubgraphPool[] = [];
    //
    //   await retry(
    //     async () => {
    //       const poolsResult = await client.request<{
    //         pair: RawV2SubgraphPool;
    //       }>(query2, {
    //         weth_usd_pool_address: weth_usd_pool_address
    //       });
    //
    //       pairPage = poolsResult.pair;
    //
    //       pairs = pairs.concat(pairPage);
    //     },
    //     {
    //       retries: this.retries,
    //       onRetry: (err, retry) => {
    //         pools = [];
    //         log.info(
    //           { err },
    //           `Failed request for page of pools from subgraph. Retry attempt: ${retry}`
    //         );
    //       },
    //     }
    //   );
    //
    //   let pair = pairs[0]!
    //
    //   pools.push({
    //     address: pair.id,
    //     firstToken: {
    //       symbol: pair.token0.symbol,
    //       address: pair.token0.id
    //     },
    //     secondToken: {
    //       symbol: pair.token1.symbol,
    //       address: pair.token1.id
    //     },
    //     reserve0: pair.reserve0,
    //     reserve1: pair.reserve1,
    //     fee: 300,
    //     reserveUsd: pair.reserveUSD,
    //     trackedReserveETH: pair.trackedReserveETH
    //   })
    // }



    const poolsSanitized: RiverexPool[] = pools
      .filter((pool) => {
        return (
          pool.firstToken.address == FEI ||
          pool.secondToken.address == FEI ||
          (pool.trackedReserveETH && parseFloat(pool.trackedReserveETH) > threshold)
        );
      })
      .map((pool) => {
        return {
          ...pool,
          firstToken:{
            ...pool.firstToken,
            chainId: this.chainId
          },
          secondToken:{
            ...pool.secondToken,
            chainId: this.chainId
          },
          fee: pool.fee.toString(),
          id: pool.address.toLowerCase(),
          reserve: parseFloat(pool.trackedReserveETH || pool.reserveUsd),
          reserveUSD: parseFloat(pool.reserveUsd),
          supply: parseFloat(pool.reserve0) + parseFloat(pool.reserve1),
          token0: {
            id: pool.firstToken.address.toLowerCase()
          },
          token1: {
            id: pool.secondToken.address.toLowerCase()
          }
        };
      });

    log.info(
      `Got ${pools.length} Riverex pools from the http api. ${poolsSanitized.length} after filtering`
    );

    return {poolsSanitized,pools};
  }
}
