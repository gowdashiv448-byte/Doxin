import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Mail,
  Download,
  ExternalLink,
  Truck,
  RotateCw,
  Send,
  Receipt,
  CheckCircle,
  Eye,
} from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useLanguage } from "../lib/language";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  LoadingBlock,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
} from "../components/ui";
import { PdfViewerModal } from "../components/PdfViewerModal";
import { date, money, num } from "../lib/format";
import type { Bill, AccountingSummary, Page } from "@doxin/shared";

export default function AccountingPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{
    open: boolean;
    endpoint?: string;
    title?: string;
    filename?: string;
  } | null>(null);

  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Fetch Invoices List
  const { data, isLoading } = useQuery({
    queryKey: ["bills", { search, status, page }],
    queryFn: () =>
      api.get<Page<Bill>>("/api/accounting/bills", {
        search: search || undefined,
        status: status === "ALL" ? undefined : status,
        page,
        pageSize: 25,
      }),
    placeholderData: (prev) => prev,
  });

  // Fetch Accounting Summary
  const { data: summary } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: () => api.get<AccountingSummary>("/api/accounting/summary"),
  });

  // Resend Email Mutation
  const resendMutation = useMutation({
    mutationFn: (billId: string) =>
      api.post<Bill>(`/api/accounting/bills/${billId}/resend-email`),
    onSuccess: (updated) => {
      toast.success(`Invoice emailed to ${updated.recipientEmail}`);
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      if (selectedBill?.billId === updated.billId) {
        setSelectedBill(updated);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send invoice email");
    },
  });

  const getEmailStatusTone = (s: string) => {
    switch (s) {
      case "SENT":
        return "success";
      case "FAILED":
        return "danger";
      case "PENDING":
        return "warning";
      default:
        return "neutral";
    }
  };

  const getEmailStatusLabel = (s: string) => {
    switch (s) {
      case "SENT":
        return "Emailed";
      case "FAILED":
        return "Failed";
      case "PENDING":
        return "Sending";
      default:
        return "Not sent";
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        description="View delivery invoices, itemized charges with 18% GST, and manage customer receipts."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              setViewingPdf({
                open: true,
                endpoint: "/api/accounting/sample/pdf",
                title: "Sample Tax Invoice Preview",
                filename: "Sample-Tax-Invoice.pdf",
              })
            }
          >
            <FileText className="h-4 w-4" /> {t("view invoice pdf")}
          </Button>
        }
      />

      {/* Financial Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Invoiced"
          value={money(summary?.totalInvoiced ?? 0, 2)}
          sub="All charges including 18% GST"
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label="Subtotal"
          value={money(summary?.totalSubtotal ?? 0, 2)}
          sub="Net freight before taxes"
        />
        <StatCard
          label="GST (18%)"
          value={money(summary?.totalGst ?? 0, 2)}
          sub="Tax on delivery services"
          tone="warning"
        />
        <StatCard
          label="Total Invoices"
          value={num(summary?.billsCount ?? 0)}
          sub={`${num(summary?.sentBillsCount ?? 0)} emailed to clients`}
          icon={<Mail className="h-5 w-5" />}
        />
      </div>

      <Card className="overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by invoice #, load ID, customer, email…"
          />
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="ALL">All statuses</option>
              <option value="GENERATED">Generated</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <span className="text-[11px] text-ink-400">
              {data?.total?.toLocaleString() ?? 0} invoices
            </span>
          </div>
        </div>

        {/* Invoices Table */}
        {isLoading ? (
          <LoadingBlock rows={8} />
        ) : data?.data.length ? (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>{t("Invoices")} #</th>
                  <th>{t("Trip ID")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Dispatcher")}</th>
                  <th className="text-right">{t("Subtotal")}</th>
                  <th className="text-right">GST (18%)</th>
                  <th className="text-right">{t("Total")}</th>
                  <th>{t("Email Status")}</th>
                  <th className="text-right">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((bill) => (
                  <tr
                    key={bill.billId}
                    className="cursor-pointer transition-colors hover:bg-ink-50/50"
                    onClick={() => setSelectedBill(bill)}
                  >
                    <td>
                      <p className="mono text-[12px] font-semibold text-ink-900">{bill.billId}</p>
                      <p className="text-[10px] text-ink-400">{date(bill.createdAt)}</p>
                    </td>
                    <td>
                      <p className="mono text-[11.5px] font-medium text-ink-800">{bill.loadId}</p>
                      <p className="mono text-[10px] text-ink-400">{bill.tripId ?? "No Trip"}</p>
                    </td>
                    <td>
                      <p className="text-[12.5px] font-medium text-ink-900">{bill.customerName}</p>
                      <p className="text-[11px] text-ink-500">{bill.recipientEmail || "No email on file"}</p>
                    </td>
                    <td>
                      <p className="text-[12px] text-ink-700">{bill.dispatcherCompanyName}</p>
                    </td>
                    <td className="text-right font-mono text-[12px] text-ink-700">
                      {money(bill.subtotal, 2)}
                    </td>
                    <td className="text-right font-mono text-[12px] font-medium text-amber-700">
                      {money(bill.gstAmount, 2)}
                    </td>
                    <td className="text-right font-mono text-[12.5px] font-semibold text-ink-900">
                      {money(bill.totalAmount, 2)}
                    </td>
                    <td>
                      <Badge tone={getEmailStatusTone(bill.emailStatus)}>
                        {getEmailStatusLabel(bill.emailStatus)}
                      </Badge>
                    </td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            setViewingPdf({
                              open: true,
                              endpoint: `/api/accounting/bills/${bill.billId}/pdf`,
                              title: `Invoice ${bill.billId} · ${bill.customerName}`,
                              filename: `Invoice-${bill.billId}.pdf`,
                            })
                          }
                          className="text-[11px]"
                          title="View invoice PDF in browser"
                        >
                          <Eye className="h-3.5 w-3.5" /> {t("View PDF")}
                        </Button>
                        <a
                          href={api.getAuthenticatedUrl(`/api/accounting/bills/${bill.billId}/pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary btn-sm inline-flex items-center gap-1 text-[11px]"
                          title="Download invoice PDF"
                        >
                          <Download className="h-3 w-3" /> {t("Download PDF")}
                        </a>
                        {bill.recipientEmail ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={resendMutation.isPending && resendMutation.variables === bill.billId}
                            onClick={() => resendMutation.mutate(bill.billId)}
                            title="Resend email receipt to customer"
                            className="text-[11px]"
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="No invoices yet"
            description="Invoices are created automatically with 18% GST when a delivery is marked as completed."
            icon={<FileText className="h-6 w-6" />}
          />
        )}
      </Card>

      {/* Invoice Detail Drawer */}
      <Drawer open={Boolean(selectedBill)} onClose={() => setSelectedBill(null)} width="max-w-2xl">
        {selectedBill ? (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-ink-100 bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-lg font-bold text-ink-900">{selectedBill.billId}</span>
                    <Badge tone="success">{selectedBill.status}</Badge>
                    <Badge tone={getEmailStatusTone(selectedBill.emailStatus)}>
                      {getEmailStatusLabel(selectedBill.emailStatus)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-500">
                    Created on {date(selectedBill.createdAt)} · Delivery {selectedBill.loadId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setViewingPdf({
                        open: true,
                        endpoint: `/api/accounting/bills/${selectedBill.billId}/pdf`,
                        title: `Invoice ${selectedBill.billId} · ${selectedBill.customerName}`,
                        filename: `Invoice-${selectedBill.billId}.pdf`,
                      })
                    }
                    className="inline-flex items-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Invoice
                  </Button>
                  <a
                    href={api.getAuthenticatedUrl(`/api/accounting/bills/${selectedBill.billId}/pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary btn-sm inline-flex items-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  <button
                    onClick={() => setSelectedBill(null)}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Document Summary Box */}
              <div className="flex items-center justify-between rounded-lg border border-ink-100 bg-paper p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-ink-900">Official Tax Invoice (PDF)</p>
                    <p className="text-[11.5px] text-ink-500">Includes complete trip details, itemized charges, and 18% GST</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setViewingPdf({
                        open: true,
                        endpoint: `/api/accounting/bills/${selectedBill.billId}/pdf`,
                        title: `Invoice ${selectedBill.billId}`,
                        filename: `Invoice-${selectedBill.billId}.pdf`,
                      })
                    }
                    className="inline-flex items-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  <a
                    href={api.getAuthenticatedUrl(`/api/accounting/bills/${selectedBill.billId}/pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary btn-sm inline-flex items-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>

              {/* Dispatcher & Customer Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                    Dispatcher
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-900">
                    {selectedBill.dispatcherCompanyName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">Fleet Operations & Dispatch</p>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-400">GSTIN: 29AAACD1234F1Z5</p>
                </Card>

                <Card className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                    Customer / Recipient
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-900">
                    {selectedBill.customerName}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-600">
                    {selectedBill.recipientEmail || "No email address on file"}
                  </p>
                  {selectedBill.billingAddress ? (
                    <p className="mt-1 truncate text-[11px] text-ink-400">{selectedBill.billingAddress}</p>
                  ) : null}
                </Card>
              </div>

              {/* Delivery Specifications */}
              <Card className="p-4">
                <h4 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                  <Truck className="h-4 w-4 text-ink-400" /> Delivery Specifications
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Delivery ID</dt>
                    <dd className="font-mono font-medium text-ink-800">{selectedBill.loadId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Trip ID</dt>
                    <dd className="font-mono font-medium text-ink-800">{selectedBill.tripId ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Pickup</dt>
                    <dd className="font-medium text-ink-800">
                      {selectedBill.tripDetails?.originCity}, {selectedBill.tripDetails?.originState}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Drop-off</dt>
                    <dd className="font-medium text-ink-800">
                      {selectedBill.tripDetails?.destinationCity}, {selectedBill.tripDetails?.destinationState}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Distance</dt>
                    <dd className="font-medium text-ink-800">
                      {num(selectedBill.tripDetails?.actualDistanceMiles ?? selectedBill.tripDetails?.typicalDistanceMiles)} mi
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Driver</dt>
                    <dd className="font-medium text-ink-800">
                      {selectedBill.tripDetails?.driverName ?? "Fleet Driver"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Vehicle / Unit</dt>
                    <dd className="font-medium text-ink-800">
                      Unit {selectedBill.tripDetails?.truckUnit ?? "—"} / {selectedBill.tripDetails?.trailerNumber ?? "Trailer"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Delivered On</dt>
                    <dd className="font-medium text-ink-800">
                      {selectedBill.tripDetails?.deliveredAt
                        ? date(selectedBill.tripDetails.deliveredAt)
                        : date(selectedBill.createdAt)}
                    </dd>
                  </div>
                </dl>
              </Card>

              {/* Itemized Charges & 18% GST Breakdown */}
              <Card className="p-4">
                <h4 className="mb-3 text-[13px] font-semibold text-ink-900">
                  Itemized Charges & Tax
                </h4>
                <div className="space-y-2 border-b border-ink-100 pb-3 text-[12.5px]">
                  <div className="flex justify-between text-ink-700">
                    <span>Freight Charges</span>
                    <span className="font-mono">{money(selectedBill.linehaulAmount, 2)}</span>
                  </div>
                  <div className="flex justify-between text-ink-700">
                    <span>Fuel Extra / Surcharge</span>
                    <span className="font-mono">{money(selectedBill.fuelSurcharge, 2)}</span>
                  </div>
                  <div className="flex justify-between text-ink-700">
                    <span>Loading & Other Charges</span>
                    <span className="font-mono">{money(selectedBill.accessorialCharges, 2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-ink-100 pt-2 font-medium text-ink-900">
                    <span>Subtotal Before Tax</span>
                    <span className="font-mono">{money(selectedBill.subtotal, 2)}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-b border-ink-100 pb-3 text-[12.5px]">
                  <div className="flex justify-between font-semibold text-amber-800">
                    <span>Goods & Services Tax (GST {selectedBill.gstRate}%)</span>
                    <span className="font-mono">+{money(selectedBill.gstAmount, 2)}</span>
                  </div>
                  <p className="text-[11px] text-ink-400">
                    Central GST (9%): {money(selectedBill.gstAmount / 2, 2)} + State GST (9%): {money(selectedBill.gstAmount / 2, 2)}
                  </p>
                </div>

                <div className="mt-3 flex justify-between text-sm font-bold text-ink-900">
                  <span>Total Amount Due</span>
                  <span className="font-mono text-base text-signal-700">
                    {money(selectedBill.totalAmount, 2)}
                  </span>
                </div>
              </Card>

              {/* Customer Email Receipt */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                    <Mail className="h-4 w-4 text-ink-400" /> Customer Email Receipt
                  </h4>
                  {selectedBill.recipientEmail ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={resendMutation.isPending}
                      onClick={() => resendMutation.mutate(selectedBill.billId)}
                    >
                      <RotateCw className="h-3 w-3" /> Resend Receipt
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 text-[12px] text-ink-600">
                  <p>
                    Recipient: <strong>{selectedBill.recipientEmail || "None on file"}</strong>
                  </p>
                  <p className="mt-1">
                    Status: <Badge tone={getEmailStatusTone(selectedBill.emailStatus)}>{getEmailStatusLabel(selectedBill.emailStatus)}</Badge>
                    {selectedBill.emailSentAt ? ` on ${date(selectedBill.emailSentAt)}` : ""}
                  </p>
                  {selectedBill.emailError ? (
                    <p className="mt-1 rounded bg-red-50 p-2 text-[11px] text-red-700">
                      Note: {selectedBill.emailError}
                    </p>
                  ) : null}
                </div>
              </Card>
            </div>

            {/* Footer */}
            <div className="flex justify-between border-t border-ink-100 bg-ink-50 px-6 py-3.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/loads?open=${selectedBill.loadId}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" /> View Delivery Details
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedBill(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Direct In-Browser PDF Invoice Viewer */}
      <PdfViewerModal
        open={Boolean(viewingPdf?.open)}
        onClose={() => setViewingPdf(null)}
        pdfEndpoint={viewingPdf?.endpoint}
        title={viewingPdf?.title}
        filename={viewingPdf?.filename}
      />
    </>
  );
}
