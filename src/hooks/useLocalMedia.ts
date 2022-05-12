import { useEffect, useRef, useState } from "react";
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
}): {
  error: Error | undefined;
  media: MediaStream | undefined;
  cancel: () => void;
} {
  const [media, setMedia] = useState<MediaStream>();
  const [error, setError] = useState<Error>();
  const isCancelled = useRef(false);

  useEffect(() => {
    if (isCancelled.current) {
      return;
    }

    if (!video && !audio) {
      return;
    }

    let _media: MediaStream;

    navigator.mediaDevices
      .getUserMedia({ video, audio })
      .then((mediaStream) => {
        _media = mediaStream;
        if (isCancelled.current) {
          _media.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        setMedia(mediaStream);
      })
      .catch(
        withErrorLog((error) => {
          if (isCancelled.current) {
            return;
          }
          setError(error);
        })
      );

    return function cleanup() {
      isCancelled.current = true;

      _media?.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
    };
  }, [video, audio, isCancelled]);

  const cancel = () => {
    isCancelled.current = true;
  };

  return {
    error,
    media,
    cancel,
  };
}
