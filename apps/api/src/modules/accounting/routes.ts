import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import { requireTenantId } from "../../db/index.js";
import { paginationSchema } from "../../lib/pagination.js";
import {
  generateBillForLoad,
  generatePreviewPdfForLoad,
  generateSampleInvoicePdf,
  getAccountingSummary,
  getBillById,
  getBillForLoad,
  listBills,
  resendBillEmail,
} from "./service.js";
import { fetchBillPdf } from "./s3.js";

const listSchema = paginationSchema.extend({
  status: z.string().optional(),
  customerId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export default async function accountingRoutes(app: FastifyInstance) {
  // List bills
  app.get("/bills", { preHandler: authenticate }, async (request) => {
    const q = listSchema.parse(request.query);
    return listBills(q);
  });

  // Accounting Summary Stats
  app.get("/summary", { preHandler: authenticate }, async () => {
    return getAccountingSummary();
  });

  // Sample Dummy Invoice PDF
  app.get("/sample/pdf", { preHandler: authenticate }, async (request, reply) => {
    const pdfBuffer = await generateSampleInvoicePdf(request.tenantName ?? undefined);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", 'inline; filename="Sample-Tax-Invoice.pdf"')
      .send(pdfBuffer);
  });

  app.get("/bills/sample/pdf", { preHandler: authenticate }, async (request, reply) => {
    const pdfBuffer = await generateSampleInvoicePdf(request.tenantName ?? undefined);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", 'inline; filename="Sample-Tax-Invoice.pdf"')
      .send(pdfBuffer);
  });

  // Live Preview Invoice PDF for any load (prior to or after delivery)
  app.get("/bills/preview/:loadId/pdf", { preHandler: authenticate }, async (request, reply) => {
    const { loadId } = request.params as { loadId: string };
    const pdfBuffer = await generatePreviewPdfForLoad(loadId);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="Invoice-Preview-${loadId}.pdf"`)
      .send(pdfBuffer);
  });

  app.get("/preview/:loadId/pdf", { preHandler: authenticate }, async (request, reply) => {
    const { loadId } = request.params as { loadId: string };
    const pdfBuffer = await generatePreviewPdfForLoad(loadId);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="Invoice-Preview-${loadId}.pdf"`)
      .send(pdfBuffer);
  });

  // Get bill by Load ID
  app.get("/bills/by-load/:loadId", { preHandler: authenticate }, async (request) => {
    const { loadId } = request.params as { loadId: string };
    const bill = await getBillForLoad(loadId);
    return { bill };
  });

  // Get bill by Bill ID
  app.get("/bills/:id", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return getBillById(id);
  });

  // Download Bill PDF
  app.get("/bills/:id/pdf", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const bill = await getBillById(id);
    const tenantId = requireTenantId();
    const pdfBuffer = await fetchBillPdf(tenantId, bill.billId, bill.s3Key);

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="Invoice-${bill.billId}.pdf"`)
      .send(pdfBuffer);
  });

  // Manually trigger bill generation for a load
  app.post("/bills/generate/:loadId", { preHandler: authenticate }, async (request, reply) => {
    const { loadId } = request.params as { loadId: string };
    const bill = await generateBillForLoad(loadId, { force: true });
    return reply.status(201).send(bill);
  });

  // Resend bill receipt email via AWS SES
  app.post("/bills/:id/resend-email", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    return resendBillEmail(id);
  });
}
