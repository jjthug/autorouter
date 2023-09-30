import {MixedRoute, RiverexRoute, V2Route, V3Route} from '../../../../router';
import { CandidatePoolsBySelectionCriteria } from '../../../functions/get-candidate-pools';
import {RawRiverexPool} from "../../../../../providers";

export interface GetRoutesResult<Route extends V2Route | V3Route | MixedRoute | RiverexRoute> {
  routes: Route[];
  rawPools?: RawRiverexPool[];
  candidatePools: CandidatePoolsBySelectionCriteria;
}
