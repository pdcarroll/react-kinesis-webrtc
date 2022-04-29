export function mockMediaDevices({
  getUserMedia = mockGetUserMedia(),
} = {}): void {
  Object.defineProperty(global, "navigator", {
    value: Object.assign(
      {},
      {
        mediaDevices: { getUserMedia },
      }
    ),
    writable: true,
  });
}

export function mockMediaTrack(): Partial<MediaStreamTrack> {
  return {
    stop: jest.fn(),
  };
}

export function mockUserMediaStream({
  mediaTracks = [mockMediaTrack() as MediaStreamTrack],
} = {}): MediaStream {
  return {
    getTracks: () => mediaTracks,
  } as MediaStream;
}

export function mockGetUserMedia({
  error,
  userMediaStream = mockUserMediaStream() as MediaStream,
}: { error?: Error; userMediaStream?: MediaStream } = {}): jest.Mock {
  return jest.fn(
    (): Promise<MediaStream> =>
      new Promise((resolve, reject) =>
        error ? reject(error) : resolve(userMediaStream as MediaStream)
      )
  );
}
