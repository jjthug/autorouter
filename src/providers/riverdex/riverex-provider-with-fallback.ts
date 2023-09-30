import { Token } from '@uniswap/sdk-core';

import { log } from '../../util';
import { ProviderConfig } from '../provider';

import { IRiverexProvider, RawRiverexPool, RiverexPool } from './riverex-provider';

/**
 * Provider for getting Riverex pools that falls back to a different provider
 * in the event of failure.
 *
 * @export
 * @class RiverexProviderWithFallBacks
 */
export class RiverexProviderWithFallBacks implements IRiverexProvider {
  /**
   * Creates an instance of RiverexProviderWithFallBacks.
   * @param fallbacks Ordered list of `IRiverexProvider` to try to get pools from.
   */
  constructor(private fallbacks: IRiverexProvider[]) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
    providerConfig?: ProviderConfig
  ): Promise<{pools: RawRiverexPool[], poolsSanitized: RiverexPool[]}> {
    for (let i = 0; i < this.fallbacks.length; i++) {
      const provider = this.fallbacks[i]!;
      try {
        return await provider.getPools(
          tokenIn,
          tokenOut,
          providerConfig
        );
      } catch (err) {
        log.info(`Failed to get pools for Riverex from fallback #${i}`);
      }
    }

    throw new Error('Failed to get pools from any providers');
  }
}
