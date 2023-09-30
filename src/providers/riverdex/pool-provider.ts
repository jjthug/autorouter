import { Token } from '@uniswap/sdk-core';
import { Options as RetryOptions } from 'async-retry';

import {
  ChainId, CurrencyAmount,
} from '../../util';
import {RiverexPair} from "../../routers/alpha-router/entities/riverex-pool";
import { RiverexPool } from './riverex-provider';

/**
 * Provider for getting Riverex pools.
 *
 * @export
 * @interface IRiverexPoolProvider
 */
export interface IRiverexPoolProvider {
  /**
   * Gets the pools for the specified token pairs.
   *
   * @param riverexPools Riverexpools
   * @returns A pool accessor with methods for accessing the pools.
   */
  getPools(
    riverexPools: RiverexPool[]
  ): Promise<RiverexPoolAccessor>;
}

export type RiverexPoolAccessor = {
  getPoolByAddress: (address: string) => RiverexPair | undefined;
  getAllPools: () => RiverexPair[];
};

export type RiverexPoolRetryOptions = RetryOptions;

export class RiverexPoolProvider implements IRiverexPoolProvider {
  // Computing pool addresses is slow as it requires hashing, encoding etc.
  // Addresses never change so can always be cached.

  /**
   * Creates an instance of RiverexPoolProvider.
   * @param chainId The chain id to use.
   * @param retryOptions The retry options for each call to the multicall.
   */
  constructor(
    protected chainId: ChainId,
    protected retryOptions: RiverexPoolRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    }
  ) {}

  public async getPools(
    riverexPools: RiverexPool[]
  ): Promise<RiverexPoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    let poolAddressToPool: { [poolAddress: string]: RiverexPair } = {};

    riverexPools.forEach((pool) => {
      const poolAddress = pool.id;
      if (poolAddressSet.has(poolAddress)) {

      } else {

        poolAddressSet.add(poolAddress);

        // If a block was specified by the caller, ensure that the result in our cache matches the
        // expected block number. If a block number is not specified, just return whatever is in the
        // cache.
        // if (!blockNumber || (blockNumber && cachedPool.block == blockNumber)) {
        poolAddressToPool[poolAddress] = new RiverexPair(
          pool.id,
          pool.fee.toString(),
          CurrencyAmount.fromRawAmount(new Token(this.chainId, pool.firstToken.address, (pool.firstToken.decimals)), pool.reserve0),
          CurrencyAmount.fromRawAmount(new Token(this.chainId, pool.secondToken.address, (pool.secondToken.decimals)), pool.reserve1)
        );
      }
    })

    return {
      getPoolByAddress: (address: string): RiverexPair | undefined =>
        poolAddressToPool[address],
      getAllPools: (): RiverexPair[] => Object.values(poolAddressToPool),
    };
  }

}
