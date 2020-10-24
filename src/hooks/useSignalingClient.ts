import { useEffect, useState } from "react";
import { KinesisVideo } from "aws-sdk";
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
}): KVSWebRTC.SignalingClient | undefined {
  const {
    channelARN,
    channelEndpoint,
    clientId,
    credentials: { accessKeyId, secretAccessKey },
    kinesisVideoClient,
    region,
    role,
  } = config;

  const [client, setClient] = useState<KVSWebRTC.SignalingClient>();
  const { systemClockOffset } = kinesisVideoClient.config;

  /** Create signaling client when endpoints are available. */
  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    if (!clientId && role === KVSWebRTC.Role.VIEWER) {
      return;
    }
    setClient(
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
    client?.open();

    return function cleanup() {
      client?.close();
    };
  }, [client]);

  return client;
}
