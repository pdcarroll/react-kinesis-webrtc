import { useEffect, useRef } from "react";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import { KinesisVideo } from "@aws-sdk/client-kinesis-video";
import { useIceServers } from "./useIceServers";
import { useLocalMedia } from "./useLocalMedia";
import { usePeerState } from "./usePeerState";
import { useSignalingChannelEndpoints } from "./useSignalingChannelEndpoints";
import { useSignalingClient } from "./useSignalingClient";
import {
  ACTION_ADD_PEER_CONNECTION,
  ACTION_ADD_PEER_MEDIA,
  ACTION_CLEANUP_PEER,
  ACTION_REMOVE_PEER_CONNECTION,
  PEER_STATUS_ACTIVE,
  PEER_STATUS_INACTIVE,
  PEER_STATUS_PENDING_MEDIA,
} from "../constants";
import type { AWSCredentials } from "../AWSCredentials";
import type { ConfigOptions } from "../ConfigOptions";
import type { Peer } from "../Peer";
import type { PeerState } from "../PeerState";

/**
 * @description Handles peer connections to a master signaling client.
 **/
function useMasterPeerConnections(config: {
  channelARN: string;
  credentials: AWSCredentials;
  localMedia?: MediaStream;
  region: string;
}): { peerEntities: PeerState["entities"] } {
  const { channelARN, credentials, region } = config;
  const role = KVSWebRTC.Role.MASTER;

  const kinesisVideoClientRef = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      credentials,
    })
  );

  const kinesisVideoClient = kinesisVideoClientRef.current;
  const [peerState, dispatch] = usePeerState();

  const signalingChannelEndpoints = useSignalingChannelEndpoints({
    channelARN,
    kinesisVideoClient,
    role,
  });

  const signalingClient = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    credentials,
    kinesisVideoClient,
    region,
    role,
  });

  const iceServers = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  /** Handle peer connections. */
  useEffect(() => {
    const peerEntities = Array.from(peerState.entities.values());

    for (const { connection, handlers } of peerEntities) {
      if (handlers?.iceCandidate) {
        connection?.addEventListener("icecandidate", handlers.iceCandidate);
      }
      if (handlers?.track) {
        connection?.addEventListener("track", handlers.track);
      }
      if (handlers?.iceConnectionStateChange) {
        connection?.addEventListener(
          "iceconnectionstatechange",
          handlers.iceConnectionStateChange
        );
      }
    }

    return function cleanup() {
      for (const { id, connection, handlers, media, status } of peerEntities) {
        if (handlers?.iceCandidate) {
          connection?.removeEventListener(
            "icecandidate",
            handlers.iceCandidate
          );
        }
        if (handlers?.track) {
          connection?.removeEventListener("track", handlers.track);
        }
        if (handlers?.iceConnectionStateChange) {
          connection?.removeEventListener(
            "iceconnectionstatechange",
            handlers.iceConnectionStateChange
          );
        }
        if (status === PEER_STATUS_INACTIVE) {
          connection?.close();
          media?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          dispatch({ type: ACTION_CLEANUP_PEER, payload: { id } });
        }
      }
    };
  }, [peerState.entities, dispatch]);

  /** Handle signaling client events. */
  useEffect(() => {
    signalingClient?.on("open", handleOpen);
    signalingClient?.on("sdpOffer", handleSdpOffer);

    function handleOpen() {
      void 0;
    }

    async function handleSdpOffer(offer: RTCSessionDescription, id: string) {
      const connection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: "all",
      });

      const handlers = {
        iceCandidate: handleIceCandidate,
        iceConnectionStateChange: handleIceConnectionStateChange,
        track: handleTrack,
      };

      dispatch({
        type: ACTION_ADD_PEER_CONNECTION,
        payload: { id, connection, handlers },
      });

      function handleIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
        if (candidate) {
          signalingClient?.sendIceCandidate(candidate, id);
        }
      }

      function handleIceConnectionStateChange() {
        if (connection.iceConnectionState === "disconnected") {
          dispatch({ type: ACTION_REMOVE_PEER_CONNECTION, payload: { id } });
        }
      }

      function handleTrack({ streams = [] }: RTCTrackEvent) {
        dispatch({
          type: ACTION_ADD_PEER_MEDIA,
          payload: { id, media: streams[0] },
        });
      }

      await connection.setRemoteDescription(offer);
      await connection.setLocalDescription(
        await connection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      if (connection.localDescription) {
        signalingClient?.sendSdpAnswer(connection.localDescription, id);
      }
    }

    return function cleanup() {
      signalingClient?.off("open", handleOpen);
      signalingClient?.off("sdpOffer", handleSdpOffer);
    };
  }, [dispatch, iceServers, signalingClient]);

  return { peerEntities: peerState.entities };
}

/**
 * @description Opens a master connection using an existing signaling channel.
 **/
export function useMaster(
  config: ConfigOptions
): {
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peers: Array<Peer>;
} {
  const {
    channelARN,
    credentials,
    region,
    media = { audio: true, video: true },
  } = config;
  const { error: mediaError, media: localMedia } = useLocalMedia(media);
  const { peerEntities } = useMasterPeerConnections({
    channelARN,
    credentials,
    localMedia,
    region,
  });

  /** Send local media stream to remote peers. */
  useEffect(() => {
    for (const { connection, status } of Array.from(peerEntities.values())) {
      if (status === PEER_STATUS_PENDING_MEDIA) {
        localMedia
          ?.getTracks()
          .forEach((track: MediaStreamTrack) =>
            connection?.addTrack(track, localMedia)
          );
      }
    }
  }, [peerEntities, localMedia]);

  return {
    error: mediaError,
    localMedia,
    peers: Array.from(peerEntities.values()).filter(
      ({ status }) => status === PEER_STATUS_ACTIVE
    ),
  };
}
