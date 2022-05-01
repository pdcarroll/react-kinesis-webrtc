import { useEffect, useState } from "react";
import { withErrorLog } from "../withErrorLog";

/**
 * @description Opens and returns local media stream. Closes stream on cleanup.
 **/
export function useLocalMedia({
  audio,
  video,
}: {
  audio?: boolean;
  video?: boolean | MediaTrackConstraints;
}): { error: Error | undefined; media: MediaStream | undefined } {
  const [media, setMedia] = useState<MediaStream>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!video && !audio) {
      return;
    }

    let _media: MediaStream;
    let isCancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then((mediaStream) => {
        if (isCancelled) {
          return;
        }
        _media = mediaStream;
        setMedia(mediaStream);
      })
      .catch(
        withErrorLog((error) => {
          if (isCancelled) {
            return;
          }
          setError(error);
        })
      );

    return function cleanup() {
      isCancelled = true;

      _media?.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
    };
  }, [video, audio]);

  return { error, media };
}
