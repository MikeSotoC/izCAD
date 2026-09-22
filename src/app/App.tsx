import {
  lazy,
  Suspense,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { DrawingLibrary } from "../components/DrawingLibrary";
import { ErrorScreen } from "../components/ErrorScreen";
import { CloseIcon, FolderIcon, ShieldIcon } from "../components/Icons";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { LoadingScreen } from "../components/LoadingScreen";
import { ViewerToolbar } from "../components/ViewerToolbar";
import { convertDwgToDxf } from "../dwg/convertDwg";
import { addLineToDxf, type Point } from "../editor/dxfLine";
import { toDrawingFile } from "../files/fileTypes";
import { useI18n } from "../i18n/I18nProvider";
import {
  importDrawingToLibrary,
  ROOT_FOLDER_ID,
} from "../library/drawingLibrary";
import {
  incomingDrawingPlugin,
  readIncomingDrawingFile,
  type IncomingDrawing,
} from "../native/incomingDrawing";
import {
  AppError,
  type AppErrorCode,
  type DrawingFile,
  type LoadingPhase,
  type ViewerCommand,
  type ViewerHandle,
} from "../types/drawing";

const DrawingCanvas = lazy(() =>
  import("../components/DrawingCanvas").then((module) => ({
    default: module.DrawingCanvas,
  })),
);

type AppState =
  | { status: "home" }
  | {
      status: "loading";
      drawing: DrawingFile;
      renderFile: File | null;
      phase: LoadingPhase;
      progress: number | null;
    }
  | { status: "viewer"; drawing: DrawingFile; renderFile: File }
  | { status: "error"; error: AppError };

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length,
  );
  const value = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[exponent - 1]}`;
}

function toAppError(error: unknown, fallback: AppErrorCode): AppError {
  return error instanceof AppError
    ? error
    : new AppError(fallback, undefined, { cause: error });
}

function openExternalLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  event.preventDefault();
  void Browser.open({ url: event.currentTarget.href });
}

export function App() {
  const { locale, t } = useI18n();
  const [state, setState] = useState<AppState>({ status: "home" });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [edited, setEdited] = useState(false);
  const viewerRef = useRef<ViewerHandle>(null);
  const requestIdRef = useRef(0);
  const incomingRequestIdRef = useRef(0);
  const handledIncomingIdsRef = useRef(new Set<string>());
  const conversionAbortRef = useRef<AbortController | null>(null);

  const openFile = useCallback(async (file: File, libraryEntryId?: string) => {
    setDrawingMode(false);
    setLineStart(null);
    setEdited(false);
    incomingRequestIdRef.current += 1;
    conversionAbortRef.current?.abort();
    conversionAbortRef.current = null;
    const requestId = ++requestIdRef.current;

    let drawing: DrawingFile;
    try {
      drawing = toDrawingFile(file);
    } catch (error) {
      setState({
        status: "error",
        error: toAppError(error, "UNSUPPORTED_FORMAT"),
      });
      return;
    }

    setLibraryOpen(false);
    setState({
      status: "loading",
      drawing,
      renderFile: null,
      phase: drawing.format === "dwg" ? "converting" : "reading",
      progress: null,
    });

    if (!libraryEntryId) {
      void importDrawingToLibrary(file, ROOT_FOLDER_ID).catch((error: unknown) => {
        console.warn("Drawing could not be saved to the local library.", error);
      });
    }

    const conversionController =
      drawing.format === "dwg" ? new AbortController() : null;
    conversionAbortRef.current = conversionController;

    try {
      const renderFile =
        drawing.format === "dwg"
          ? await convertDwgToDxf(
              file,
              conversionController?.signal,
            )
          : file;
      if (requestId !== requestIdRef.current) {
        return;
      }

      setState({
        status: "loading",
        drawing,
        renderFile,
        phase: "fetch",
        progress: null,
      });
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState({
          status: "error",
          error: toAppError(error, "DWG_CONVERSION_FAILED"),
        });
      }
    } finally {
      if (conversionAbortRef.current === conversionController) {
        conversionAbortRef.current = null;
      }
    }
  }, []);

  const openIncomingDrawing = useCallback(
    async (incoming: IncomingDrawing) => {
      if (handledIncomingIdsRef.current.has(incoming.id)) {
        return;
      }

      handledIncomingIdsRef.current.add(incoming.id);
      const incomingRequestId = ++incomingRequestIdRef.current;
      const appRequestId = requestIdRef.current;
      let file: File;

      try {
        file = await readIncomingDrawingFile(incoming);
      } catch (error) {
        if (
          incomingRequestId === incomingRequestIdRef.current &&
          appRequestId === requestIdRef.current
        ) {
          setState({
            status: "error",
            error: toAppError(error, "FILE_READ_FAILED"),
          });
        }
        return;
      } finally {
        void incomingDrawingPlugin
          .acknowledgeDrawing({ id: incoming.id })
          .catch(() => undefined);
      }

      if (
        incomingRequestId === incomingRequestIdRef.current &&
        appRequestId === requestIdRef.current
      ) {
        await openFile(file);
      }
    },
    [openFile],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let disposed = false;
    let listener: PluginListenerHandle | null = null;

    void (async () => {
      listener = await incomingDrawingPlugin.addListener(
        "drawingReceived",
        (drawing) => {
          if (!disposed) {
            void openIncomingDrawing(drawing);
          }
        },
      );

      if (disposed) {
        await listener.remove();
        return;
      }

      const { drawing } = await incomingDrawingPlugin.getPendingDrawing();
      if (drawing && !disposed) {
        await openIncomingDrawing(drawing);
      }
    })().catch((error: unknown) => {
      if (!disposed) {
        console.error("Incoming drawing bridge could not be initialized.", error);
      }
    });

    return () => {
      disposed = true;
      if (listener) {
        void listener.remove();
      }
    };
  }, [openIncomingDrawing]);

  const handleProgress = useCallback(
    (phase: LoadingPhase, processed: number, total: number) => {
      setState((current) => {
        if (current.status !== "loading") {
          return current;
        }

        return {
          ...current,
          phase,
          progress:
            total > 0 ? Math.min(1, Math.max(0, processed / total)) : null,
        };
      });
    },
    [],
  );

  const handleViewerReady = useCallback(() => {
    setState((current) => {
      if (current.status !== "loading" || !current.renderFile) {
        return current;
      }
      return {
        status: "viewer",
        drawing: current.drawing,
        renderFile: current.renderFile,
      };
    });
  }, []);

  const handleViewerError = useCallback((error: unknown) => {
    setState({
      status: "error",
      error: toAppError(error, "DXF_OPEN_FAILED"),
    });
  }, []);

  const closeDrawing = useCallback(() => {
    setDrawingMode(false);
    setLineStart(null);
    incomingRequestIdRef.current += 1;
    requestIdRef.current += 1;
    conversionAbortRef.current?.abort();
    conversionAbortRef.current = null;
    setState({ status: "home" });
  }, []);

  const sendCommand = useCallback((command: ViewerCommand) => {
    viewerRef.current?.execute(command);
  }, []);

  const addLine = useCallback(async (point: Point) => {
    if (!lineStart) {
      setLineStart(point);
      return;
    }
    if (state.status !== "viewer") return;
    try {
      const text = await state.renderFile.text();
      const updated = addLineToDxf(text, lineStart, point);
      const name = state.drawing.name.replace(/\.(dwg|dxf)$/i, "") + "-editado.dxf";
      const renderFile = new File([updated], name, { type: "application/dxf", lastModified: Date.now() });
      setLineStart(null);
      setEdited(true);
      setState({ status: "loading", drawing: state.drawing, renderFile, phase: "fetch", progress: null });
    } catch (error) {
      window.alert(`No se pudo editar este DXF: ${String(error)}`);
    }
  }, [lineStart, state]);

  const saveEditedDrawing = useCallback(() => {
    if (state.status !== "viewer") return;
    const url = URL.createObjectURL(state.renderFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = state.renderFile.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [state]);

  const canvas =
    (state.status === "loading" && state.renderFile) ||
    state.status === "viewer" ? (
      <Suspense fallback={null}>
        <DrawingCanvas
          ref={viewerRef}
          key={
            state.status === "viewer"
              ? state.renderFile.name + state.renderFile.lastModified
              : state.renderFile!.name + state.renderFile!.lastModified
          }
          file={
            state.status === "viewer" ? state.renderFile : state.renderFile!
          }
          drawingMode={drawingMode && state.status === "viewer"}
          onPoint={(point) => { void addLine(point); }}
          onProgress={handleProgress}
          onReady={handleViewerReady}
          onError={handleViewerError}
        />
      </Suspense>
    ) : null;

  if (libraryOpen) {
    return (
      <DrawingLibrary
        onClose={() => setLibraryOpen(false)}
        onOpen={(file, libraryEntryId) => openFile(file, libraryEntryId)}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div className="app-shell">
        <header className="topbar minimal">
          <div className="wordmark">izCAD</div>
          <LanguageSwitch />
        </header>
        <ErrorScreen
          error={state.error}
          onOpenLibrary={() => setLibraryOpen(true)}
        />
      </div>
    );
  }

  if (state.status === "home") {
    return (
      <div className="app-shell home">
        <header className="topbar">
          <div className="wordmark">
            iz<span>CAD</span>
          </div>
          <LanguageSwitch />
        </header>

        <main className="hero">
          <div className="hero-graphic" aria-hidden="true">
            <div className="cad-card card-back">
              <span />
              <span />
              <span />
            </div>
            <div className="cad-card card-front">
              <svg viewBox="0 0 220 160">
                <path d="M26 124V42h56l25 22h87v60H26Z" />
                <path d="M43 108V60h31l22 18h78v30H43Z" />
                <circle cx="145" cy="92" r="10" />
                <path d="M111 78v30M128 78v30" />
              </svg>
              <span className="format-chip">DXF</span>
            </div>
          </div>

          <section className="hero-copy">
            <p className="eyebrow">ANDROID CAD VIEWER</p>
            <h1>{t("tagline")}</h1>
            <p className="lead">{t("description")}</p>
            <button
              type="button"
              className="open-button"
              onClick={() => setLibraryOpen(true)}
            >
              <FolderIcon />
              <span>{t("myDrawings")}</span>
            </button>

            <div className="feature-row">
              <div>
                <span className="feature-dot" />
                <strong>{t("supportedFormats")}</strong>
              </div>
              <div>
                <ShieldIcon />
                <strong>{t("offline")}</strong>
              </div>
            </div>
            <p className="privacy-copy">{t("privateFiles")}</p>
            <nav className="legal-links" aria-label={t("privacyAndLicenses")}>
              <a
                href="https://sites.google.com/view/izcad-gp-pp/ana-sayfa"
                target="_blank"
                rel="noreferrer"
                onClick={openExternalLink}
              >
                {t("privacyAndLicenses")}
              </a>
              <span aria-hidden="true">•</span>
              <a
                href="https://github.com/orgofjs/izCAD"
                target="_blank"
                rel="noreferrer"
                onClick={openExternalLink}
              >
                {t("sourceCode")}
              </a>
            </nav>
          </section>
        </main>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="app-shell viewer-shell">
        {canvas}
        <LoadingScreen
          phase={state.phase}
          progress={state.progress}
          fileName={state.drawing.name}
          onCancel={closeDrawing}
        />
      </div>
    );
  }

  return (
    <div className="app-shell viewer-shell">
      {canvas}
      <header className="viewer-header">
        <div className="file-heading">
          <span className="file-format">{state.drawing.format}</span>
          <div>
            <strong>{state.drawing.name}</strong>
            <span>
              {t("fileSize")}: {formatBytes(state.drawing.size, locale)}
            </span>
          </div>
        </div>
        <div className="viewer-header-actions">
          <button
            type="button"
            className="open-button compact"
            aria-label={t("myDrawings")}
            title={t("myDrawings")}
            onClick={() => setLibraryOpen(true)}
          >
            <FolderIcon />
            <span>{t("myDrawings")}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t("close")}
            title={t("close")}
            onClick={closeDrawing}
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      <ViewerToolbar onCommand={sendCommand} />
      <div className="edit-actions">
        <button type="button" onClick={() => { setDrawingMode(!drawingMode); setLineStart(null); }}>
          {drawingMode ? "Terminar línea" : "Dibujar línea"}
        </button>
        {drawingMode && <span>{lineStart ? "Toca el punto final" : "Toca el punto inicial"}</span>}
        <button type="button" disabled={!edited} onClick={saveEditedDrawing}>Guardar DXF</button>
      </div>
    </div>
  );
}
