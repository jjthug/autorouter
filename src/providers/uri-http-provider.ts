import retry from 'async-retry';
import Timeout from 'await-timeout';
import axios from 'axios';

import { ChainId } from '../util/chains';
import { log } from '../util/log';

import { RiverexPool } from './riverdex/riverex-provider';

/**
 * Gets pools from a URI. The URI shoudl contain a JSON
 * stringified array of RiverexPool
 * objects.
 *
 * @export
 * @class URIHttpProvider
 * @template THttpPool
 */
export class URIHttpProvider<
  THttpPool extends RiverexPool
> {
  constructor(
    private chainId: ChainId,
    private uri: string,
    private timeout = 6000,
    private retries = 2
  ) {}

  public async getPools(): Promise<THttpPool[]> {
    log.info(
      { uri: this.uri },
      `About to get pools through HTTP from URI ${this.uri}`
    );

    let allPools: THttpPool[] = [];

    await retry(
      async () => {
        const timeout = new Timeout();
        const timerPromise = timeout.set(this.timeout).then(() => {
          throw new Error(
            `Timed out getting pools from http api: ${this.timeout}`
          );
        });

        let response;

        /* eslint-disable no-useless-catch */
        try {
          response = await Promise.race([axios.get(this.uri), timerPromise]);
        } catch (err) {
          throw err;
        } finally {
          timeout.clear();
        }
        /* eslint-enable no-useless-catch */

        const { data: poolsBuffer, status } = response;

        if (status != 200) {
          log.error({ response }, `Unabled to get pools from ${this.uri}.`);

          throw new Error(`Unable to get pools from ${this.uri}`);
        }

        const pools = poolsBuffer as THttpPool[];

        log.info(
          { uri: this.uri, chain: this.chainId },
          `Got subgraph pools from uri. Num: ${pools.length}`
        );

        allPools = pools;
      },
      {
        retries: this.retries,
        onRetry: (err, retry) => {
          log.info(
            { err },
            `Failed to get pools from uri ${this.uri}. Retry attempt: ${retry}`
          );
        },
      }
    );

    return allPools;
  }
}
