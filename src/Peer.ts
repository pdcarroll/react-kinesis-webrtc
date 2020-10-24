import {
  PEER_STATUS_ACTIVE,
  PEER_STATUS_INACTIVE,
  PEER_STATUS_PENDING_MEDIA,
} from "./constants";

const peerStatus = [
  PEER_STATUS_ACTIVE,
  PEER_STATUS_INACTIVE,
  PEER_STATUS_PENDING_MEDIA,
] as const;

type PeerStatus = typeof peerStatus[number];

export interface Peer {
  id?: string;
  connection?: RTCPeerConnection;
  media?: MediaStream;
  handlers?: {
    iceCandidate?: (event: RTCPeerConnectionIceEvent) => void;
    iceConnectionStateChange?: (event: Event) => void;
    track?: (event: RTCTrackEvent) => void;
  };
  status?: PeerStatus;
}
