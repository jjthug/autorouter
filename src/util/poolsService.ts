// todo change url
import { ChainId } from './chains';

export const HTTP_URL_BY_CHAIN: { [chainId in ChainId]?: string } = {
  [ChainId.MAINNET]:
    'http://localhost:3000/mainnet',
  // 'https://apis.riverex.io/rvrsvc/pairs/network/1',
  [ChainId.POLYGON]:
    'http://localhost:3000/polygon',
  [ChainId.BSC]:
    'http://localhost:3000/binance',
};