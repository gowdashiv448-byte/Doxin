import PDFDocument from "pdfkit";

export interface InvoicePdfData {
  billId: string;
  loadId: string;
  tripId?: string | null;
  loadDate: string;
  deliveredAt?: string | null;
  dispatcherCompanyName: string;
  customerName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  billingAddress?: string | null;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  distanceMiles?: number | null;
  driverName?: string | null;
  truckUnit?: string | null;
  trailerNumber?: string | null;
  loadType?: string | null;
  weightLbs?: number | null;
  poNumber?: string | null;
  linehaulAmount: number;
  fuelSurcharge: number;
  accessorialCharges: number;
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency?: string;
}

function formatMoney(amount: number, _currency = "INR"): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Rs. ${formatted}`;
}

function toDateStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const currency = data.currency ?? "INR";
      const primaryColor = "#0f172a";
      const accentColor = "#ea580c";
      const mutedColor = "#64748b";
      const lightBg = "#f8fafc";
      const borderColor = "#e2e8f0";

      // --- Header: Dispatcher Company & Invoice Title ---
      doc
        .rect(0, 0, doc.page.width, 100)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(data.dispatcherCompanyName.toUpperCase(), 40, 32);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text("FREIGHT BILL & TAX INVOICE", 40, 60);

      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .text(data.billId, doc.page.width - 220, 32, { width: 180, align: "right" });

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#cbd5e1")
        .text(`Date: ${new Date().toISOString().slice(0, 10)}`, doc.page.width - 220, 60, { width: 180, align: "right" });

      // --- Billing Parties Section ---
      const topSectionY = 120;
      doc
        .roundedRect(40, topSectionY, 250, 105, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(accentColor)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("DISPATCHER / ISSUER", 52, topSectionY + 12);

      doc
        .fillColor(primaryColor)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(data.dispatcherCompanyName, 52, topSectionY + 28);

      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .font("Helvetica")
        .text("Doxin Fleet Operations Network", 52, topSectionY + 44)
        .text("GSTIN: 29AAACD1234F1Z5", 52, topSectionY + 58)
        .text("Status: Delivery Completed", 52, topSectionY + 72);

      // Bill To Box
      doc
        .roundedRect(305, topSectionY, 250, 105, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(accentColor)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("BILL TO (CUSTOMER)", 317, topSectionY + 12);

      doc
        .fillColor(primaryColor)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(data.customerName, 317, topSectionY + 28, { width: 230, ellipsis: true });

      doc
        .fillColor(mutedColor)
        .fontSize(9)
        .font("Helvetica");

      let customerDetailsY = topSectionY + 44;
      if (data.contactName) {
        doc.text(`Attn: ${data.contactName}`, 317, customerDetailsY);
        customerDetailsY += 14;
      }
      if (data.contactEmail) {
        doc.text(`Email: ${data.contactEmail}`, 317, customerDetailsY);
        customerDetailsY += 14;
      }
      if (data.billingAddress) {
        doc.text(data.billingAddress, 317, customerDetailsY, { width: 230, ellipsis: true });
      } else {
        doc.text("Billing Address on File", 317, customerDetailsY);
      }

      // --- Trip & Shipment Details ---
      const tripSectionY = 240;
      doc
        .rect(40, tripSectionY, doc.page.width - 80, 24)
        .fill("#0f172a");

      doc
        .fillColor("#ffffff")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("TRIP & SHIPMENT SPECIFICATIONS", 50, tripSectionY + 7);

      const tripBoxY = tripSectionY + 24;
      doc
        .rect(40, tripBoxY, doc.page.width - 80, 100)
        .fillAndStroke("#ffffff", borderColor);

      const col1 = 52;
      const col2 = 210;
      const col3 = 380;

      // Row 1
      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("LOAD REFERENCE", col1, tripBoxY + 10)
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text(data.loadId, col1, tripBoxY + 22);

      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("TRIP ID", col2, tripBoxY + 10)
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text(data.tripId ?? "—", col2, tripBoxY + 22);

      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("PO / REFERENCE", col3, tripBoxY + 10)
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text(data.poNumber ?? "—", col3, tripBoxY + 22);

      // Row 2
      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("LANE (ORIGIN -> DESTINATION)", col1, tripBoxY + 40)
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold")
        .text(`${data.originCity}, ${data.originState} → ${data.destinationCity}, ${data.destinationState}`, col1, tripBoxY + 52);

      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("DISTANCE", col3, tripBoxY + 40)
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold")
        .text(`${data.distanceMiles ?? "—"} km`, col3, tripBoxY + 52);

      // Row 3
      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("DRIVER", col1, tripBoxY + 70)
        .fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text(data.driverName ?? "Assigned Fleet Driver", col1, tripBoxY + 82);

      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("EQUIPMENT", col2, tripBoxY + 70)
        .fillColor(primaryColor).fontSize(9).font("Helvetica-Bold")
        .text(`Unit ${data.truckUnit ?? "—"} / ${data.trailerNumber ?? "Trailer"}`, col2, tripBoxY + 82);

      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("DELIVERY DATE", col3, tripBoxY + 70)
        .fillColor(primaryColor).fontSize(9).font("Helvetica-Bold")
        .text(toDateStr(data.deliveredAt || data.loadDate), col3, tripBoxY + 82);

      // --- Itemized Charges Breakdown Table ---
      const tableY = 380;
      doc
        .rect(40, tableY, doc.page.width - 80, 24)
        .fill("#0f172a");

      doc
        .fillColor("#ffffff")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("ITEM DESCRIPTION", 50, tableY + 7)
        .text("RATE / BASIS", 300, tableY + 7)
        .text("AMOUNT", doc.page.width - 140, tableY + 7, { width: 100, align: "right" });

      let currentY = tableY + 24;

      const items = [
        {
          desc: "Freight Transportation Charges",
          basis: `${data.distanceMiles ?? 0} km haul`,
          amount: data.linehaulAmount,
        },
        {
          desc: "Fuel Surcharge / Extra",
          basis: "Standard rate",
          amount: data.fuelSurcharge,
        },
        {
          desc: "Loading / Unloading & Other Charges",
          basis: "Additional services",
          amount: data.accessorialCharges,
        },
      ];

      items.forEach((item, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : lightBg;
        doc
          .rect(40, currentY, doc.page.width - 80, 24)
          .fillAndStroke(bg, borderColor);

        doc
          .fillColor(primaryColor)
          .fontSize(9)
          .font("Helvetica")
          .text(item.desc, 50, currentY + 7)
          .fillColor(mutedColor)
          .text(item.basis, 300, currentY + 7)
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .text(formatMoney(item.amount, currency), doc.page.width - 140, currentY + 7, {
            width: 100,
            align: "right",
          });

        currentY += 24;
      });

      // --- Summary / Totals Breakdown ---
      const totalsStartY = currentY + 12;
      const totalsBoxWidth = 240;
      const totalsBoxX = doc.page.width - 40 - totalsBoxWidth;

      doc
        .roundedRect(totalsBoxX, totalsStartY, totalsBoxWidth, 115, 4)
        .fillAndStroke(lightBg, borderColor);

      let ty = totalsStartY + 10;

      // Subtotal
      doc
        .fillColor(mutedColor).fontSize(9).font("Helvetica").text("Subtotal:", totalsBoxX + 15, ty)
        .fillColor(primaryColor).font("Helvetica-Bold")
        .text(formatMoney(data.subtotal, currency), totalsBoxX + 110, ty, { width: 115, align: "right" });

      ty += 18;

      // GST (18%)
      doc
        .fillColor(accentColor).fontSize(9).font("Helvetica-Bold")
        .text(`GST (${data.gstRate.toFixed(0)}%):`, totalsBoxX + 15, ty)
        .fillColor(accentColor).font("Helvetica-Bold")
        .text(formatMoney(data.gstAmount, currency), totalsBoxX + 110, ty, { width: 115, align: "right" });

      ty += 16;
      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica")
        .text(`(CGST 9%: ${formatMoney(data.gstAmount / 2, currency)} + SGST 9%: ${formatMoney(data.gstAmount / 2, currency)})`, totalsBoxX + 15, ty, { width: 210, align: "right" });

      ty += 16;
      doc.moveTo(totalsBoxX + 10, ty).lineTo(totalsBoxX + totalsBoxWidth - 10, ty).stroke(borderColor);

      ty += 8;

      // Total Due
      doc
        .fillColor(primaryColor).fontSize(12).font("Helvetica-Bold").text("TOTAL AMOUNT:", totalsBoxX + 15, ty)
        .fillColor(primaryColor).fontSize(13).font("Helvetica-Bold")
        .text(formatMoney(data.totalAmount, currency), totalsBoxX + 110, ty, { width: 115, align: "right" });

      // Left Box: Payment Notice & GST Tax Declaration
      doc
        .roundedRect(40, totalsStartY, doc.page.width - 80 - totalsBoxWidth - 15, 115, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("TAX DECLARATION & PAYMENT TERMS", 52, totalsStartY + 12);

      doc
        .fillColor(mutedColor)
        .fontSize(8.5)
        .font("Helvetica")
        .text(
          "This bill is electronically generated upon delivery completion. All freight charges are subject to Goods and Services Tax (GST) at 18.00% under Reverse Charge / Forward Charge transport rules.",
          52,
          totalsStartY + 28,
          { width: 250, lineGap: 3 },
        )
        .text("Payment terms: Net 30 days from delivery invoice date.", 52, totalsStartY + 74)
        .text(`Recipient Receipt Email: ${data.contactEmail ?? "On file"}`, 52, totalsStartY + 90);

      // --- Footer ---
      const footerY = doc.page.height - 45;
      doc
        .moveTo(40, footerY)
        .lineTo(doc.page.width - 40, footerY)
        .stroke(borderColor);

      doc
        .fillColor(mutedColor)
        .fontSize(8)
        .font("Helvetica")
        .text(
          `${data.dispatcherCompanyName} · Automated Cloud Accounting & Logistics System · Powered by Doxin`,
          40,
          footerY + 8,
          { align: "center", width: doc.page.width - 80 },
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
