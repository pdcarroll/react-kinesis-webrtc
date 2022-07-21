import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";

type AWSCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type MediaConfig = {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
};

export interface ConfigOptions {
  channelARN: string;
  credentials: AWSCredentials;
  debug?: boolean;
  region: string;
}

export interface PeerConfigOptions extends ConfigOptions {
  media: MediaConfig;
}

export interface SignalingClientConfigOptions extends ConfigOptions {
  channelEndpoint: string | undefined;
  clientId?: string;
  role: KVSWebRTC.Role;
  systemClockOffset: number;
}
