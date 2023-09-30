import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';
import retry, { Options as RetryOptions } from 'async-retry';
import _ from 'lodash';

import {
  ChainId, computePairAddress,
  CurrencyAmount, Fee, INIT_CODE_HASH, RIVEREX_FACTORY_ADDRESSES
} from '../../util';
import { log } from '../../util/log';
import { poolToString } from '../../util/routes';
import { IMulticallProvider, Result } from '../multicall-provider';
import { ProviderConfig } from '../provider';
import {RiverexPair} from "../../routers/alpha-router/entities/riverex-pool";
import { ERC20Pair__factory } from '../../types/riverdex';
import { RiverexPool } from './riverex-provider';

type IReserves = {
  reserve0: BigNumber;
  reserve1: BigNumber;
  blockTimestampLast: number;
};

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
   * @param tokenPairs The token pairs to get.
   * @param [providerConfig] The provider config.
   * @param riverexPools Riverexpools
   * @returns A pool accessor with methods for accessing the pools.
   */
  getPools(
    tokenPairs: [Token, Token, Fee][],
    providerConfig?: ProviderConfig,
    riverexPools?: RiverexPool[]
  ): Promise<RiverexPoolAccessor>;

  /**
   * Gets the pool address for the specified token pair.
   *
   * @param tokenA Token A in the pool.
   * @param tokenB Token B in the pool.
   * @returns The pool address and the two tokens.
   */
  getPoolAddress(
    tokenA: Token,
    tokenB: Token,
    fee: string
  ): { poolAddress: string; token0: Token; token1: Token };
}

export type RiverexPoolAccessor = {
  getPool: (tokenA: Token, tokenB: Token, fee: string) => RiverexPair | undefined;
  getPoolByAddress: (address: string) => RiverexPair | undefined;
  getAllPools: () => RiverexPair[];
};

export type RiverexPoolRetryOptions = RetryOptions;

export class RiverexPoolProvider implements IRiverexPoolProvider {
  // Computing pool addresses is slow as it requires hashing, encoding etc.
  // Addresses never change so can always be cached.
  private POOL_ADDRESS_CACHE: { [key: string]: string } = {};

  /**
   * Creates an instance of V2PoolProvider.
   * @param chainId The chain id to use.
   * @param multicall2Provider The multicall provider to use to get the pools.
   * @param retryOptions The retry options for each call to the multicall.
   */
  constructor(
    protected chainId: ChainId,
    protected multicall2Provider: IMulticallProvider,
    protected retryOptions: RiverexPoolRetryOptions = {
      retries: 2,
      minTimeout: 50,
      maxTimeout: 500,
    }
  ) {}

  public async getPools(
    tokenPairs: [Token, Token, Fee][],
    providerConfig?: ProviderConfig
  ): Promise<RiverexPoolAccessor> {
    const poolAddressSet: Set<string> = new Set<string>();
    const sortedTokenPairs: Array<[Token, Token, Fee]> = [];
    const sortedPoolAddresses: string[] = [];

    for (const tokenPair of tokenPairs) {
      const [tokenA, tokenB, fee] = tokenPair;

      let { poolAddress, token0, token1 } = this.getPoolAddress(
        tokenA,
        tokenB,
        fee
      );

      if (poolAddressSet.has(poolAddress)) {
        continue;
      }

      poolAddressSet.add(poolAddress);
      sortedTokenPairs.push([token0, token1, fee]);
      sortedPoolAddresses.push(poolAddress);
    }

    log.debug(
      `getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`
    );

    const reservesResults = await this.getPoolsData<IReserves>(
      sortedPoolAddresses,
      'getReserves',
      providerConfig
    );

    log.info(
      `Got reserves for ${poolAddressSet.size} pools ${
        providerConfig?.blockNumber
          ? `as of block: ${await providerConfig?.blockNumber}.`
          : ``
      }`
    );

    const poolAddressToPool: { [poolAddress: string]: RiverexPair } = {};

    const invalidPools: [Token, Token, Fee][] = [];

    for (let i = 0; i < sortedPoolAddresses.length; i++) {
      const reservesResult = reservesResults[i]!;

      if (!reservesResult?.success) {
        const [token0, token1, fee] = sortedTokenPairs[i]!;
        invalidPools.push([token0, token1, fee]);

        continue;
      }

      const [token0, token1, fee] = sortedTokenPairs[i]!;
      // @ts-ignore
      const { _reserve0, _reserve1 } = reservesResult.result;

      const pool = new RiverexPair(
        fee,
        CurrencyAmount.fromRawAmount(token0, _reserve0.toString()),
        CurrencyAmount.fromRawAmount(token1, _reserve1.toString())
      );

      const poolAddress = sortedPoolAddresses[i]!;

      poolAddressToPool[poolAddress] = pool;
    }

    if (invalidPools.length > 0) {
      log.info(
        {
          invalidPools: _.map(
            invalidPools,
            ([token0, token1]) => `${token0.symbol}/${token1.symbol}`
          ),
        },
        `${invalidPools.length} pools invalid after checking their slot0 and liquidity results. Dropping.`
      );
    }

    const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);

    log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);

    return {
      getPool: (tokenA: Token, tokenB: Token, fee :Fee): RiverexPair | undefined => {
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
    feeAmount: Fee
  ): { poolAddress: string; token0: Token; token1: Token } {
    const [token0, token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    const cacheKey = `${this.chainId}/${token0.address}/${token1.address}/${feeAmount}`;

    const cachedAddress = this.POOL_ADDRESS_CACHE[cacheKey];

    if (cachedAddress) {
      return { poolAddress: cachedAddress, token0, token1 };
    }


    if (!INIT_CODE_HASH[this.chainId]){
      throw new Error(
        `No INIT_CODE_HASH for riverex on chain id: ${this.chainId}`
      );
    }

    const initCodeHash: string | undefined = INIT_CODE_HASH[this.chainId];

    if (!initCodeHash){
      throw new Error(`No INIT_CODE_HASH found for chain id: ${this.chainId}`)
    }

    const poolAddress = computePairAddress({
      factoryAddress: RIVEREX_FACTORY_ADDRESSES[this.chainId]!,
      tokenA: token0,
      tokenB: token1,
      fee: feeAmount,
      INIT_CODE_HASH: initCodeHash
    });

    // const poolAddress = Pair.getAddress(token0, token1);

    this.POOL_ADDRESS_CACHE[cacheKey] = poolAddress;

    return { poolAddress, token0, token1 };
  }

  private async getPoolsData<TReturn>(
    poolAddresses: string[],
    functionName: string,
    providerConfig?: ProviderConfig
  ): Promise<Result<TReturn>[]> {
    const { results, blockNumber } = await retry(async () => {
      return this.multicall2Provider.callSameFunctionOnMultipleContracts<
        undefined,
        TReturn
      >({
        addresses: poolAddresses,
        contractInterface: ERC20Pair__factory.createInterface(),
        functionName: functionName,
        providerConfig,
      });
    }, this.retryOptions);

    log.debug(`Pool data fetched as of block ${blockNumber}`);

    return results;
  }

  async setPools(_pools: RiverexPool[]): Promise<void> {
  }
}
