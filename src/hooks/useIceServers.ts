import { useEffect, useState } from "react";
import type { AWSCredentials } from "../AWSCredentials";
import { KinesisVideoSignalingChannels } from "aws-sdk";
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
  const {
    channelARN,
    channelEndpoint,
    credentials: { accessKeyId, secretAccessKey },
    region,
  } = config;

  const [iceServers, setIceServers] = useState<RTCIceServer[] | undefined>();

  useEffect(() => {
    if (!channelEndpoint) {
      return;
    }
    const kinesisVideoSignalingChannelsClient = new KinesisVideoSignalingChannels(
      {
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: channelEndpoint,
        correctClockSkew: true,
      }
    );

    kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise()
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
          (iceServer: KinesisVideoSignalingChannels.IceServer) => {
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
  }, [accessKeyId, channelARN, channelEndpoint, region, secretAccessKey]);

  return iceServers;
}
