export const withErrorLog =
  (fn: (e: Error) => void) =>
  (error: Error): void => {
    console.error(error);
    return fn(error);
  };
