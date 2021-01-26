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
}): RTCIceServer[] | undefined {
  const { channelARN, channelEndpoint, credentials, region } = config;
  const [iceServers, setIceServers] = useState<RTCIceServer[] | undefined>();

  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    const kinesisVideoSignalingChannelsClient = new KinesisVideoSignalingClient(
      {
        region,
        credentials,
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
      .then(setIceServers);
  }, [credentials.accessKeyId, channelARN, channelEndpoint, region, credentials.secretAccessKey]);

  return iceServers;
}
