
import {MixedRoute, RiverexRoute, V2Route, V3Route} from '../../../../routers';
import {Protocol} from "../../../../util";

interface CachedRouteParams<Route extends V3Route | V2Route | MixedRoute | RiverexRoute> {
  route: Route;
  percent: number;
}

/**
 * Class defining the route to cache
 *
 * @export
 * @class CachedRoute
 */
export class CachedRoute<Route extends V3Route | V2Route | MixedRoute | RiverexRoute> {
  public readonly route: Route;
  public readonly percent: number;

  /**
   * @param route
   * @param percent
   */
  constructor({ route, percent }: CachedRouteParams<Route>) {
    this.route = route;
    this.percent = percent;
  }

  public get protocol(): Protocol {
    return this.route.protocol;
  }
}
