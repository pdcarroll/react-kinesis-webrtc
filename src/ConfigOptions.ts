import type { AWSCredentials } from "./AWSCredentials";

type MediaConfig = {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
};

export interface ConfigOptions
  extends Record<string, string | AWSCredentials | MediaConfig> {
  channelARN: string;
  credentials: AWSCredentials;
  media: MediaConfig;
  region: string;
}
