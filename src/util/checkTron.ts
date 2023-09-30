import { ChainId } from './chains';

export function isTronChain(chainId: number): boolean {
  return String(chainId) === String(ChainId.TRON) || String(chainId) === String(ChainId.TRON_SHASTA);
}