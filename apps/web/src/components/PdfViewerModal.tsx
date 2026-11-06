import { useEffect, useState } from "react";
import { Download, ExternalLink, Printer, X, Loader2, AlertCircle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useLanguage } from "../lib/language";
import { Button } from "./ui";

interface PdfViewerModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  pdfEndpoint?: string;
  filename?: string;
}

export function PdfViewerModal({
  open,
  onClose,
  title = "Tax Invoice",
  pdfEndpoint,
  filename = "Invoice.pdf",
}: PdfViewerModalProps) {
  const { t } = useLanguage();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !pdfEndpoint) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setError(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getBlob(pdfEndpoint)
      .then((blob) => {
        if (!isMounted) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof ApiError ? err.message : "Failed to load PDF");
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [open, pdfEndpoint]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const directAuthUrl = pdfEndpoint ? api.getAuthenticatedUrl(pdfEndpoint) : undefined;

  const handlePrint = () => {
    if (blobUrl) {
      const iframe = document.getElementById("pdf-viewer-frame") as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        return;
      }
    }
    if (directAuthUrl) {
      window.open(directAuthUrl, "_blank");
    }
  };

  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (directAuthUrl) {
      window.open(directAuthUrl, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-[1px] animate-fade-in transition-opacity duration-150"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-lift animate-modal-in transform-gpu will-change-transform">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-ink-100 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-50 text-signal-600 font-semibold text-xs">
              PDF
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-900 leading-tight">{t(title)}</h3>
              <p className="text-[11px] text-ink-400">{t("View, print, or download official delivery bill")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              disabled={!blobUrl || loading}
              title={t("Print invoice")}
              className="text-xs"
            >
              <Printer className="h-3.5 w-3.5" /> {t("Print")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!blobUrl || loading}
              title={t("Download invoice PDF")}
              className="text-xs"
            >
              <Download className="h-3.5 w-3.5" /> {t("Download")}
            </Button>
            {directAuthUrl ? (
              <a
                href={directAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost btn-sm inline-flex items-center gap-1 text-xs"
                title={t("Open in new browser tab")}
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t("New Tab")}
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
              aria-label={t("Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* PDF Viewer Body */}
        <div className="relative flex-1 bg-ink-100/50">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-signal-500" />
              <p className="text-xs font-medium text-ink-600">Generating invoice view…</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-ink-900">Unable to display invoice</p>
              <p className="max-w-md text-xs text-ink-500">{error}</p>
              {directAuthUrl ? (
                <a
                  href={directAuthUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary btn-sm mt-2 inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Direct Link
                </a>
              ) : null}
            </div>
          ) : blobUrl ? (
            <iframe
              id="pdf-viewer-frame"
              src={blobUrl}
              title={title}
              className="h-full w-full border-0"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

