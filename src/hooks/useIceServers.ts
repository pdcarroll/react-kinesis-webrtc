import { useEffect, useState } from "react";
import {
  GetIceServerConfigCommand,
  KinesisVideoSignalingClient,
  IceServer,
} from "@aws-sdk/client-kinesis-video-signaling";
import type { AWSCredentials } from "../AWSCredentials";
import { ERROR_ICE_SERVERS_RESPONSE } from "../constants";

/**
 * @description Fetches ice servers for a signaling channel.
 **/
export function useIceServers(config: {
  channelARN: string;
  channelEndpoint?: string;
  credentials: AWSCredentials;
  region: string;
}): { error: Error | undefined; iceServers: RTCIceServer[] | undefined } {
  const { channelARN, channelEndpoint, credentials, region } = config;
  const [error, setError] = useState<Error>();
  const [iceServers, setIceServers] = useState<RTCIceServer[]>();

  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    const kinesisVideoSignalingChannelsClient = new KinesisVideoSignalingClient(
      {
        region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
        endpoint: channelEndpoint,
      }
    );

    const getIceServerConfigCommand = new GetIceServerConfigCommand({
      ChannelARN: channelARN,
    });

    kinesisVideoSignalingChannelsClient
      .send(getIceServerConfigCommand)
      .then((getIceServerConfigResponse) => {
        if (!getIceServerConfigResponse) {
          throw new Error(ERROR_ICE_SERVERS_RESPONSE);
        }
        if (!getIceServerConfigResponse.IceServerList) {
          throw new Error(ERROR_ICE_SERVERS_RESPONSE);
        }

        const dict: RTCIceServer[] = [
          { urls: `stun:stun.kinesisvideo.${region}.amazonaws.com:443` },
        ];

        getIceServerConfigResponse?.IceServerList?.forEach(
          (iceServer: IceServer) => {
            if (!iceServer.Uris) {
              return;
            }
            dict.push({
              urls: iceServer.Uris,
              username: iceServer.Username,
              credential: iceServer.Password,
            });
          }
        );

        return dict;
      })
      .then(setIceServers)
      .catch(setError);
  }, [
    credentials.accessKeyId,
    channelARN,
    channelEndpoint,
    region,
    credentials.secretAccessKey,
  ]);

  return { error, iceServers };
}
