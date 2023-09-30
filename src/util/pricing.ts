import { ChainId } from './chains';

export const URL_FOR_NATIVE_USD_PRICE: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    process.env.URL_FOR_NATIVE_USD_PRICE_GENERIC,
  [ChainId.BSC]:
    process.env.URL_FOR_NATIVE_USD_PRICE_GENERIC,
  [ChainId.POLYGON]:
    process.env.URL_FOR_NATIVE_USD_PRICE_GENERIC,
  [ChainId.MOONBASE_ALPHA]:
    process.env.URL_FOR_NATIVE_USD_PRICE_GENERIC
};

export const URL_FOR_TOKEN_USD_PRICE: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    process.env.URL_FOR_TOKEN_USD_PRICE_GENERIC,
  [ChainId.BSC]:
    process.env.URL_FOR_TOKEN_USD_PRICE_GENERIC,
  [ChainId.POLYGON]:
    process.env.URL_FOR_TOKEN_USD_PRICE_GENERIC,
  [ChainId.MOONBASE_ALPHA]:
    process.env.URL_FOR_TOKEN_USD_PRICE_GENERIC
};

export const URL_FOR_TOKEN_ETH_PRICE: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    process.env.URL_FOR_TOKEN_ETH_PRICE_GENERIC,
  [ChainId.BSC]:
    process.env.URL_FOR_TOKEN_ETH_PRICE_GENERIC,
  [ChainId.POLYGON]:
    process.env.URL_FOR_TOKEN_ETH_PRICE_GENERIC,
  [ChainId.MOONBASE_ALPHA]:
    process.env.URL_FOR_TOKEN_ETH_PRICE_GENERIC
};