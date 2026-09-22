export type DrawingFormat = "dxf" | "dwg";

export type DrawingFile = {
  file: File;
  name: string;
  format: DrawingFormat;
  size: number;
};

export type LoadingPhase =
  | "reading"
  | "converting"
  | "fetch"
  | "parse"
  | "prepare"
  | "font";

export type ViewerCommand = "zoom-in" | "zoom-out" | "fit" | "reset";

export type ViewerHandle = {
  execute(command: ViewerCommand): void;
  pointFromClient(x: number, y: number): { x: number; y: number } | null;
};

export type AppErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "FILE_READ_FAILED"
  | "DXF_OPEN_FAILED"
  | "DWG_CONVERSION_FAILED"
  | "DWG_UNSUPPORTED_VERSION"
  | "DWG_CORRUPT_OR_ENCRYPTED"
  | "DWG_PARSE_FAILED"
  | "DWG_EXPORT_FAILED"
  | "DWG_MEMORY_LIMIT"
  | "DWG_CONVERSION_TIMEOUT"
  | "DWG_RUNTIME_MISSING"
  | "RENDER_FAILED";

export type DwgDiagnostic = {
  engine: "libredwg";
  version: string;
  fileSizeBytes: number;
  engineCode?: string;
};

export type AppErrorDetails = {
  dwg?: DwgDiagnostic;
};

type AppErrorOptions = ErrorOptions & {
  details?: AppErrorDetails;
};

export class AppError extends Error {
  public readonly details?: AppErrorDetails;

  constructor(
    public readonly code: AppErrorCode,
    message?: string,
    options?: AppErrorOptions,
  ) {
    super(message ?? code, options);
    this.name = "AppError";
    this.details = options?.details;
  }
}
