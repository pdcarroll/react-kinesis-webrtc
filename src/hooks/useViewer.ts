import { useEffect, useRef, useState } from "react";
import { KinesisVideo } from "@aws-sdk/client-kinesis-video";
import { Role, SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { v4 as uuid } from "uuid";
import { useIceServers } from "./useIceServers";
import { useLocalMedia } from "./useLocalMedia";
import { useSignalingChannelEndpoints } from "./useSignalingChannelEndpoints";
import { useSignalingClient } from "./useSignalingClient";
import {
  ERROR_ICE_CANDIDATE_NOT_FOUND,
  ERROR_PEER_CONNECTION_LOCAL_DESCRIPTION_REQUIRED,
  ERROR_PEER_CONNECTION_NOT_INITIALIZED,
  ERROR_SIGNALING_CLIENT_NOT_CONNECTED,
} from "../constants";
import { ConfigOptions, PeerConfigOptions } from "../ConfigOptions";
import { Peer } from "../Peer";
import { getLogger } from "../logger";

/**
 * @description Handles peer connection to a viewer signaling client.
 **/
function useViewerPeerConnection(
  config: ConfigOptions & {
    viewerOnly?: boolean;
  }
): {
  _signalingClient: SignalingClient | undefined;
  error: Error | undefined;
  peer: Peer;
} {
  const { channelARN, credentials, debug = false, region, viewerOnly } = config;
  const logger = useRef(getLogger({ debug }));
  const role = Role.VIEWER;
  const clientId = useRef<string>(uuid());

  const kinesisVideoClientRef = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      credentials,
    })
  );

  const kinesisVideoClient = kinesisVideoClientRef.current;
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection>();
  const [peerMedia, setPeerMedia] = useState<MediaStream>();
  const [peerError, setPeerError] = useState<Error>();

  const {
    error: signalingChannelEndpointsError,
    signalingChannelEndpoints,
  } = useSignalingChannelEndpoints({
    channelARN,
    kinesisVideoClient,
    role,
  });

  const { error: iceServersError, iceServers } = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  const { error: signalingClientError, signalingClient } = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    clientId: clientId.current,
    credentials,
    region,
    role,
    systemClockOffset: kinesisVideoClient.config.systemClockOffset,
  });

  /** Initialize the peer connection with ice servers. */
  useEffect(() => {
    if (iceServers) {
      setPeerConnection(
        new RTCPeerConnection({
          iceServers,
          iceTransportPolicy: "all",
        })
      );
    }
  }, [iceServers]);

  /** Handle signaling client and remote peer lifecycle. */
  useEffect(() => {
    if (!peerConnection) {
      return;
    }

    async function handleOpen() {
      logger.current.logViewer(`[${clientId.current}] signaling client opened`);

      if (viewerOnly) {
        peerConnection?.addTransceiver("video");
        peerConnection
          ?.getTransceivers()
          .forEach((t) => (t.direction = "recvonly"));
      }

      const sessionDescription = await peerConnection?.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      try {
        await peerConnection?.setLocalDescription(sessionDescription);
      } catch (error) {
        console.error(error);
        return setPeerError(error as Error);
      }

      if (!peerConnection?.localDescription) {
        return setPeerError(
          new Error(ERROR_PEER_CONNECTION_LOCAL_DESCRIPTION_REQUIRED)
        );
      }

      logger.current.logViewer(`[${clientId.current}] sending sdp offer`);

      signalingClient?.sendSdpOffer(peerConnection.localDescription);
    }

    async function handleSdpAnswer(answer: RTCSessionDescriptionInit) {
      logger.current.logViewer(`[${clientId.current}] received sdp answer`);

      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }

      await peerConnection.setRemoteDescription(answer);
    }

    function handleSignalingChannelIceCandidate(candidate: RTCIceCandidate) {
      logger.current.logViewer(
        `[${clientId.current}] received signaling channel ice candidate`
      );

      if (!candidate) {
        throw new Error(ERROR_ICE_CANDIDATE_NOT_FOUND);
      }

      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }

      peerConnection?.addIceCandidate(candidate);
    }

    function handlePeerIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
      logger.current.logViewer(
        `[${clientId.current}] received peer ice candidate`
      );

      if (!signalingClient) {
        throw new Error(ERROR_SIGNALING_CLIENT_NOT_CONNECTED);
      }

      if (candidate) {
        signalingClient.sendIceCandidate(candidate);
      }
    }

    function handlePeerTrack({ streams = [] }: RTCTrackEvent) {
      logger.current.logViewer(`[${clientId.current}] received peer track`);

      setPeerMedia(streams[0]);
    }

    signalingClient?.on("open", handleOpen);
    signalingClient?.on("sdpAnswer", handleSdpAnswer);
    signalingClient?.on("iceCandidate", handleSignalingChannelIceCandidate);

    peerConnection?.addEventListener("icecandidate", handlePeerIceCandidate);
    peerConnection?.addEventListener("track", handlePeerTrack);

    return function cleanup() {
      logger.current.logViewer(`[${clientId.current}] cleanup`);

      signalingClient?.off("open", handleOpen);
      signalingClient?.off("sdpAnswer", handleSdpAnswer);
      signalingClient?.off("iceCandidate", handleSignalingChannelIceCandidate);

      peerConnection?.removeEventListener(
        "icecandidate",
        handlePeerIceCandidate
      );
      peerConnection?.removeEventListener("track", handlePeerTrack);
      peerConnection?.close();
    };
  }, [clientId, logger, peerConnection, signalingClient, viewerOnly]);

  /** Handle peer media lifecycle. */
  useEffect(() => {
    return function cleanup() {
      peerMedia?.getTracks().forEach((track) => track.stop());
    };
  }, [peerMedia]);

  return {
    _signalingClient: signalingClient,
    error:
      signalingChannelEndpointsError ||
      iceServersError ||
      signalingClientError ||
      peerError,
    peer: {
      id: clientId.current,
      connection: peerConnection,
      media: peerMedia,
    },
  };
}

/**
 * @description Opens a viewer connection to an active master signaling channel.
 **/
export function useViewer(
  config: Omit<PeerConfigOptions, "media"> & {
    media?: PeerConfigOptions["media"];
  }
): {
  _signalingClient: SignalingClient | undefined;
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peer: Peer | undefined;
} {
  const { channelARN, credentials, debug, region, media } = config;
  const { error: streamError, media: localMedia } = useLocalMedia(
    media || { audio: false, video: false }
  );
  const {
    _signalingClient,
    error: peerConnectionError,
    peer,
  } = useViewerPeerConnection({
    channelARN,
    credentials,
    debug,
    region,
    viewerOnly: !Boolean(media),
  });

  /** Send local media stream to remote peer. */
  useEffect(() => {
    if (!localMedia || !peer.connection) {
      return;
    }

    localMedia.getTracks().forEach((track: MediaStreamTrack) => {
      (peer.connection as RTCPeerConnection).addTrack(track, localMedia);
    });
  }, [localMedia, peer.connection]);

  return {
    _signalingClient,
    error: streamError || peerConnectionError,
    localMedia,
    peer,
  };
}
