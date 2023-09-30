import { ChainId } from '../../util/chains';

import { ICache } from './../cache';
import { IRiverexProvider, RawRiverexPool, RiverexPool } from './riverex-provider';
import { Token } from '@uniswap/sdk-core';

/**
 * Provider for getting RIVEREX pools, with functionality for caching the results.
 *
 * @export
 * @class CachingRiverexProvider
 */
export class CachingRiverexProvider implements IRiverexProvider {
  private RIVEREX_POOLS_KEY = (chainId: ChainId) => `riverex-pools-${chainId}`;

  /**
   * Creates an instance of CachingRiverexProvider.
   * @param chainId The chain id to use.
   * @param riverexProvider The provider to use to get the API pools when not in the cache.
   * @param cache Cache instance to hold cached pools.
   */
  constructor(
    private chainId: ChainId,
    protected riverexProvider: IRiverexProvider,
    private cache: ICache<{pools:RawRiverexPool[],poolsSanitized: RiverexPool[]}>
  ) {}

  public async getPools(tokenIn?:Token, tokenOut?: Token): Promise<{pools:RawRiverexPool[],poolsSanitized: RiverexPool[]}> {
    const cachedPools = await this.cache.get(this.RIVEREX_POOLS_KEY(this.chainId));
    if (cachedPools) {
      return cachedPools;
    }

    tokenIn = undefined
    const pools = await this.riverexProvider.getPools(tokenIn, tokenOut);

    await this.cache.set(this.RIVEREX_POOLS_KEY(this.chainId), pools);

    return pools;
  }
}
