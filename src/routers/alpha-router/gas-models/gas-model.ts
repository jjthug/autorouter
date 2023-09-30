import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '@uniswap/sdk-core';

import {
  CUSD_CELO,
  CUSD_CELO_ALFAJORES,
  DAI_ARBITRUM,
  DAI_ARBITRUM_RINKEBY,
  DAI_BSC,
  DAI_GÖRLI,
  DAI_KOVAN,
  DAI_MAINNET,
  DAI_MOONBASE_ALPHA,
  DAI_OPTIMISM,
  DAI_OPTIMISM_GOERLI,
  DAI_OPTIMISTIC_KOVAN,
  DAI_POLYGON_MUMBAI,
  DAI_RINKEBY_1,
  DAI_RINKEBY_2,
  DAI_ROPSTEN,
  USDC_ARBITRUM,
  USDC_ARBITRUM_GOERLI,
  USDC_BSC,
  USDC_ETHEREUM_GNOSIS,
  USDC_GÖRLI,
  USDC_KOVAN,
  USDC_MAINNET,
  USDC_MOONBEAM,
  USDC_OPTIMISM,
  USDC_OPTIMISM_GOERLI,
  USDC_OPTIMISTIC_KOVAN,
  USDC_POLYGON,
  USDC_ROPSTEN,
  USDT_ARBITRUM,
  USDT_ARBITRUM_RINKEBY,
  USDT_BSC,
  USDT_GÖRLI,
  USDT_KOVAN,
  USDT_MAINNET,
  USDT_OPTIMISM,
  USDT_OPTIMISM_GOERLI,
  USDT_OPTIMISTIC_KOVAN,
  USDT_ROPSTEN,
  WBTC_GÖRLI,
  USDT_TRON,
  USDC_TRON, USDD_TRON_SHASTA, USDT_FANTOM, USDT_BSC_TESTNET, DAI_BSC_TESTNET
} from '../../../providers/token-provider';
import { CurrencyAmount } from '../../../util/amounts';
import { ChainId } from '../../../util/chains';
import {
  RiverexRouteWithValidQuote,
  RouteWithValidQuote
} from '../entities/route-with-valid-quote';
import {IRiverexPoolProvider} from "../../../providers/riverdex/pool-provider";
import {RawRiverexPool} from "../../../providers";
import { ExtendedCurrencyAmount } from '../../../util/ExtendedCurrencyAmount';

export const usdGasTokensByChain: { [chainId in ChainId]?: Token[] } = {
  [ChainId.MAINNET]: [DAI_MAINNET, USDC_MAINNET, USDT_MAINNET],
  [ChainId.RINKEBY]: [DAI_RINKEBY_1, DAI_RINKEBY_2],
  [ChainId.ARBITRUM_ONE]: [DAI_ARBITRUM, USDC_ARBITRUM, USDT_ARBITRUM],
  [ChainId.OPTIMISM]: [DAI_OPTIMISM, USDC_OPTIMISM, USDT_OPTIMISM],
  [ChainId.OPTIMISM_GOERLI]: [
    DAI_OPTIMISM_GOERLI,
    USDC_OPTIMISM_GOERLI,
    USDT_OPTIMISM_GOERLI,
  ],
  [ChainId.MOONBASE_ALPHA]:[DAI_MOONBASE_ALPHA],
  [ChainId.TRON]:[USDC_TRON,USDT_TRON],
  [ChainId.TRON_SHASTA]:[USDD_TRON_SHASTA],
  [ChainId.FANTOM]:[USDT_FANTOM],
  [ChainId.OPTIMISTIC_KOVAN]: [
    DAI_OPTIMISTIC_KOVAN,
    USDC_OPTIMISTIC_KOVAN,
    USDT_OPTIMISTIC_KOVAN,
  ],
  [ChainId.ARBITRUM_RINKEBY]: [DAI_ARBITRUM_RINKEBY, USDT_ARBITRUM_RINKEBY],
  [ChainId.ARBITRUM_GOERLI]: [USDC_ARBITRUM_GOERLI],
  [ChainId.KOVAN]: [DAI_KOVAN, USDC_KOVAN, USDT_KOVAN],
  [ChainId.GÖRLI]: [DAI_GÖRLI, USDC_GÖRLI, USDT_GÖRLI, WBTC_GÖRLI],
  [ChainId.ROPSTEN]: [DAI_ROPSTEN, USDC_ROPSTEN, USDT_ROPSTEN],
  [ChainId.POLYGON]: [USDC_POLYGON],
  [ChainId.POLYGON_MUMBAI]: [DAI_POLYGON_MUMBAI],
  [ChainId.CELO]: [CUSD_CELO],
  [ChainId.CELO_ALFAJORES]: [CUSD_CELO_ALFAJORES],
  [ChainId.GNOSIS]: [USDC_ETHEREUM_GNOSIS],
  [ChainId.MOONBEAM]: [USDC_MOONBEAM],
  [ChainId.BSC]: [USDT_BSC, USDC_BSC, DAI_BSC],
  [ChainId.BSC_TESTNET]: [USDT_BSC_TESTNET, DAI_BSC_TESTNET],
};

export type L1ToL2GasCosts = {
  gasUsedL1: BigNumber;
  gasCostL1USD: CurrencyAmount;
  gasCostL1QuoteToken: CurrencyAmount;
};

export type BuildRiverexGasModelFactoryType = {
  chainId: ChainId;
  gasPriceWei: BigNumber;
  poolProvider?: IRiverexPoolProvider;
  token: Token;
  rawPools?: RawRiverexPool[]
};

/**
 * Contains functions for generating gas estimates for given routes.
 *
 * We generally compute gas estimates off-chain because
 *  1/ Calling eth_estimateGas for a swaps requires the caller to have
 *     the full balance token being swapped, and approvals.
 *  2/ Tracking gas used using a wrapper contract is not accurate with Multicall
 *     due to EIP-2929
 *  3/ For V2 we simulate all our swaps off-chain so have no way to track gas used.
 *
 * Generally these models should be optimized to return quickly by performing any
 * long running operations (like fetching external data) outside of the functions defined.
 * This is because the functions in the model are called once for every route and every
 * amount that is considered in the algorithm so it is important to minimize the number of
 * long running operations.
 */
export type IGasModel<TRouteWithValidQuote extends RouteWithValidQuote> = {
  estimateGasCost(routeWithValidQuote: TRouteWithValidQuote): {
    gasEstimate: BigNumber;
    gasCostInToken: CurrencyAmount | ExtendedCurrencyAmount<any>;
    gasCostInUSD: CurrencyAmount;
  };
  calculateL1GasFees?(routes: TRouteWithValidQuote[]): Promise<L1ToL2GasCosts>;
};

export abstract class IRiverexGasModelFactory {
  public abstract buildGasModel({
                                  chainId,
                                  gasPriceWei,
                                  token,
                                  rawPools,
                                }: BuildRiverexGasModelFactoryType): Promise<IGasModel<RiverexRouteWithValidQuote>>;
}

