import { ChainId } from './chains';

export const URL_FOR_NATIVE_USD_PRICE: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'http://localhost:3000/nativePrice'
};