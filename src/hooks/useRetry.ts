import { useEffect, useState } from "react";

export function useRetry(
  fn: () => Promise<unknown>,
  count = 1
): { error: Error | undefined } {
  const [error, setError] = useState<Error>();
  const [retries, setRetries] = useState(0);
  const [retryError, setRetryError] = useState<Error>();
  const [didSucceed, setDidSucceed] = useState(false);

  useEffect(() => {
    if (retries < count) {
      fn()
        .then(() => setDidSucceed(true))
        .catch((error: Error) => {
          setTimeout(() => {
            setRetries(retries + 1);
            setRetryError(error);
          }, (retries + 1) * 4000);
        });
    }
  }, [count, fn, retries]);

  useEffect(() => {
    if (retries >= count && !didSucceed) {
      setError(retryError);
    }
  }, [count, didSucceed, retries, retryError]);

  return { error };
}
