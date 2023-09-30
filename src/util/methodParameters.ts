import {
  SwapRouter as SwapRouter02,
  Trade,
} from '@uniswap/router-sdk';
import { Currency, TradeType } from '@uniswap/sdk-core';
import {
  SwapRouter as UniveralRouter,
  UNIVERSAL_ROUTER_ADDRESS,
} from '@uniswap/universal-router-sdk';
import _ from 'lodash';

import {
  ChainId,
  MethodParameters,
  SwapOptions,
  SwapType,
  SWAP_ROUTER_02_ADDRESSES,
} from '..';

export function buildSwapMethodParameters(
  trade: Trade<Currency, Currency, TradeType>,
  swapConfig: SwapOptions,
  chainId: ChainId
): MethodParameters {
  if (swapConfig.type == SwapType.UNIVERSAL_ROUTER) {
    return {
      ...UniveralRouter.swapERC20CallParameters(trade, swapConfig),
      to: UNIVERSAL_ROUTER_ADDRESS(chainId),
    };
  } else if (swapConfig.type == SwapType.SWAP_ROUTER_02) {
    const { recipient, slippageTolerance, deadline, inputTokenPermit } =
      swapConfig;

    return {
      ...SwapRouter02.swapCallParameters(trade, {
        recipient,
        slippageTolerance,
        deadlineOrPreviousBlockhash: deadline,
        inputTokenPermit,
      }),
      to: SWAP_ROUTER_02_ADDRESSES(chainId),
    };
  }

  throw new Error(`Unsupported swap type ${swapConfig}`);
}
