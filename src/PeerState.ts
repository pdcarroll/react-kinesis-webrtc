import type { Peer } from "./Peer";

export type PeerState = {
  entities: Map<string, Peer>;
};
