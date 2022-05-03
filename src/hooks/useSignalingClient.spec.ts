import { act, renderHook } from "@testing-library/react-hooks";
import * as KVSWebRTC from "amazon-kinesis-video-streams-webrtc";
import * as mockBaseConfig from "../../__test__/fixtures/config.json";
import { mockSignalingClient } from "../../__test__/mocks/mockSignalingClient";
import { SignalingClientConfigOptions } from "../ConfigOptions";
import { useSignalingClient } from "./useSignalingClient";
import { randomUUID } from "crypto";

const mockSignalingClientConfig: SignalingClientConfigOptions = {
  ...mockBaseConfig,
  clientId: randomUUID(),
  role: KVSWebRTC.Role.VIEWER,
  systemClockOffset: 0,
};

beforeEach(() => {
  mockSignalingClient();
});

afterEach(() => {
  jest.clearAllMocks();
});

test("returns the signaling client instance", () => {
  const { result } = renderHook(() =>
    useSignalingClient(mockSignalingClientConfig)
  );
  expect(result.current.signalingClient).toBeDefined();
});

test("signaling client is not initialized when channelEndpoint is undefined", () => {
  const { result } = renderHook(() =>
    useSignalingClient({
      ...mockSignalingClientConfig,
      channelEndpoint: undefined,
    })
  );
  expect(result.current.signalingClient).toBeUndefined();
});

test("initializes the signaling client when channelEndpoint is defined", () => {
  let channelEndpoint = "";
  const { result, rerender } = renderHook(() =>
    useSignalingClient({
      ...mockSignalingClientConfig,
      channelEndpoint,
    })
  );
  channelEndpoint = "wss://test";
  rerender();
  expect(result.current.signalingClient).toBeDefined();
});

test("returns a signaling client error", () => {
  const { result } = renderHook(() =>
    useSignalingClient(mockSignalingClientConfig)
  );
  const signalingClientError = new Error();
  act(() => {
    result.current.signalingClient?.emit("error", signalingClientError);
  });
  expect(result.current.error).toBe(signalingClientError);
});
