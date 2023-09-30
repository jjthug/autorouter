import { Token } from '@uniswap/sdk-core';
import _ from 'lodash';

import { ChainId } from '../../util/chains';
import { log } from '../../util/log';

import { ProviderConfig } from './../provider';
import { IRiverexPoolProvider, RiverexPoolAccessor } from './pool-provider';
import { CurrencyAmount, Fee } from '../../util';
import {RiverexPair} from "../../routers/alpha-router/entities/riverex-pool";
import { RiverexPool } from './riverex-provider';

/**
 * Provider for getting Riverex pools, with functionality for caching the results per block.
 *
 * @export
 * @class CachingRiverexPoolProvider
 */
export class CachingRiverexPoolProvider implements IRiverexPoolProvider {


  /**
   * Creates an instance of CachingRiverexPoolProvider.
   * @param chainId The chain id to use.
   * @param poolProvider The provider to use to get the pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    protected chainId: ChainId,
    protected poolProvider: IRiverexPoolProvider,
    // Cache is block aware. For V2 pools we need to use the current blocks reserves values since
    // we compute quotes off-chain.
    // If no block is specified in the call to getPools we just return whatever is in the cache.
  ) {
  }

  public async getPools(
    tokenPairs: [Token, Token, Fee][],
    providerConfig?: ProviderConfig,
    riverexPools?: RiverexPool[]
  ): Promise<RiverexPoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    const poolsToGetTokenPairs: Array<[Token, Token, Fee]> = [];
    const poolsToGetAddresses: string[] = [];
    let poolAddressToPool: { [poolAddress: string]: RiverexPair } = {};

    const blockNumber = await providerConfig?.blockNumber;

    for (const [tokenA, tokenB, fee] of tokenPairs) {
      const { poolAddress, token0, token1 } = this.getPoolAddress(
        tokenA,
        tokenB,
        fee
      );

      if (poolAddressSet.has(poolAddress)) {
        continue;
      }

      poolAddressSet.add(poolAddress);

      const pool = riverexPools!.filter(pool => pool.id.toLowerCase() == poolAddress.toLowerCase())[0]

      if (pool) {
        // If a block was specified by the caller, ensure that the result in our cache matches the
        // expected block number. If a block number is not specified, just return whatever is in the
        // cache.
        // if (!blockNumber || (blockNumber && cachedPool.block == blockNumber)) {
        poolAddressToPool[poolAddress] = new RiverexPair(
          pool.fee.toString(),
          CurrencyAmount.fromRawAmount(new Token(this.chainId, pool.firstToken.address, (pool.firstToken.decimals)), pool.reserve0),
          CurrencyAmount.fromRawAmount(new Token(this.chainId, pool.secondToken.address, (pool.secondToken.decimals)), pool.reserve1)
        );
        //   continue;
        // }
        continue;
      }

      poolsToGetTokenPairs.push([token0, token1, fee]);
      poolsToGetAddresses.push(poolAddress);
    }

    log.info(
      {
        poolsFound: _.map(
          Object.values(poolAddressToPool),
          (p) => p.token0.symbol + ' ' + p.token1.symbol
        ),
        poolsToGetTokenPairs: _.map(
          poolsToGetTokenPairs,
          (t) => t[0].symbol + ' ' + t[1].symbol
        ),
      },
      `Found ${
        Object.keys(poolAddressToPool).length
      } V2 pools already in local cache for block ${blockNumber}. About to get reserves for ${
        poolsToGetTokenPairs.length
      } pools.`
    );

    // if (poolsToGetAddresses.length > 0) {
    //   const poolAccessor = await this.poolProvider.getPools(
    //     poolsToGetTokenPairs,
    //     providerConfig
    //   );
    //   for (const address of poolsToGetAddresses) {
    //     const pool = poolAccessor.getPoolByAddress(address);
    //     if (pool) {
    //       poolAddressToPool[address] = pool;
    //       // await this.cache.set(this.POOL_KEY(this.chainId, address.toLowerCase()), {
    //       //   pair: pool,
    //       //   block: blockNumber,
    //       // });
    //     }
    //   }
    // }

    return {
      getPool: (tokenA: Token, tokenB: Token, fee: Fee): RiverexPair | undefined => {
        const { poolAddress } = this.getPoolAddress(tokenA, tokenB, fee);
        return poolAddressToPool[poolAddress];
      },
      getPoolByAddress: (address: string): RiverexPair | undefined =>
        poolAddressToPool[address],
      getAllPools: (): RiverexPair[] => Object.values(poolAddressToPool),
    };
  }

  public getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    fee: Fee
  ): { poolAddress: string; token0: Token; token1: Token } {
    return this.poolProvider.getPoolAddress(tokenA, tokenB, fee);
  }
}
