import { useEffect, useRef, useState } from "react";
import { KinesisVideo } from "aws-sdk";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
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
  PEER_STATUS_ACTIVE,
} from "../constants";
import type { AWSCredentials } from "../AWSCredentials";
import type { ConfigOptions } from "../ConfigOptions";
import type { Peer } from "../Peer";

/**
 * @description Handles peer connection to a viewer signaling client.
 **/
function useViewerPeerConnection(config: {
  channelARN: string;
  credentials: AWSCredentials;
  region: string;
}): {
  error: Error | undefined;
  peer: Peer;
} {
  const { channelARN, credentials, region } = config;
  const { accessKeyId, secretAccessKey } = credentials;
  const role = KVSWebRTC.Role.VIEWER;
  const clientId = useRef<string>();

  const kinesisVideoClientRef = useRef<KinesisVideo>(
    new KinesisVideo({
      region,
      accessKeyId,
      secretAccessKey,
      correctClockSkew: true,
    })
  );

  const kinesisVideoClient = kinesisVideoClientRef.current;
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection>();
  const [peerMedia, setPeerMedia] = useState<MediaStream>();
  const [signalingClientError, setSignalingClientError] = useState<Error>();

  const signalingChannelEndpoints = useSignalingChannelEndpoints({
    channelARN,
    kinesisVideoClient,
    role,
  });

  const iceServers = useIceServers({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.HTTPS,
    credentials,
    region,
  });

  const signalingClient = useSignalingClient({
    channelARN,
    channelEndpoint: signalingChannelEndpoints?.WSS,
    clientId: clientId.current,
    credentials,
    kinesisVideoClient,
    region,
    role,
  });

  /** Set the client id. */
  useEffect(() => {
    clientId.current = uuid();
  }, [clientId]);

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
      await peerConnection?.setLocalDescription(
        await peerConnection?.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      if (!peerConnection?.localDescription) {
        throw new Error(ERROR_PEER_CONNECTION_LOCAL_DESCRIPTION_REQUIRED);
      }

      signalingClient?.sendSdpOffer(peerConnection.localDescription);
    }

    async function handleSdpAnswer(answer: RTCSessionDescriptionInit) {
      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }
      await peerConnection.setRemoteDescription(answer);
    }

    function handleSignalingChannelIceCandidate(candidate: RTCIceCandidate) {
      if (!candidate) {
        throw new Error(ERROR_ICE_CANDIDATE_NOT_FOUND);
      }
      if (!peerConnection) {
        throw new Error(ERROR_PEER_CONNECTION_NOT_INITIALIZED);
      }
      peerConnection?.addIceCandidate(candidate);
    }

    function handlePeerIceCandidate({ candidate }: RTCPeerConnectionIceEvent) {
      if (!signalingClient) {
        throw new Error(ERROR_SIGNALING_CLIENT_NOT_CONNECTED);
      }
      if (candidate) {
        signalingClient.sendIceCandidate(candidate);
      }
    }

    function handlePeerTrack({ streams = [] }: RTCTrackEvent) {
      setPeerMedia(streams[0]);
    }

    signalingClient?.on("open", handleOpen);
    signalingClient?.on("sdpAnswer", handleSdpAnswer);
    signalingClient?.on("iceCandidate", handleSignalingChannelIceCandidate);
    signalingClient?.on("error", setSignalingClientError);

    peerConnection?.addEventListener("icecandidate", handlePeerIceCandidate);
    peerConnection?.addEventListener("track", handlePeerTrack);

    return function cleanup() {
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
  }, [peerConnection, signalingClient]);

  /** Handle peer media lifecycle. */
  useEffect(() => {
    return function cleanup() {
      peerMedia?.getTracks().forEach((track) => track.stop());
    };
  }, [peerMedia]);

  return {
    error: signalingClientError,
    peer: {
      id: clientId.current,
      connection: peerConnection,
      media: peerMedia,
      status: PEER_STATUS_ACTIVE,
    },
  };
}

/**
 * @description Opens a viewer connection to an active master signaling channel.
 **/
export function useViewer(
  config: ConfigOptions
): {
  error: Error | undefined;
  localMedia: MediaStream | undefined;
  peer: Peer | undefined;
} {
  const {
    channelARN,
    credentials,
    region,
    media = { audio: true, video: true },
  } = config;
  const { error: streamError, media: localMedia } = useLocalMedia(media);
  const { error: peerConnectionError, peer } = useViewerPeerConnection({
    channelARN,
    credentials,
    region,
  });

  /** Send local media stream to remote peer. */
  useEffect(() => {
    localMedia
      ?.getTracks()
      .forEach((track: MediaStreamTrack) =>
        peer.connection?.addTrack(track, localMedia)
      );
  }, [localMedia, peer.connection]);

  return { error: streamError || peerConnectionError, localMedia, peer };
}
