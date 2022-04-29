import { act, cleanup, renderHook } from "@testing-library/react-hooks";
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

test("opens the signaling client", () => {
  const { result } = renderHook(() =>
    useSignalingClient(mockSignalingClientConfig)
  );
  expect(result.current.signalingClient?.open).toHaveBeenCalledTimes(1);
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

test("initializes and opens the signaling client once channelEndpoint is defined", () => {
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
  expect(result.current.signalingClient?.open).toHaveBeenCalledTimes(1);
});

test("closes the signaling client on cleanup", async () => {
  const { result } = renderHook(() =>
    useSignalingClient(mockSignalingClientConfig)
  );
  await cleanup();
  expect(result.current.signalingClient?.close).toHaveBeenCalledTimes(1);
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

// todo: make this test work
test.skip("cancels on cleanup", async () => {
  const { result } = renderHook(() =>
    useSignalingClient(mockSignalingClientConfig)
  );
  act(() => {
    result.current.signalingClient?.emit("error", new Error());
  });
  await cleanup();
  expect(result.current.error).toBeUndefined();
});
