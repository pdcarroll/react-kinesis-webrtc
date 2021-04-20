import { useEffect, useState } from "react";
import { KinesisVideo } from "@aws-sdk/client-kinesis-video";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import type { AWSCredentials } from "../AWSCredentials";

/**
 * @description Creates and opens a signaling channel. Closes connection on cleanup.
 **/
export function useSignalingClient(config: {
  channelARN: string;
  channelEndpoint?: string;
  clientId?: string;
  credentials: AWSCredentials;
  region: string;
  role: KVSWebRTC.Role;
  kinesisVideoClient: KinesisVideo;
}): {
  error: Error | undefined;
  signalingClient: KVSWebRTC.SignalingClient | undefined;
} {
  const {
    channelARN,
    channelEndpoint,
    clientId,
    credentials: { accessKeyId, secretAccessKey },
    kinesisVideoClient,
    region,
    role,
  } = config;

  const [signalingClient, setSignalingClient] = useState<
    KVSWebRTC.SignalingClient
  >();
  const [signalingClientError, setSignalingClientError] = useState<Error>();
  const { systemClockOffset } = kinesisVideoClient.config;

  /** Create signaling client when endpoints are available. */
  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    if (!clientId && role === KVSWebRTC.Role.VIEWER) {
      return;
    }
    setSignalingClient(
      new KVSWebRTC.SignalingClient({
        channelARN,
        channelEndpoint,
        clientId,
        credentials: { accessKeyId, secretAccessKey },
        region,
        role,
        systemClockOffset,
      })
    );
  }, [
    accessKeyId,
    channelARN,
    channelEndpoint,
    clientId,
    region,
    role,
    secretAccessKey,
    systemClockOffset,
  ]);

  /** Handle signaling client lifecycle. */
  useEffect(() => {
    function handleSignalingClientError(error: Error) {
      setSignalingClientError(error);
    }

    signalingClient?.on("error", handleSignalingClientError);
    signalingClient?.open();

    return function cleanup() {
      signalingClient?.close();
      signalingClient?.off("error", handleSignalingClientError);
    };
  }, [signalingClient]);

  return { error: signalingClientError, signalingClient };
}
