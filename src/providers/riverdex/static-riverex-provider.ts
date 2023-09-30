import { Token } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import _ from 'lodash';

import { ChainId, WRAPPED_NATIVE_CURRENCY } from '../../util/chains';
import { log } from '../../util/log';
import {
  DAI_MAINNET,
  DAI_RINKEBY_1,
  DAI_RINKEBY_2,
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
} from '../token-provider';

import { IRiverexProvider, RawRiverexPool, RiverexPool } from './riverex-provider';

type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

const BASES_TO_CHECK_TRADES_AGAINST: ChainTokenList = {
  [ChainId.MAINNET]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]!,
    DAI_MAINNET,
    USDC_MAINNET,
    USDT_MAINNET,
    WBTC_MAINNET,
  ],
  [ChainId.ROPSTEN]: [WRAPPED_NATIVE_CURRENCY[ChainId.ROPSTEN]!],
  [ChainId.RINKEBY]: [
    WRAPPED_NATIVE_CURRENCY[ChainId.RINKEBY]!,
    DAI_RINKEBY_1,
    DAI_RINKEBY_2,
  ],
  [ChainId.GÖRLI]: [WRAPPED_NATIVE_CURRENCY[ChainId.GÖRLI]!],
  [ChainId.KOVAN]: [WRAPPED_NATIVE_CURRENCY[ChainId.KOVAN]!],
  //v2 not deployed on [optimism, arbitrum, polygon, celo, gnosis, moonbeam] and their testnets
  [ChainId.OPTIMISM]: [],
  [ChainId.ARBITRUM_ONE]: [],
  [ChainId.ARBITRUM_RINKEBY]: [],
  [ChainId.ARBITRUM_GOERLI]: [],
  [ChainId.OPTIMISM_GOERLI]: [],
  [ChainId.OPTIMISTIC_KOVAN]: [],
  [ChainId.POLYGON]: [],
  [ChainId.POLYGON_MUMBAI]: [],
  [ChainId.CELO]: [],
  [ChainId.CELO_ALFAJORES]: [],
  [ChainId.GNOSIS]: [],
  [ChainId.MOONBEAM]: [],
  [ChainId.BSC]: [],
};

/**
 * Provider that does not get data from an external source and instead returns
 * a hardcoded list of pools.
 *
 * Since the pools are hardcoded, the liquidity/price values are dummys and should not
 * be depended on.
 *
 * Useful for instances where other data sources are unavailable. E.g. api not available.
 *
 * @export
 * @class StaticRiverexProvider
 */
export class StaticRiverexProvider implements IRiverexProvider {
  constructor(private chainId: ChainId) {}

  public async getPools(
    tokenIn?: Token,
    tokenOut?: Token,
  ): Promise<{pools: RawRiverexPool[], poolsSanitized: RiverexPool[]}> {
    log.info('In static provider for Riverdex');
    const bases = BASES_TO_CHECK_TRADES_AGAINST[this.chainId];
 // todo fix
    const basePairs: [Token, Token][] = _.flatMap(
      bases,
      (base): [Token, Token][] => bases.map((otherBase) => [base, otherBase])
    );

    if (tokenIn && tokenOut) {
      basePairs.push(
        [tokenIn, tokenOut],
        ...bases.map((base): [Token, Token] => [tokenIn, base]),
        ...bases.map((base): [Token, Token] => [tokenOut, base])
      );
    }

    const pairs: [Token, Token][] = _(basePairs)
      .filter((tokens): tokens is [Token, Token] =>
        Boolean(tokens[0] && tokens[1])
      )
      .filter(
        ([tokenA, tokenB]) =>
          tokenA.address !== tokenB.address && !tokenA.equals(tokenB)
      )
      .value();

    const poolAddressSet = new Set<string>();

    // todo remove if not needed
    // @ts-ignore
    const riverexPools: RawRiverexPool[] = _(pairs)
      .map(([tokenA, tokenB]) => {
        const poolAddress = Pair.getAddress(tokenA, tokenB);

        if (poolAddressSet.has(poolAddress)) {
          return undefined;
        }
        poolAddressSet.add(poolAddress);

        const [token0, token1] = tokenA.sortsBefore(tokenB)
          ? [tokenA, tokenB]
          : [tokenB, tokenA];

        return {
          id: poolAddress,
          liquidity: '100',
          token0: {
            id: token0.address,
          },
          fee:"300",
          token1: {
            id: token1.address,
          },
          supply: 100,
          reserve: 100,
          reserveUSD: 100,
        };
      })
      .compact()
      .value();

    // todo remove
    // @ts-ignore
    return {pools:null,poolsSanitized:null};
  }
}
