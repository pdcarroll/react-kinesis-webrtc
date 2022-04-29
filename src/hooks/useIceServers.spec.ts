import { cleanup, renderHook } from "@testing-library/react-hooks";
import {
  GetIceServerConfigCommandInput,
  GetIceServerConfigCommandOutput,
} from "@aws-sdk/client-kinesis-video-signaling";
import { AwsStub } from "aws-sdk-client-mock";
import * as mockConfig from "../../__test__/fixtures/config.json";
import { mockGetIceServerConfig } from "../../__test__/mocks/mockKinesisVideoSignalingClient";
import { useIceServers } from "./useIceServers";

let getIceServerConfigMock: AwsStub<
  GetIceServerConfigCommandInput,
  GetIceServerConfigCommandOutput
>;

beforeEach(() => {
  getIceServerConfigMock = mockGetIceServerConfig(null);
});

afterEach(() => {
  getIceServerConfigMock.reset();
});

test("returns a list of ice servers", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useIceServers(mockConfig)
  );
  await waitForNextUpdate();
  expect(result.current.iceServers).toBeInstanceOf(Array);
});

test("returns an error", async () => {
  const error = new Error();
  getIceServerConfigMock = mockGetIceServerConfig(error);
  const { result, waitForNextUpdate } = renderHook(() =>
    useIceServers(mockConfig)
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(error);
});

test("cancels on cleanup", async () => {
  const { result } = renderHook(() => useIceServers(mockConfig));
  await cleanup();
  expect(result.current.iceServers).toBeUndefined();
});
