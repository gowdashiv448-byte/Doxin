import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, DatabaseZap, FileUp, RefreshCw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { dateTime, num } from "../lib/format";

type Dataset = { key: string; label: string; columns: string[]; table: string };
type HistoryRow = Record<string, any>;

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<{ dataset: string; imported: number; skipped: number } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: catalog } = useQuery({ queryKey: ["imports", "catalog"], queryFn: () => api.get<{ datasets: Dataset[] }>("/api/imports/catalog") });
  const { data: history } = useQuery({ queryKey: ["imports", "history"], queryFn: () => api.get<{ data: HistoryRow[] }>("/api/imports/history") });

  const upload = useMutation({
    mutationFn: ({ dataset, file }: { dataset: string; file: File }) => api.upload<{ imported: number; skipped: number; rows: number }>(`/api/imports/${dataset}`, file),
    onMutate: ({ dataset }) => { setUploading(dataset); setResult(null); },
    onSuccess: (res, vars) => {
      toast.success(`${vars.dataset}: ${res.imported.toLocaleString()} rows imported`);
      setResult({ dataset: vars.dataset, imported: res.imported, skipped: res.skipped });
      void queryClient.invalidateQueries({ queryKey: ["imports", "history"] });
      void queryClient.invalidateQueries();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed"),
    onSettled: () => setUploading(null),
  });

  const onFile = (dataset: string, file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Choose a .csv file"); return; }
    upload.mutate({ dataset, file });
    const input = inputs.current[dataset];
    if (input) input.value = "";
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Data imports"
        description="Bring your book of business in from CSV. Imports are atomic and idempotent — re-running a file will skip existing primary keys."
        actions={<Button variant="ghost" onClick={() => { void queryClient.invalidateQueries({ queryKey: ["imports"] }); }}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="p-4 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-signal-500" /><p className="text-[13px] font-semibold">Import order matters</p></div>
          <p className="mt-2 text-[12px] leading-5 text-ink-500">Load reference data first: customers, facilities, lanes, drivers, trucks, trailers. Then loads, trips, delivery events, fuel, maintenance and safety.</p>
          <p className="mt-2 text-[11px] text-ink-400">Max file size 50 MB · CSV with a header row · empty values become NULL.</p>
        </Card>
        {result ? (
          <Card className="border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-4 w-4" /><p className="text-[13px] font-semibold">Import complete</p></div>
            <p className="mt-2 text-[12px] text-emerald-900">{result.dataset}: {num(result.imported)} rows imported, {num(result.skipped)} skipped (duplicates).</p>
          </Card>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {catalog?.datasets.map((dataset) => (
          <Card key={dataset.key} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-ink-900">{dataset.label}</p>
                <p className="mono mt-0.5 text-[10px] text-ink-400">{dataset.table} · {dataset.columns.length} columns</p>
              </div>
              <Badge tone="info">CSV</Badge>
            </div>
            <p className="mt-2 line-clamp-2 font-mono text-[10px] leading-4 text-ink-400">{dataset.columns.slice(0, 5).join(", ")}{dataset.columns.length > 5 ? "…" : ""}</p>
            <div className="mt-3 flex items-center gap-2">
              <input ref={(node) => { inputs.current[dataset.key] = node; }} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(dataset.key, e.target.files?.[0] ?? null)} />
              <Button variant="secondary" size="sm" loading={uploading === dataset.key} onClick={() => inputs.current[dataset.key]?.click()} className="flex-1">
                <FileUp className="h-3.5 w-3.5" /> Upload file
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3"><h2 className="text-[14px] font-semibold">Import history</h2></div>
        <DataTable>
          <thead><tr><th>Dataset</th><th>Rows imported</th><th>Skipped</th><th>File</th><th>Imported by</th><th>When</th></tr></thead>
          <tbody>
            {history?.data.map((row) => (
              <tr key={row.id}>
                <td className="mono text-[11.5px] font-medium">{row.dataset}</td>
                <td className="font-mono text-[12px]">{num(row.imported)}</td>
                <td className="font-mono text-[12px] text-ink-500">{num(row.skipped)}</td>
                <td className="max-w-[220px] truncate text-[11.5px] text-ink-500">{row.filename ?? "—"}</td>
                <td className="text-[12px]">{row.actorName}</td>
                <td className="text-[12px] text-ink-600">{dateTime(row.createdAt)}</td>
              </tr>
            ))}
            {!history?.data.length ? <tr><td colSpan={6} className="py-10 text-center text-[12px] text-ink-400">No imports yet.</td></tr> : null}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
