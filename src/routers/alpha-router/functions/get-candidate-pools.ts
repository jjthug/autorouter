import { Token } from '@uniswap/sdk-core';
import _ from 'lodash';

import { RawRiverexPool} from '../../../providers';
import {
  CELO,
  CELO_ALFAJORES,
  CEUR_CELO,
  CEUR_CELO_ALFAJORES,
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_ARBITRUM,
  DAI_ARBITRUM_RINKEBY,
  DAI_BSC,
  DAI_MAINNET,
  DAI_MOONBEAM,
  DAI_OPTIMISM,
  DAI_OPTIMISM_GOERLI,
  DAI_OPTIMISTIC_KOVAN,
  DAI_POLYGON_MUMBAI,
  DAI_RINKEBY_1,
  DAI_RINKEBY_2,
  FEI_MAINNET,
  USDC_ARBITRUM,
  USDC_ARBITRUM_GOERLI,
  USDC_BSC,
  USDC_ETHEREUM_GNOSIS,
  USDC_MAINNET,
  USDC_MOONBEAM,
  USDC_OPTIMISM,
  USDC_OPTIMISM_GOERLI,
  USDC_OPTIMISTIC_KOVAN,
  USDC_POLYGON,
  USDT_ARBITRUM,
  USDT_ARBITRUM_RINKEBY,
  USDT_BSC,
  USDT_MAINNET,
  USDT_OPTIMISM,
  USDT_OPTIMISM_GOERLI,
  USDT_OPTIMISTIC_KOVAN,
  WBTC_ARBITRUM,
  WBTC_GNOSIS,
  WBTC_MAINNET,
  WBTC_MOONBEAM,
  WBTC_OPTIMISM,
  WBTC_OPTIMISM_GOERLI,
  WBTC_OPTIMISTIC_KOVAN,
  WGLMR_MOONBEAM,
  WMATIC_POLYGON,
  WMATIC_POLYGON_MUMBAI,
  WXDAI_GNOSIS,
} from '../../../providers/token-provider';
import {ChainId, Protocol, WRAPPED_NATIVE_CURRENCY} from '../../../util';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
import { AlphaRouterConfig } from '../alpha-router';
import {
  IRiverexProvider,
  RiverexPool
} from "../../../providers/riverdex/riverex-provider";
import {
  IRiverexPoolProvider,
  RiverexPoolAccessor
} from "../../../providers/riverdex/pool-provider";

export type PoolId = { id: string };
export type CandidatePoolsBySelectionCriteria = {
  protocol: Protocol;
  selections: CandidatePoolsSelections;
};

/// Utility type for allowing us to use `keyof CandidatePoolsSelections` to map
export type CandidatePoolsSelections = {
  topByBaseWithTokenIn: PoolId[];
  topByBaseWithTokenOut: PoolId[];
  topByDirectSwapPool: PoolId[];
  topByTVL: PoolId[];
  topByTVLUsingTokenIn: PoolId[];
  topByTVLUsingTokenOut: PoolId[];
  topByTVLUsingTokenInSecondHops: PoolId[];
  topByTVLUsingTokenOutSecondHops: PoolId[];
};

export type RiverdexGetCandidatePoolsParams = {
  tokenIn: Token;
  tokenOut: Token;
  routingConfig: AlphaRouterConfig;
  riverexProvider: IRiverexProvider;
  poolProvider: IRiverexPoolProvider;
  chainId: ChainId;
};

const baseTokensByChain: { [chainId in ChainId]?: Token[] } = {
  [ChainId.MAINNET]: [
    USDC_MAINNET,
    USDT_MAINNET,
    WBTC_MAINNET,
    DAI_MAINNET,
    WRAPPED_NATIVE_CURRENCY[1]!,
    FEI_MAINNET,
  ],
  [ChainId.RINKEBY]: [DAI_RINKEBY_1, DAI_RINKEBY_2],
  [ChainId.OPTIMISM]: [
    DAI_OPTIMISM,
    USDC_OPTIMISM,
    USDT_OPTIMISM,
    WBTC_OPTIMISM,
  ],
  [ChainId.OPTIMISM_GOERLI]: [
    DAI_OPTIMISM_GOERLI,
    USDC_OPTIMISM_GOERLI,
    USDT_OPTIMISM_GOERLI,
    WBTC_OPTIMISM_GOERLI,
  ],
  [ChainId.OPTIMISTIC_KOVAN]: [
    DAI_OPTIMISTIC_KOVAN,
    USDC_OPTIMISTIC_KOVAN,
    WBTC_OPTIMISTIC_KOVAN,
    USDT_OPTIMISTIC_KOVAN,
  ],
  [ChainId.ARBITRUM_ONE]: [
    DAI_ARBITRUM,
    USDC_ARBITRUM,
    WBTC_ARBITRUM,
    USDT_ARBITRUM,
  ],
  [ChainId.ARBITRUM_RINKEBY]: [DAI_ARBITRUM_RINKEBY, USDT_ARBITRUM_RINKEBY],
  [ChainId.ARBITRUM_GOERLI]: [USDC_ARBITRUM_GOERLI],
  [ChainId.POLYGON]: [USDC_POLYGON, WMATIC_POLYGON],
  [ChainId.POLYGON_MUMBAI]: [DAI_POLYGON_MUMBAI, WMATIC_POLYGON_MUMBAI],
  [ChainId.CELO]: [CUSD_CELO, CEUR_CELO, CELO],
  [ChainId.CELO_ALFAJORES]: [
    CUSD_CELO_ALFAJORES,
    CEUR_CELO_ALFAJORES,
    CELO_ALFAJORES,
  ],
  [ChainId.GNOSIS]: [WBTC_GNOSIS, WXDAI_GNOSIS, USDC_ETHEREUM_GNOSIS],
  [ChainId.MOONBEAM]: [
    DAI_MOONBEAM,
    USDC_MOONBEAM,
    WBTC_MOONBEAM,
    WGLMR_MOONBEAM,
  ],
  [ChainId.BSC]: [
    DAI_BSC,
    USDC_BSC,
    USDT_BSC,
  ],
};

export async function getRiverdexCandidatePools({
  tokenIn,
  tokenOut,
  routingConfig,
  riverexProvider,
  poolProvider,
  chainId,
}: RiverdexGetCandidatePoolsParams): Promise<{
  poolAccessor: RiverexPoolAccessor;
  candidatePools: CandidatePoolsBySelectionCriteria;
  riverexPools: RiverexPool[];
  riverexPoolsRawTokenWithUSD: RawRiverexPool[];
}> {
  const {
    blockNumber,
    riverexPoolSelection: {
      topN,
      topNTokenInOut,
      topNSecondHop,
      topNWithEachBaseToken,
      topNWithBaseToken,
    },
  } = routingConfig;
  const tokenInAddress = tokenIn.address.toLowerCase();
  const tokenOutAddress = tokenOut.address.toLowerCase();

  const beforePools = Date.now();

  const {pools: poolsRaw, poolsSanitized} = await riverexProvider.getPools(tokenIn, tokenOut, {
    blockNumber,
  });

  const allPools = _.map(poolsSanitized, (pool) => {
    return {
      ...pool,
      fee: pool.fee,
      token0: {
        ...pool.token0,
        id: pool.token0.id.toLowerCase(),
      },
      token1: {
        ...pool.token1,
        id: pool.token1.id.toLowerCase(),
      },
    };
  });

  metric.putMetric(
    'RiverexPoolsLoad',
    Date.now() - beforePools,
    MetricLoggerUnit.Milliseconds
  );

  const riverexPoolsSorted = _(allPools)
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .value();

  log.info(
    `After filtering blocked tokens went from ${allPools.length} to ${riverexPoolsSorted.length}.`
  );

  const poolAddressesSoFar = new Set<string>();
  const addToAddressSet = (pools: RiverexPool[]) => {
    _(pools)
      .map((pool) => pool.id)
      .forEach((poolAddress) => poolAddressesSoFar.add(poolAddress));
  };

  const baseTokens = baseTokensByChain[chainId] ?? [];

  const topByBaseWithTokenIn = _(baseTokens)
    .flatMap((token: Token) => {
      return _(riverexPoolsSorted)
        .filter((riverexPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (riverexPool.token0.id == tokenAddress &&
              riverexPool.token1.id == tokenInAddress) ||
            (riverexPool.token1.id == tokenAddress &&
              riverexPool.token0.id == tokenInAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNWithBaseToken)
    .value();

  const topByBaseWithTokenOut = _(baseTokens)
    .flatMap((token: Token) => {
      return _(riverexPoolsSorted)
        .filter((riverexPool) => {
          const tokenAddress = token.address.toLowerCase();
          return (
            (riverexPool.token0.id == tokenAddress &&
              riverexPool.token1.id == tokenOutAddress) ||
            (riverexPool.token1.id == tokenAddress &&
              riverexPool.token0.id == tokenOutAddress)
          );
        })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithEachBaseToken)
        .value();
    })
    .sortBy((tokenListPool) => -tokenListPool.reserve)
    .slice(0, topNWithBaseToken)
    .value();

  // Always add the direct swap pool into the mix regardless of if it exists in the pool list.

  const topByDirectSwapPool = _(allPools)
    .filter((pool) => {
    return (pool.token0.id == tokenInAddress && pool.token1.id == tokenOutAddress) || (pool.token1.id == tokenInAddress && pool.token0.id == tokenOutAddress)
    })
      .value();

  addToAddressSet(topByDirectSwapPool);

  const topByTVL = _(riverexPoolsSorted)
    .filter((pool) => {
    return !poolAddressesSoFar.has(pool.id);
  })
    .slice(0, topN)
    .value();

  addToAddressSet(topByTVL);

  const topByTVLUsingTokenIn = _(riverexPoolsSorted)
    .filter((riverexPool) => {
      return (
        !poolAddressesSoFar.has(riverexPool.id) &&
        (riverexPool.token0.id == tokenInAddress ||
          riverexPool.token1.id == tokenInAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenIn);

  const topByTVLUsingTokenOut = _(riverexPoolsSorted)
    .filter((riverexPool) => {
      return (
        !poolAddressesSoFar.has(riverexPool.id) &&
        (riverexPool.token0.id == tokenOutAddress ||
          riverexPool.token1.id == tokenOutAddress)
      );
    })
    .slice(0, topNTokenInOut)
    .value();

  addToAddressSet(topByTVLUsingTokenOut);

  const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
    .map((riverexPool) => {
      return tokenInAddress == riverexPool.token0.id
        ? riverexPool.token1.id
        : riverexPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(riverexPoolsSorted)
        .filter((riverexPool) => {
          return (
            !poolAddressesSoFar.has(riverexPool.id) &&
            (riverexPool.token0.id == secondHopId ||
              riverexPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .value();

  addToAddressSet(topByTVLUsingTokenInSecondHops);

  const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenOut)
    .map((riverexPool) => {
      return tokenOutAddress == riverexPool.token0.id
        ? riverexPool.token1.id
        : riverexPool.token0.id;
    })
    .flatMap((secondHopId: string) => {
      return _(riverexPoolsSorted)
        .filter((riverexPool) => {
          return (
            !poolAddressesSoFar.has(riverexPool.id) &&
            (riverexPool.token0.id == secondHopId ||
              riverexPool.token1.id == secondHopId)
          );
        })
        .slice(0, topNSecondHop)
        .value();
    })
    .uniqBy((pool) => pool.id)
    .value();

  addToAddressSet(topByTVLUsingTokenOutSecondHops);

  const riverexPools = _([
    ...topByBaseWithTokenIn,
    ...topByBaseWithTokenOut,
    ...topByDirectSwapPool,
    ...topByTVL,
    ...topByTVLUsingTokenIn,
    ...topByTVLUsingTokenOut,
    ...topByTVLUsingTokenInSecondHops,
    ...topByTVLUsingTokenOutSecondHops,
  ])
    .compact()
    .uniqBy((pool) => pool.id)
    .value();

  const beforePoolsLoad = Date.now();
  // await poolProvider.setPools();
  const poolAccessor = await poolProvider.getPools(riverexPools);

  metric.putMetric(
    'RiverexPoolsLoad',
    Date.now() - beforePoolsLoad,
    MetricLoggerUnit.Milliseconds
  );

  const poolsBySelection: CandidatePoolsBySelectionCriteria = {
    protocol: Protocol.RIVERDEX,
    selections: {
      topByBaseWithTokenIn,
      topByBaseWithTokenOut,
      topByDirectSwapPool,
      topByTVL,
      topByTVLUsingTokenIn,
      topByTVLUsingTokenOut,
      topByTVLUsingTokenInSecondHops,
      topByTVLUsingTokenOutSecondHops,
    },
  };

  return { poolAccessor, candidatePools: poolsBySelection, riverexPools, riverexPoolsRawTokenWithUSD: poolsRaw };
}
