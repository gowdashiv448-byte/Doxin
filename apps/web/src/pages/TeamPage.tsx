import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Badge, Button, Card, DataTable, Field, Input, LoadingBlock, Modal, PageHeader } from "../components/ui";
import { dateTime } from "../lib/format";

type Row = Record<string, any>;

export default function TeamPage() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ data: Row[] }>("/api/users", { pageSize: 100 }) });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/api/users", payload),
    onSuccess: () => {
      toast.success("Administrator added");
      setOpen(false);
      setForm({ name: "", email: "", password: "" });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create administrator"),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/api/users/${id}`, payload),
    onSuccess: () => { toast.success("Administrator updated"); void queryClient.invalidateQueries({ queryKey: ["users"] }); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update administrator"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Administrators"
        description="Manage who has full access to the operations console."
        actions={<Button variant="accent" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add administrator</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Administrators</p><span className="text-ink-300"><Shield className="h-4 w-4" /></span></div>
          <p className="mt-2 font-mono text-2xl">{data?.data.length ?? 0}</p>
          <p className="mt-1 text-[11px] text-ink-400">Full access to every workspace</p>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3"><h2 className="text-[14px] font-semibold">Workspace administrators</h2></div>
        {isLoading ? <LoadingBlock /> : (
          <DataTable>
            <thead><tr><th>Member</th><th>Access</th><th>Status</th><th>Last sign-in</th><th>Joined</th><th className="text-right">Account</th></tr></thead>
            <tbody>
              {data?.data.map((member) => (
                <tr key={member.id}>
                  <td><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 font-mono text-[10px] text-ink-600">{String(member.name).split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</span><div><p className="text-[13px] font-medium text-ink-900">{member.name}</p><p className="text-[11px] text-ink-400">{member.email}</p></div></div></td>
                  <td><Badge tone="info">Administrator</Badge></td>
                  <td><Badge tone={member.isActive ? "success" : "neutral"}>{member.isActive ? "Active" : "Disabled"}</Badge></td>
                  <td className="text-[12px] text-ink-600">{member.lastLoginAt ? dateTime(member.lastLoginAt) : "Never"}</td>
                  <td className="text-[12px] text-ink-600">{dateTime(member.createdAt)}</td>
                  <td className="text-right">
                    <Button variant={member.isActive ? "ghost" : "secondary"} size="sm" onClick={() => update.mutate({ id: member.id, payload: { isActive: !member.isActive } })}>
                      {member.isActive ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add administrator" description="The new account can sign in immediately with the temporary password." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate(form)}>Create account</Button></>}>
        <div className="space-y-3">
          <Field label="Full name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Work email"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" hint="At least 8 characters. Ask them to change it on first sign-in."><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
        </div>
        {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      </Modal>
    </>
  );
}
