import { Token } from '@uniswap/sdk-core';
import { FACTORY_ADDRESS } from '@uniswap/v3-sdk';
import { ChainId, NETWORKS_WITH_SAME_UNISWAP_ADDRESSES } from './chains';
import { pack, keccak256 } from '@ethersproject/solidity'
import { getCreate2Address } from '@ethersproject/address'

const CELO_V3_CORE_FACTORY_ADDRESSES =
  '0xAfE208a311B21f13EF87E33A90049fC17A7acDEc';
const CELO_QUOTER_ADDRESSES = '0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8';
const CELO_MULTICALL_ADDRESS = '0x633987602DE5C4F337e3DbF265303A1080324204';

const ARBITRUM_GOERLI_V3_CORE_FACTORY_ADDRESSES =
  '0x4893376342d5D7b3e31d4184c08b265e5aB2A3f6';
const ARBITRUM_GOERLI_QUOTER_ADDRESSES =
  '0x1dd92b83591781D0C6d98d07391eea4b9a6008FA';
const ARBITRUM_GOERLI_MULTICALL_ADDRESS =
  '0x8260CB40247290317a4c062F3542622367F206Ee';

const OPTIMISM_GOERLI_V3_CORE_FACTORY_ADDRESSES =
  '0xB656dA17129e7EB733A557f4EBc57B76CFbB5d10';
const OPTIMISM_GOERLI_QUOTER_ADDRESSES =
  '0x9569CbA925c8ca2248772A9A4976A516743A246F';
const OPTIMISM_GOERLI_MULTICALL_ADDRESS =
  '0x07F2D8a2a02251B62af965f22fC4744A5f96BCCd';

const BSC_V3_CORE_FACTORY_ADDRESSES =
  '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7';
const BSC_QUOTER_ADDRESSES = '0x78D78E420Da98ad378D7799bE8f4AF69033EB077';
const BSC_MULTICALL_ADDRESS = '0x963Df249eD09c358A4819E39d9Cd5736c3087184';

export const BSC_TICK_LENS_ADDRESS =
  '0xD9270014D396281579760619CCf4c3af0501A47C';
export const BSC_NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613';
export const BSC_SWAP_ROUTER_02_ADDRESS =
  '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2';
export const BSC_V3_MIGRATOR_ADDRESS =
  '0x32681814957e0C13117ddc0c2aba232b5c9e760f';

export const MAINNET_RIVEREX_FACTORY =
  '0x8169e76dd8BE598B79db480C4fc7DA3ab4E09517';

export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
  ...constructSameAddressMap(FACTORY_ADDRESS),
  [ChainId.CELO]: CELO_V3_CORE_FACTORY_ADDRESSES,
  [ChainId.CELO_ALFAJORES]: CELO_V3_CORE_FACTORY_ADDRESSES,
  [ChainId.OPTIMISM_GOERLI]: OPTIMISM_GOERLI_V3_CORE_FACTORY_ADDRESSES,
  [ChainId.ARBITRUM_GOERLI]: ARBITRUM_GOERLI_V3_CORE_FACTORY_ADDRESSES,
  [ChainId.BSC]: BSC_V3_CORE_FACTORY_ADDRESSES,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};


// todo change
export const INIT_CODE_HASH: AddressMap = {
  [ChainId.MAINNET]: "0x4865ea389995915db67b44b39fd00c73c081158e770991b408389498fb8dc480",
  [ChainId.POLYGON]: "0x4865ea389995915db67b44b39fd00c73c081158e770991b408389498fb8dc480",
  [ChainId.BSC]: "0x4865ea389995915db67b44b39fd00c73c081158e770991b408389498fb8dc480",
};

export const RIVEREX_FACTORY_ADDRESSES: AddressMap = {
  [ChainId.MAINNET]: MAINNET_RIVEREX_FACTORY,
  [ChainId.POLYGON]: MAINNET_RIVEREX_FACTORY,
  [ChainId.BSC]: MAINNET_RIVEREX_FACTORY,
};

export const QUOTER_V2_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'),
  [ChainId.CELO]: CELO_QUOTER_ADDRESSES,
  [ChainId.CELO_ALFAJORES]: CELO_QUOTER_ADDRESSES,
  [ChainId.OPTIMISM_GOERLI]: OPTIMISM_GOERLI_QUOTER_ADDRESSES,
  [ChainId.ARBITRUM_GOERLI]: ARBITRUM_GOERLI_QUOTER_ADDRESSES,
  [ChainId.BSC]: BSC_QUOTER_ADDRESSES,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};

export const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap = {
  [ChainId.MAINNET]: '0x84E44095eeBfEC7793Cd7d5b57B7e401D7f1cA2E',
  [ChainId.RINKEBY]: '0x84E44095eeBfEC7793Cd7d5b57B7e401D7f1cA2E',
  [ChainId.ROPSTEN]: '0x84E44095eeBfEC7793Cd7d5b57B7e401D7f1cA2E',
  [ChainId.GÖRLI]: '0xBa60b6e6fF25488308789E6e0A65D838be34194e',
};

export const UNISWAP_MULTICALL_ADDRESSES: AddressMap = {
  ...constructSameAddressMap('0x1F98415757620B543A52E61c46B32eB19261F984'),
  [ChainId.CELO]: CELO_MULTICALL_ADDRESS,
  [ChainId.CELO_ALFAJORES]: CELO_MULTICALL_ADDRESS,
  [ChainId.OPTIMISM_GOERLI]: OPTIMISM_GOERLI_MULTICALL_ADDRESS,
  [ChainId.ARBITRUM_GOERLI]: ARBITRUM_GOERLI_MULTICALL_ADDRESS,
  [ChainId.BSC]: BSC_MULTICALL_ADDRESS,
  // TODO: Gnosis + Moonbeam contracts to be deployed
};

export const SWAP_ROUTER_02_ADDRESSES = (chainId: number) => {
  if (chainId == ChainId.BSC) {
    return BSC_SWAP_ROUTER_02_ADDRESS;
  }
  return '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
};

export const OVM_GASPRICE_ADDRESS =
  '0x420000000000000000000000000000000000000F';
export const ARB_GASINFO_ADDRESS = '0x000000000000000000000000000000000000006C';
export const TICK_LENS_ADDRESS = '0xbfd8137f7d1516D3ea5cA83523914859ec47F573';
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
export const V3_MIGRATOR_ADDRESS = '0xA5644E29708357803b5A882D272c41cC0dF92B34';
export const MULTICALL2_ADDRESS = '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696';

export type AddressMap = { [chainId: number]: string };

export function constructSameAddressMap<T extends string>(
  address: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_UNISWAP_ADDRESSES.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}

export const computePairAddress = ({
  factoryAddress,
  tokenA,
  tokenB,
  fee,
  INIT_CODE_HASH}: {
    factoryAddress: string
    tokenA: Token
    tokenB: Token
    fee: string
    INIT_CODE_HASH: string
  }
) => {
  return getCreate2Address(
    factoryAddress,
    keccak256(['bytes'], [pack(['address', 'address','uint32'], [tokenA.address, tokenB.address, fee])]), INIT_CODE_HASH
  )
}

export type Fee = string;

export const WETH9: {
  [chainId in Exclude<
    ChainId,
    | ChainId.POLYGON
    | ChainId.POLYGON_MUMBAI
    | ChainId.CELO
    | ChainId.CELO_ALFAJORES
    | ChainId.GNOSIS
    | ChainId.MOONBEAM
    | ChainId.BSC
  >]: Token;
} = {
  [ChainId.MAINNET]: new Token(
    ChainId.MAINNET,
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ROPSTEN]: new Token(
    ChainId.ROPSTEN,
    '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.RINKEBY]: new Token(
    ChainId.RINKEBY,
    '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.GÖRLI]: new Token(
    ChainId.GÖRLI,
    '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.KOVAN]: new Token(
    ChainId.KOVAN,
    '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISM]: new Token(
    ChainId.OPTIMISM,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISM_GOERLI]: new Token(
    ChainId.OPTIMISM_GOERLI,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.OPTIMISTIC_KOVAN]: new Token(
    ChainId.OPTIMISTIC_KOVAN,
    '0x4200000000000000000000000000000000000006',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_ONE]: new Token(
    ChainId.ARBITRUM_ONE,
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_RINKEBY]: new Token(
    ChainId.ARBITRUM_RINKEBY,
    '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681',
    18,
    'WETH',
    'Wrapped Ether'
  ),
  [ChainId.ARBITRUM_GOERLI]: new Token(
    ChainId.ARBITRUM_GOERLI,
    '0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3',
    18,
    'WETH',
    'Wrapped Ether'
  ),
};
