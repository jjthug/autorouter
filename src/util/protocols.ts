export enum Protocol {
  V2 = "V2",
  V3 = "V3",
  MIXED = "MIXED",
  RIVERDEX = "RIVERDEX"
}

export const TO_PROTOCOL = (protocol: string): Protocol | string => {
  switch (protocol.toLowerCase()) {
    case 'v3':
      return Protocol.V3;
    case 'v2':
      return Protocol.V2;
    case 'mixed':
      return Protocol.MIXED;
    case 'riverdex':
      return Protocol.RIVERDEX;
    default:
      throw new Error(`Unknown protocol: {id}`);
  }
};
