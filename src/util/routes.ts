import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';
import _ from 'lodash';

import {MixedRoute, RiverexRoute, V2Route, V3Route} from '../routers/router';
import { V3_CORE_FACTORY_ADDRESSES } from './addresses';

import {Protocol} from '.';

export const routeToString = (
  route: V3Route | V2Route | MixedRoute | RiverexRoute
): string => {
  const routeStr = [];
  const tokens =
    route.protocol === Protocol.V3
      ? route.tokenPath
      : // MixedRoute and V2Route have path
        route.path;
  const tokenPath = _.map(tokens, (token) => `${token.symbol}`);
  const pools =
    route.protocol === Protocol.V3 || route.protocol === Protocol.MIXED
      ? route.pools
      : route.pairs;
  const poolFeePath = _.map(pools, (pool) => {
    return `${
      pool instanceof Pool
        ? ` -- ${pool.fee / 10000}% [${Pool.getAddress(
            pool.token0,
            pool.token1,
            pool.fee,
            undefined,
            V3_CORE_FACTORY_ADDRESSES[pool.chainId]
          )}]`
        : ` -- [${Pair.getAddress(
            (pool as Pair).token0,
            (pool as Pair).token1
          )}]`
    } --> `;
  });

  for (let i = 0; i < tokenPath.length; i++) {
    routeStr.push(tokenPath[i]);
    if (i < poolFeePath.length) {
      routeStr.push(poolFeePath[i]);
    }
  }

  return routeStr.join('');
};

export const poolToString = (p: Pool | Pair): string => {
  return `${p.token0.symbol}/${p.token1.symbol}${
    p instanceof Pool ? `/${p.fee / 10000}%` : ``
  }`;
};
