import { useEffect } from "react";

export function useHandlePeerIceConnectionStateChange(
  connection: RTCPeerConnection,
  handler: () => void
): void {
  useEffect(() => {
    connection.addEventListener("iceconnectionstatechange", handler);

    return function cleanup() {
      connection.removeEventListener("iceconnectionstatechange", handler);
    };
  }, [connection, handler]);
}
