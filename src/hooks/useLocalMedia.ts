import { useEffect, useState } from "react";

/**
 * @description Opens and returns local media stream. Closes stream on cleanup.
 **/
export function useLocalMedia({
  audio = true,
  video = true,
}: {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
}): { error: Error | undefined; media: MediaStream | undefined } {
  const [media, setMedia] = useState<MediaStream>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          return;
        }
        setMedia(stream);
      })
      .catch(setError);
    return () => {
      cancelled = true;
    };
  }, [video, audio]);

  useEffect(() => {
    return function cleanup() {
      media?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    };
  }, [media]);

  return { error, media };
}
