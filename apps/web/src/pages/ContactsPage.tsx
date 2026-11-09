import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookUser,
  Plus,
  RefreshCw,
  Search,
  Building2,
  Phone,
  Mail,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
  Users,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth, canWrite } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useLanguage } from "../lib/language";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Textarea,
} from "../components/ui";

export interface Contact {
  contactId: string;
  tenantId?: string;
  name: string;
  companyName: string | null;
  mobileNumber: string;
  email: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContactFormData {
  name: string;
  companyName: string;
  mobileNumber: string;
  email: string;
  description: string;
}

const emptyForm: ContactFormData = {
  name: "",
  companyName: "",
  mobileNumber: "",
  email: "",
  description: "",
};

export default function ContactsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFormData>(emptyForm);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const canManage = user?.role === "ADMIN" || canWrite(user?.role, "ops");

  // Query contacts with live search & pagination
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["/api/contacts", { search, page, pageSize }],
    queryFn: () =>
      api.get<{ data: Contact[]; page: number; totalPages: number; total: number }>(
        "/api/contacts",
        {
          search: search.trim() || undefined,
          page,
          pageSize,
        },
      ),
    placeholderData: (prev) => prev,
  });

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Quick stats derived from contacts
  const stats = useMemo(() => {
    const companies = new Set(
      contacts.map((c) => c.companyName?.trim()).filter(Boolean),
    );
    const withPhone = contacts.filter((c) => c.mobileNumber?.trim()).length;
    const withEmail = contacts.filter((c) => c.email?.trim()).length;
    return {
      companiesCount: companies.size,
      withPhone,
      withEmail,
    };
  }, [contacts]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
  };

  // Create / Update mutation
  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (editing) {
        return api.patch(`/api/contacts/${editing.contactId}`, payload);
      }
      return api.post("/api/contacts", payload);
    },
    onSuccess: () => {
      toast.success(editing ? t("Contact updated successfully") : t("Contact added to contact book"));
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : t("Failed to save contact"));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => api.delete(`/api/contacts/${contactId}`),
    onSuccess: () => {
      toast.success(t("Contact removed"));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t("Could not delete contact"));
    },
  });

  const handleOpenAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const handleOpenEdit = (contact: Contact) => {
    setEditing(contact);
    setForm({
      name: contact.name ?? "",
      companyName: contact.companyName ?? "",
      mobileNumber: contact.mobileNumber ?? "",
      email: contact.email ?? "",
      description: contact.description ?? "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError(t("Person name is required"));
      return;
    }
    if (!form.mobileNumber.trim()) {
      setFormError(t("Mobile number is required"));
      return;
    }

    const payload = {
      name: form.name.trim(),
      companyName: form.companyName.trim() || null,
      mobileNumber: form.mobileNumber.trim(),
      email: form.email.trim() || null,
      description: form.description.trim() || null,
    };

    saveMutation.mutate(payload);
  };

  return (
    <>
      <PageHeader
        eyebrow={t("Workspace")}
        title={t("Contact Book")}
        description={t("Store and maintain business contacts, transport partners, drivers, and vendor details.")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw className="h-3.5 w-3.5" /> {t("Refresh")}
            </Button>
            {canManage && (
              <Button variant="accent" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4" /> {t("Add contact")}
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t("Total Contacts")}
            </p>
            <span className="text-ink-400">
              <BookUser className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold">{total}</p>
          <p className="mt-1 text-[11px] text-ink-400">{t("Active directory entries")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t("Companies Listed")}
            </p>
            <span className="text-ink-400">
              <Building2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold">{stats.companiesCount}</p>
          <p className="mt-1 text-[11px] text-ink-400">{t("Partner organisations")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t("With Phone")}
            </p>
            <span className="text-ink-400">
              <Phone className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold">{stats.withPhone}</p>
          <p className="mt-1 text-[11px] text-ink-400">{t("Callable mobile numbers")}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {t("With Email")}
            </p>
            <span className="text-ink-400">
              <Mail className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold">{stats.withEmail}</p>
          <p className="mt-1 text-[11px] text-ink-400">{t("Available email contacts")}</p>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="mt-4 overflow-hidden">
        {/* Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-surface-subtle px-4 py-3">
          <div className="relative min-w-[280px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              type="text"
              placeholder={t("Search by name, company, mobile, email or work description…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11.5px] text-ink-500">
              {total} {t("records found")}
            </span>
          </div>
        </div>

        {/* Content / Table */}
        {isLoading ? (
          <LoadingBlock rows={8} />
        ) : contacts.length > 0 ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th className="min-w-[180px]">{t("Person Name")}</th>
                  <th className="min-w-[150px]">{t("Company Name")}</th>
                  <th className="min-w-[140px]">{t("Mobile Number")}</th>
                  <th className="min-w-[160px]">{t("Email ID")}</th>
                  <th className="min-w-[200px]">{t("Work Description")}</th>
                  {canManage && <th className="w-24 text-right">{t("Actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const initials = contact.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join("") || "C";

                  return (
                    <tr key={contact.contactId} className="group hover:bg-surface-hover/50">
                      {/* 1. Person Name */}
                      <td className="align-middle">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-[12px] font-semibold text-accent">
                            {initials}
                          </div>
                          <div>
                            <p className="font-medium text-ink-900">{contact.name}</p>
                            <span className="font-mono text-[10.5px] text-ink-400">
                              {contact.contactId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Company Name - displays '-' if empty */}
                      <td className="align-middle">
                        {contact.companyName?.trim() ? (
                          <div className="flex items-center gap-1.5 font-medium text-ink-800">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                            <span className="truncate max-w-[180px]">{contact.companyName}</span>
                          </div>
                        ) : (
                          <span className="font-mono text-ink-400 font-bold">-</span>
                        )}
                      </td>

                      {/* 3. Mobile Number - clickable tel: link */}
                      <td className="align-middle">
                        {contact.mobileNumber?.trim() ? (
                          <a
                            href={`tel:${contact.mobileNumber.replace(/\s+/g, "")}`}
                            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-800 hover:text-accent hover:underline"
                            title={t("Call mobile number")}
                          >
                            <Phone className="h-3 w-3 text-emerald-600" />
                            <span>{contact.mobileNumber}</span>
                          </a>
                        ) : (
                          <span className="font-mono text-ink-400 font-bold">-</span>
                        )}
                      </td>

                      {/* 4. Email ID - displays '-' if empty */}
                      <td className="align-middle">
                        {contact.email?.trim() ? (
                          <a
                            href={`mailto:${contact.email.trim()}`}
                            className="inline-flex items-center gap-1.5 text-[12px] text-ink-700 hover:text-accent hover:underline truncate max-w-[180px]"
                            title={contact.email}
                          >
                            <Mail className="h-3 w-3 shrink-0 text-blue-500" />
                            <span className="truncate">{contact.email}</span>
                          </a>
                        ) : (
                          <span className="font-mono text-ink-400 font-bold">-</span>
                        )}
                      </td>

                      {/* 5. Description (Work they do) - displays '-' if empty */}
                      <td className="align-middle">
                        {contact.description?.trim() ? (
                          <p
                            className="line-clamp-2 text-[12px] text-ink-600 max-w-[280px]"
                            title={contact.description}
                          >
                            {contact.description}
                          </p>
                        ) : (
                          <span className="font-mono text-ink-400 font-bold">-</span>
                        )}
                      </td>

                      {/* 6. Actions */}
                      {canManage && (
                        <td className="align-middle text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(contact)}
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-800"
                              title={t("Edit contact")}
                              aria-label={t("Edit contact")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(contact)}
                              className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                              title={t("Delete contact")}
                              aria-label={t("Delete contact")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title={t("No contacts found")}
            description={
              search
                ? t("No contacts matched your search query. Try clearing the filter.")
                : t("Start building your contact book with drivers, brokers, dispatchers, and partners.")
            }
            action={
              canManage ? (
                <Button variant="accent" onClick={handleOpenAdd}>
                  <Plus className="h-4 w-4" /> {t("Add first contact")}
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* Add / Edit Contact Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Edit Contact") : t("Add New Contact")}
        description={
          editing
            ? `${t("Updating details for")} ${editing.name} (${editing.contactId})`
            : t("Add a new partner, broker, driver or vendor contact to your workspace.")
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="accent"
              loading={saveMutation.isPending}
              onClick={() => handleSubmit()}
            >
              {editing ? t("Update Contact") : t("Save Contact")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Person Name")} hint={t("Required")}>
            <Input
              type="text"
              placeholder={t("e.g. Rajesh Kumar")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoFocus
            />
          </Field>

          <Field
            label={t("Company Name")}
            hint={t("Optional - leave empty (-) if none")}
          >
            <Input
              type="text"
              placeholder={t("e.g. Tata Steel Freight Lines or leave empty")}
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </Field>

          <Field label={t("Mobile Number")} hint={t("Required")}>
            <Input
              type="tel"
              placeholder={t("e.g. +91 98200 11223")}
              value={form.mobileNumber}
              onChange={(e) => setForm((f) => ({ ...f, mobileNumber: e.target.value }))}
              required
            />
          </Field>

          <Field
            label={t("Email ID")}
            hint={t("Optional - leave empty (-) if none")}
          >
            <Input
              type="email"
              placeholder={t("e.g. partner@example.in or leave empty")}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>

          <Field
            label={t("Work Description")}
            hint={t("Optional - describe what work their company does")}
          >
            <Textarea
              placeholder={t("e.g. Interstate refrigerated container transport, port drayage at JNPT, Gujarat fleet management")}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </Field>

          {formError && (
            <div className="rounded-md bg-rose-50 p-2.5 text-[12px] font-medium text-rose-700">
              {formError}
            </div>
          )}

          <p className="text-[11px] text-ink-400">
            {t("Contacts are strictly isolated and persistent to your organisation workspace.")}
          </p>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("Delete Contact")}
        description={t("Are you sure you want to remove this contact from your contact book?")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.contactId);
                }
              }}
            >
              {t("Delete Contact")}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-2 rounded-lg bg-surface-subtle p-3 text-[13px]">
            <p>
              <span className="font-semibold text-ink-600">{t("Person Name")}: </span>
              <span className="font-medium text-ink-900">{deleteTarget.name}</span>
            </p>
            <p>
              <span className="font-semibold text-ink-600">{t("Company Name")}: </span>
              <span className="text-ink-800">{deleteTarget.companyName || "-"}</span>
            </p>
            <p>
              <span className="font-semibold text-ink-600">{t("Mobile Number")}: </span>
              <span className="font-mono text-ink-800">{deleteTarget.mobileNumber}</span>
            </p>
            <p className="text-[11px] text-rose-600">
              {t("This action cannot be undone.")}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

