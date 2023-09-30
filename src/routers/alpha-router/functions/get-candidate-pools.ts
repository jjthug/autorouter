import { Token, TradeType } from '@uniswap/sdk-core';
import _ from 'lodash';

import {ITokenListProvider,  RawRiverexPool} from '../../../providers';
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
  ITokenProvider,
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
  topByEthQuoteTokenPool: PoolId[];
  topByTVL: PoolId[];
  topByTVLUsingTokenIn: PoolId[];
  topByTVLUsingTokenOut: PoolId[];
  topByTVLUsingTokenInSecondHops: PoolId[];
  topByTVLUsingTokenOutSecondHops: PoolId[];
};

export type RiverdexGetCandidatePoolsParams = {
  tokenIn: Token;
  tokenOut: Token;
  routeType: TradeType;
  routingConfig: AlphaRouterConfig;
  riverexProvider: IRiverexProvider;
  tokenProvider: ITokenProvider;
  poolProvider: IRiverexPoolProvider;
  blockedTokenListProvider?: ITokenListProvider;
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
  routeType,
  routingConfig,
  riverexProvider,
  tokenProvider,
  poolProvider,
  blockedTokenListProvider,
  chainId,
}: RiverdexGetCandidatePoolsParams): Promise<{
  poolAccessor: RiverexPoolAccessor;
  candidatePools: CandidatePoolsBySelectionCriteria;
  riverexPools: RiverexPool[];
  riverexPoolsRaw: RawRiverexPool[];
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

  // todo change fee
  const allPools = _.map(poolsSanitized, (pool) => {
    return {
      ...pool,
      fee: pool.fee || '300',
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

  // Only consider pools where neither tokens are in the blocked token list.
  let filteredPools: RiverexPool[] = allPools;
  if (blockedTokenListProvider) {
    filteredPools = [];
    for (const pool of allPools) {
      const token0InBlocklist =
        await blockedTokenListProvider.getTokenByAddress(pool.token0.id);
      const token1InBlocklist =
        await blockedTokenListProvider.getTokenByAddress(pool.token1.id);

      if (token0InBlocklist || token1InBlocklist) {
        continue;
      }

      filteredPools.push(pool);
    }
  }

  const riverexPoolsSorted = _(filteredPools)
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

  // Always add the direct swap pool into the mix regardless of if it exists in the subgraph pool list.
  // Ensures that new pools can be swapped on immediately, and that if a pool was filtered out of the
  // subgraph query for some reason (e.g. trackedReserveETH was 0), then we still consider it.
  let topByDirectSwapPool: RiverexPool[] = [];

  // todo api call get direct pools or remove
  // if (topNDirectSwaps != 0) {
  //   const { token0, token1, poolAddress } = poolProvider.getPoolAddress(
  //     tokenIn,
  //     tokenOut,
  //     "300"
  //   );
  //
  //   topByDirectSwapPool = [
  //     {
  //       fee: "300",
  //       id: poolAddress,
  //       token0: {
  //         id: token0.address,
  //       },
  //       token1: {
  //         id: token1.address,
  //       },
  //       supply: 10000, // Not used. Set to arbitrary number.
  //       reserve: 10000, // Not used. Set to arbitrary number.
  //       reserveUSD: 10000, // Not used. Set to arbitrary number.
  //     },
  //   ];
  // }
  //
  //  addToAddressSet(topByDirectSwapPool);

  const wethAddress = WRAPPED_NATIVE_CURRENCY[chainId]!.address;

  // Main reason we need this is for gas estimates, only needed if token out is not ETH.
  // We don't check the seen address set because if we've already added pools for getting ETH quotes
  // theres no need to add more.
  // Note: we do not need to check other native currencies for the V2 Protocol
  let topByEthQuoteTokenPool: RiverexPool[] = [];
  if (
    tokenOut.symbol != 'WETH' &&
    tokenOut.symbol != 'WETH9' &&
    tokenOut.symbol != 'ETH'
  ) {
    topByEthQuoteTokenPool = _(riverexPoolsSorted)
      .filter((riverexPool) => {
        if (routeType == TradeType.EXACT_INPUT) {
          return (
            (riverexPool.token0.id == wethAddress &&
              riverexPool.token1.id == tokenOutAddress) ||
            (riverexPool.token1.id == wethAddress &&
              riverexPool.token0.id == tokenOutAddress)
          );
        } else {
          return (
            (riverexPool.token0.id == wethAddress &&
              riverexPool.token1.id == tokenInAddress) ||
            (riverexPool.token1.id == wethAddress &&
              riverexPool.token0.id == tokenInAddress)
          );
        }
      })
      .slice(0, 1)
      .value();
  }

  addToAddressSet(topByEthQuoteTokenPool);

  const topByTVL = _(riverexPoolsSorted)
    .filter((subgraphPool) => {
      return !poolAddressesSoFar.has(subgraphPool.id);
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
    ...topByEthQuoteTokenPool,
    ...topByTVL,
    ...topByTVLUsingTokenIn,
    ...topByTVLUsingTokenOut,
    ...topByTVLUsingTokenInSecondHops,
    ...topByTVLUsingTokenOutSecondHops,
  ])
    .compact()
    .uniqBy((pool) => pool.id)
    .value();

  const tokenAddresses = _(riverexPools)
    .flatMap((riverexPool) => [riverexPool.token0.id, riverexPool.token1.id])
    .compact()
    .uniq()
    .value();

  await tokenProvider.setTokens(riverexPools);

  log.info(
    `Getting the ${tokenAddresses.length} tokens within the ${riverexPools.length} riverex pools we are considering`
  );

  const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
    blockNumber,
  });

  const printRiverexPool = (s: RiverexPool) =>
    `${tokenAccessor.getTokenByAddress(s.token0.id)?.symbol ?? s.token0.id}/${
      tokenAccessor.getTokenByAddress(s.token1.id)?.symbol ?? s.token1.id
    }/${s.fee}`;

  log.info(
    {
      topByBaseWithTokenIn: topByBaseWithTokenIn.map(printRiverexPool),
      topByBaseWithTokenOut: topByBaseWithTokenOut.map(printRiverexPool),
      topByTVL: topByTVL.map(printRiverexPool),
      topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printRiverexPool),
      topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printRiverexPool),
      topByTVLUsingTokenInSecondHops:
        topByTVLUsingTokenInSecondHops.map(printRiverexPool),
      topByTVLUsingTokenOutSecondHops:
        topByTVLUsingTokenOutSecondHops.map(printRiverexPool),
      top2DirectSwap: topByDirectSwapPool.map(printRiverexPool),
      top2EthQuotePool: topByEthQuoteTokenPool.map(printRiverexPool),
    },
    `Riverex Candidate pools`
  );

  const tokenPairsRaw = _.map<RiverexPool, [Token, Token, string] | undefined>(
    riverexPools,
    (riverexPool) => {
      // const tokenA = tokenAccessor.getTokenByAddress(riverexPool.token0.id);
      // const tokenB = tokenAccessor.getTokenByAddress(riverexPool.token1.id);

      const tokenA = new Token(chainId,
        riverexPool.firstToken.address,
        riverexPool.firstToken.decimals,
        riverexPool.firstToken.symbol);

      const tokenB = new Token(chainId,
        riverexPool.secondToken.address,
        riverexPool.secondToken.decimals,
        riverexPool.secondToken.symbol);

      // constructor(chainId: number, address: string, decimals: number, symbol?: string, name?: string, bypassChecksum?: boolean);

      let fee: string;
      try {
        fee = riverexPool.fee;
      } catch (err) {
        log.info(
          { riverexPool },
          `Dropping candidate pool for ${riverexPool.token0.id}/${riverexPool.token1.id}/${riverexPool.fee} because fee not supported`
        );
        return undefined;
      }

      if (!tokenA || !tokenB) {
        log.info(
          `Dropping candidate pool for ${riverexPool.token0.id}/${riverexPool.token1.id}/${riverexPool.fee}`
        );
        return undefined;
      }

      return [tokenA, tokenB, fee];
    }
  );

  const tokenPairs = _.compact(tokenPairsRaw);

  const beforePoolsLoad = Date.now();
  // await poolProvider.setPools();
  const poolAccessor = await poolProvider.getPools(tokenPairs, { blockNumber }, riverexPools);

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
      topByEthQuoteTokenPool: topByEthQuoteTokenPool,
      topByTVL,
      topByTVLUsingTokenIn,
      topByTVLUsingTokenOut,
      topByTVLUsingTokenInSecondHops,
      topByTVLUsingTokenOutSecondHops,
    },
  };

  return { poolAccessor, candidatePools: poolsBySelection, riverexPools, riverexPoolsRaw: poolsRaw };
}
