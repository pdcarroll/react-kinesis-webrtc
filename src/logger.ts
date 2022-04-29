class Logger {
  logger?: Console;
  logPrefix = "[react-kinesis-webrtc]";
  constructor(logger?: Console) {
    this.logger = logger;
  }
  private _log = (
    message: unknown,
    prefix?: string,
    prefixStyle?: string
  ): void => {
    this.logger?.log(
      `%c${this.logPrefix} ${prefixStyle ? "%c" : ""}${prefix || ""}`,
      "color: gray;",
      prefixStyle,
      message
    );
  };
  log = (message: unknown, prefix?: string, prefixStyle?: string): void => {
    this._log(message, prefix, prefixStyle);
  };
  logMaster = (message: unknown): void => {
    this.log(message, `MASTER:`, "color: royalblue; font-weight:bold;");
  };
  logViewer = (message: unknown): void => {
    this.log(message, `VIEWER:`, "color: green; font-weight: bold;");
  };
}

export const getLogger = ({
  debug = false,
}: { debug?: boolean } = {}): Logger =>
  debug ? new Logger(console) : new Logger();
