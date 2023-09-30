import { IRiverexProvider, RiverexPool } from './riverex-provider';
import {URISubgraphProvider} from "../uri-subgraph-provider";

export class RiverexURIProvider
  extends URISubgraphProvider<RiverexPool>
  implements IRiverexProvider {}
