import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, DataTable, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Pagination, SearchInput, Select, Textarea } from "./ui";

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, any>) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "select" | "textarea" | "tel";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  span?: 1 | 2;
  hint?: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  column: string;
}

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  path: string;
  idKey: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  defaults: Record<string, string>;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  canManage: boolean;
  extraActions?: ReactNode;
  headerExtra?: ReactNode;
  transform?: (values: Record<string, any>) => Record<string, any>;
  pageSize?: number;
}

export function MasterDataPage({
  eyebrow,
  title,
  description,
  path,
  idKey,
  columns,
  fields,
  defaults,
  searchPlaceholder,
  filters = [],
  canManage,
  extraActions,
  headerExtra,
  transform,
  pageSize = 25,
}: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(defaults);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const queryKey = [path, { search, page, ...filterValues }];
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<{ data: Record<string, any>[]; page: number; totalPages: number; total: number }>(path, { search: search || undefined, page, pageSize, ...filterValues }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [path] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? api.patch(`${path}/${editing[idKey]}`, payload) : api.post(path, payload),
    onSuccess: () => {
      toast.success(editing ? `${title.slice(0, -1)} updated` : `${title.slice(0, -1)} created`);
      setModalOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save"),
  });

  const startCreate = () => {
    setEditing(null);
    setValues(defaults);
    setError("");
    setModalOpen(true);
  };
  const startEdit = (row: Record<string, any>) => {
    setEditing(row);
    setValues(
      Object.fromEntries(
        fields.map((field) => {
          const raw = row[field.key];
          return [field.key, raw === null || raw === undefined ? "" : String(raw)];
        }),
      ),
    );
    setError("");
    setModalOpen(true);
  };

  const submit = () => {
    setError("");
    const payload: Record<string, any> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (field.type === "number") payload[field.key] = raw === "" ? null : Number(raw);
      else if (field.type === "date") payload[field.key] = raw || null;
      else payload[field.key] = raw === "" ? null : raw;
    }
    save.mutate(transform ? transform(payload) : payload);
  };

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <>
            {extraActions}
            <Button variant="ghost" onClick={() => refetch()} loading={isFetching}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
            {canManage ? <Button variant="accent" onClick={startCreate}><Plus className="h-4 w-4" /> Add {title.slice(0, -1).toLowerCase()}</Button> : null}
          </>
        }
      />
      {headerExtra}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}…`} />
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => (
              <Select
                key={filter.key}
                value={filterValues[filter.key] ?? ""}
                onChange={(e) => { setFilterValues((f) => ({ ...f, [filter.key]: e.target.value })); setPage(1); }}
                className="w-40"
              >
                <option value="">All {filter.label.toLowerCase()}</option>
                {filter.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
            ))}
            <span className="text-[11px] text-ink-400">{data?.total?.toLocaleString() ?? 0} records</span>
          </div>
        </div>
        {isLoading ? <LoadingBlock rows={8} /> : data?.data.length ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  {columns.map((col) => <th key={col.key} className={col.align === "right" ? "text-right" : undefined}>{col.label}</th>)}
                  {canManage ? <th className="w-12" /> : null}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={String(row[idKey])} className={canManage ? "cursor-pointer" : undefined} onClick={() => canManage && startEdit(row)}>
                    {columns.map((col) => (
                      <td key={col.key} className={`${col.align === "right" ? "text-right" : ""} ${col.className ?? ""}`}>
                        {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                      </td>
                    ))}
                    {canManage ? (
                      <td className="text-right">
                        <span className="inline-flex rounded p-1.5 text-ink-300 group-hover:text-ink-600"><Pencil className="h-3.5 w-3.5" /></span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        ) : (
          <EmptyState title={`No ${title.toLowerCase()} found`} description="Adjust the filters or add a new record." action={canManage ? <Button variant="accent" onClick={startCreate}><Plus className="h-4 w-4" /> Add record</Button> : undefined} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${title.slice(0, -1).toLowerCase()}` : `Add ${title.slice(0, -1).toLowerCase()}`}
        description={editing ? String(editing[idKey]) : `Create a new record in ${title.toLowerCase()}.`}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{editing ? "Save changes" : "Create"}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} className={field.span === 2 ? "sm:col-span-2" : undefined}>
              {field.type === "select" ? (
                <Select value={values[field.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}>
                  <option value="">Select…</option>
                  {field.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea value={values[field.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} placeholder={field.placeholder} />
              ) : (
                <Input
                  type={field.type ?? "text"}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  step={field.type === "number" ? "any" : undefined}
                />
              )}
            </Field>
          ))}
        </div>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p> : null}
        <p className="mt-3 text-[11px] text-ink-400">Changes are audit-logged against {user?.name}.</p>
      </Modal>
    </>
  );
}
