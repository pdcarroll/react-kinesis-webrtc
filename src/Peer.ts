export interface Peer {
  id: string;
  connection?: RTCPeerConnection;
  isWaitingForMedia?: boolean;
  media?: MediaStream;
}
