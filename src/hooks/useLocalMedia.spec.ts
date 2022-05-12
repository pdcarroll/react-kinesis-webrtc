import { cleanup, renderHook } from "@testing-library/react-hooks";
import {
  mockGetUserMedia,
  mockMediaDevices,
  mockMediaTrack,
  mockUserMediaStream,
} from "../../__test__/mocks/mockNavigator";
import { useLocalMedia } from "./useLocalMedia";

beforeEach(() => {
  mockMediaDevices();
});

test("returns a media stream", async () => {
  const { result, waitForNextUpdate } = renderHook(() =>
    useLocalMedia({ audio: true, video: true })
  );
  await waitForNextUpdate();
  expect(result.current.media).toBeDefined();
});

test("returns an error", async () => {
  const getUserMediaError = new Error();
  mockMediaDevices({
    getUserMedia: mockGetUserMedia({ error: getUserMediaError }),
  });
  const { result, waitForNextUpdate } = renderHook(() =>
    useLocalMedia({ audio: true, video: true })
  );
  await waitForNextUpdate();
  expect(result.current.error).toBe(getUserMediaError);
});

test("stops media stream tracks when options are updated", async () => {
  let audio = true;
  const video = true;
  const mediaTrack = mockMediaTrack();
  const userMediaStream = mockUserMediaStream({
    mediaTracks: [mediaTrack as MediaStreamTrack],
  });
  mockMediaDevices({
    getUserMedia: mockGetUserMedia({ userMediaStream }),
  });
  const { rerender, waitForNextUpdate } = renderHook(() =>
    useLocalMedia({ audio, video })
  );
  await waitForNextUpdate();
  audio = false;
  rerender();
  expect(mediaTrack.stop).toHaveBeenCalledTimes(1);
});

test("cancels media stream on cleanup", async () => {
  const { result } = renderHook(() =>
    useLocalMedia({ audio: true, video: true })
  );
  await cleanup();
  expect(result.current.media).toBeUndefined();
});

test("does not access local media when media config options are not set", () => {
  const getUserMedia = mockGetUserMedia();
  mockMediaDevices({ getUserMedia });
  renderHook(() => useLocalMedia({ audio: false, video: false }));
  expect(getUserMedia).toHaveBeenCalledTimes(0);
});

test("is cancellable", async () => {
  const { result, rerender } = renderHook(() =>
    useLocalMedia({ audio: true, video: true })
  );
  result.current.cancel();
  rerender();
  expect(result.current.media).toBeUndefined();
});
