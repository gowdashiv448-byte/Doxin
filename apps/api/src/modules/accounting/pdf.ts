import PDFDocument from "pdfkit";

export interface InvoicePdfData {
  billId: string;
  loadId: string;
  tripId?: string | null;
  loadDate: string;
  deliveredAt?: string | null;
  dispatcherCompanyName: string;
  companyGstin?: string | null;
  companyPan?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyBankName?: string | null;
  companyBankAccount?: string | null;
  companyBankIfsc?: string | null;
  customerName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  billingAddress?: string | null;
  customerGstin?: string | null;
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

function numberToIndianWords(amount: number): string {
  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertTwoDigits(n: number): string {
    if (n === 0) return "";
    if (n < 20) return units[n] ?? "";
    const t = tens[Math.floor(n / 10)] ?? "";
    const u = units[n % 10] ?? "";
    return u ? `${t} ${u}` : t;
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = "";
    if (hundred > 0) {
      res += `${units[hundred] ?? ""} Hundred`;
      if (rest > 0) res += " ";
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const rounded = Math.floor(Math.abs(amount));
  if (rounded === 0) return "Rupees Zero Only";

  const crore = Math.floor(rounded / 10000000);
  let remainder = rounded % 10000000;
  const lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  const thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;
  const hundredPart = remainder;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
  if (hundredPart > 0) parts.push(convertThreeDigits(hundredPart));

  return `Rupees ${parts.join(" ")} Only`;
}

function drawCompanyLogo(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  accentColor: string,
  darkColor: string,
) {
  doc.save();
  // Logo background rounded badge
  doc.roundedRect(x, y, 44, 44, 8).fill(darkColor);

  // Geometric truck silhouette inside logo
  doc.fillColor("#ffffff");
  // Truck container
  doc.rect(x + 7, y + 13, 17, 16).fill("#ffffff");
  // Truck cabin
  doc
    .path(`M ${x + 25} ${y + 19} L ${x + 32} ${y + 19} L ${x + 37} ${y + 24} L ${x + 37} ${y + 29} L ${x + 25} ${y + 29} Z`)
    .fill("#ffffff");
  // Wheels
  doc.circle(x + 13, y + 31, 3.5).fill(darkColor);
  doc.circle(x + 32, y + 31, 3.5).fill(darkColor);
  doc.circle(x + 13, y + 31, 1.5).fill("#ffffff");
  doc.circle(x + 32, y + 31, 1.5).fill("#ffffff");

  // Speed accent dot
  doc.circle(x + 36, y + 9, 3.5).fill(accentColor);
  doc.restore();
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create A4 document (595.28 x 841.89 pt) with 36 pt margin, setting bottom margin to 0 to prevent accidental auto-break
      const doc = new PDFDocument({ margin: 36, size: "A4", autoFirstPage: true });
      doc.page.margins.bottom = 0;
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const currency = data.currency ?? "INR";
      const primaryColor = "#0f172a"; // Deep Slate / Navy
      const accentColor = "#ea580c";  // Brand Orange / Amber
      const mutedColor = "#64748b";   // Slate 500
      const lightBg = "#f8fafc";      // Slate 50
      const borderColor = "#e2e8f0";  // Slate 200
      const contentWidth = 523.28;
      const leftX = 36;
      const rightX = leftX + contentWidth;

      const companyGstin = data.companyGstin || "29AAACD1234F1Z5";
      const companyPan = data.companyPan || "AAACD1234F";
      const companyAddress = data.companyAddress || "Plot 42, Transport Nagar, Phase-II, Outer Ring Road, Bengaluru, Karnataka 560068";
      const companyPhone = data.companyPhone || "+91 80 4123 9800";
      const companyEmail = data.companyEmail || "billing@doxinlogistics.in";
      const companyBankName = data.companyBankName || "HDFC Bank Ltd.";
      const companyBankAccount = data.companyBankAccount || "50200084920194";
      const companyBankIfsc = data.companyBankIfsc || "HDFC0000128";

      const todayStr = new Date().toISOString().slice(0, 10);

      // =========================================================================
      // PAGE 1: TAX INVOICE & FREIGHT BILL
      // =========================================================================

      // --- Header: Vector Company Logo + Name + Invoice Badge ---
      drawCompanyLogo(doc, leftX, 36, accentColor, primaryColor);

      // Client Company Name & Fleet Tagline
      doc
        .fillColor(primaryColor)
        .fontSize(15)
        .font("Helvetica-Bold")
        .text(data.dispatcherCompanyName.toUpperCase(), leftX + 54, 38, { width: 280, ellipsis: true });

      doc
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .fillColor(accentColor)
        .text("FLEET LOGISTICS & SUPPLY CHAIN NETWORK", leftX + 54, 55);

      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(mutedColor)
        .text(`GSTIN: ${companyGstin}  |  PAN: ${companyPan}`, leftX + 54, 66);

      // Top Right: Tax Invoice Metadata Badge
      doc
        .roundedRect(rightX - 170, 36, 170, 44, 4)
        .fillAndStroke("#0f172a", "#0f172a");

      doc
        .fillColor(accentColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("TAX INVOICE / FREIGHT BILL", rightX - 165, 42, { width: 160, align: "right" });

      doc
        .fillColor("#ffffff")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(data.billId, rightX - 165, 52, { width: 160, align: "right" });

      doc
        .fillColor("#94a3b8")
        .fontSize(7.5)
        .font("Helvetica")
        .text(`Date: ${todayStr}  |  Original for Recipient`, rightX - 165, 68, { width: 160, align: "right" });

      // Subtle Top Divider
      doc
        .moveTo(leftX, 90)
        .lineTo(rightX, 90)
        .stroke(borderColor);

      // --- Billing Parties Section (Two Cards Side by Side) ---
      const partiesY = 98;
      const cardW = 254;

      // Left Card: Transporter / Issuer (Our Client)
      doc
        .roundedRect(leftX, partiesY, cardW, 94, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(accentColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("TRANSPORTER / ISSUER (OUR CLIENT)", leftX + 10, partiesY + 8);

      doc
        .fillColor(primaryColor)
        .fontSize(10.5)
        .font("Helvetica-Bold")
        .text(data.dispatcherCompanyName, leftX + 10, partiesY + 20, { width: cardW - 20, ellipsis: true });

      doc
        .fillColor(mutedColor)
        .fontSize(7.5)
        .font("Helvetica")
        .text(companyAddress, leftX + 10, partiesY + 34, { width: cardW - 20, lineGap: 1.5 })
        .text(`Phone: ${companyPhone}  |  Email: ${companyEmail}`, leftX + 10, partiesY + 64, { width: cardW - 20 })
        .text(`GSTIN: ${companyGstin}  |  State: ${data.originState || "KA"} (Code: 29)`, leftX + 10, partiesY + 76, { width: cardW - 20 });

      // Right Card: Consignee / Bill To Party
      const rightCardX = leftX + cardW + 15;
      doc
        .roundedRect(rightCardX, partiesY, cardW, 94, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor("#0284c7") // Sky blue accent
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("CONSIGNEE / BILLED TO", rightCardX + 10, partiesY + 8);

      doc
        .fillColor(primaryColor)
        .fontSize(10.5)
        .font("Helvetica-Bold")
        .text(data.customerName, rightCardX + 10, partiesY + 20, { width: cardW - 20, ellipsis: true });

      let custY = partiesY + 34;
      if (data.contactName) {
        doc
          .fillColor(primaryColor)
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .text(`Attn: ${data.contactName}`, rightCardX + 10, custY);
        custY += 10;
      }

      doc
        .fillColor(mutedColor)
        .fontSize(7.5)
        .font("Helvetica")
        .text(data.billingAddress || "Billing Address Registered on File", rightCardX + 10, custY, { width: cardW - 20, lineGap: 1 })
        .text(`Email: ${data.contactEmail || "billing@customer.com"}`, rightCardX + 10, partiesY + 64, { width: cardW - 20 })
        .text(`GSTIN: ${data.customerGstin || "27AAAPL5678K1ZR"}  |  Place of Supply: ${data.destinationState || "MH"}`, rightCardX + 10, partiesY + 76, { width: cardW - 20 });

      // --- Consignment & Trip Specifications Box ---
      const specsY = 202;
      doc
        .roundedRect(leftX, specsY, contentWidth, 20, 2)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("CONSIGNMENT & TRIP SPECIFICATIONS (RULE 54B GST)", leftX + 10, specsY + 6);

      const specsBoxY = specsY + 20;
      doc
        .rect(leftX, specsBoxY, contentWidth, 74)
        .fillAndStroke("#ffffff", borderColor);

      const col1X = leftX + 10;
      const col2X = leftX + 185;
      const col3X = leftX + 360;

      // Row 1
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("LOAD REFERENCE ID", col1X, specsBoxY + 8)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(data.loadId, col1X, specsBoxY + 17);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("TRIP NUMBER", col2X, specsBoxY + 8)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(data.tripId ?? "—", col2X, specsBoxY + 17);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("E-WAY BILL / PO REF", col3X, specsBoxY + 8)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(data.poNumber ?? "EWB-2024-88412", col3X, specsBoxY + 17);

      // Divider line
      doc.moveTo(leftX + 8, specsBoxY + 29).lineTo(rightX - 8, specsBoxY + 29).stroke("#f1f5f9");

      // Row 2
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("TRANSIT LANE (ORIGIN -> DESTINATION)", col1X, specsBoxY + 32)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold")
        .text(`${data.originCity}, ${data.originState}  ➔  ${data.destinationCity}, ${data.destinationState}`, col1X, specsBoxY + 41);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("BILLED DISTANCE", col2X, specsBoxY + 32)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(`${data.distanceMiles ?? 0} km`, col2X, specsBoxY + 41);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("COMMODITY / LOAD TYPE", col3X, specsBoxY + 32)
        .fillColor(primaryColor).fontSize(8.5).font("Helvetica-Bold").text(`${data.loadType ?? "Dry Freight"} (${data.weightLbs ?? "—"} kg)`, col3X, specsBoxY + 41);

      // Divider line
      doc.moveTo(leftX + 8, specsBoxY + 52).lineTo(rightX - 8, specsBoxY + 52).stroke("#f1f5f9");

      // Row 3
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("ASSIGNED TRUCK & TRAILER", col1X, specsBoxY + 55)
        .fillColor(primaryColor).fontSize(8).font("Helvetica-Bold")
        .text(`Truck Unit ${data.truckUnit ?? "—"}  /  Trailer ${data.trailerNumber ?? "Standard"}`, col1X, specsBoxY + 63);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("ASSIGNED FLEET DRIVER", col2X, specsBoxY + 55)
        .fillColor(primaryColor).fontSize(8).font("Helvetica-Bold").text(data.driverName ?? "Fleet Pilot Assigned", col2X, specsBoxY + 63);

      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("DELIVERY DATE / STATUS", col3X, specsBoxY + 55)
        .fillColor("#15803d").fontSize(8).font("Helvetica-Bold")
        .text(`${toDateStr(data.deliveredAt || data.loadDate)} (Completed)`, col3X, specsBoxY + 63);

      // --- Itemized Charges Breakdown Table ---
      const tableY = 306;
      doc
        .rect(leftX, tableY, contentWidth, 20)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("SL", leftX + 8, tableY + 6)
        .text("SERVICE / CHARGE DESCRIPTION", leftX + 32, tableY + 6)
        .text("SAC CODE", leftX + 245, tableY + 6)
        .text("RATE / BASIS", leftX + 320, tableY + 6)
        .text("TAXABLE AMOUNT (INR)", rightX - 130, tableY + 6, { width: 120, align: "right" });

      let currentY = tableY + 20;

      const items = [
        {
          sl: "1",
          desc: "Freight Transportation Linehaul Services",
          sac: "996511",
          basis: `${data.distanceMiles ?? 0} km road haulage`,
          amount: data.linehaulAmount,
        },
        {
          sl: "2",
          desc: "Fuel Surcharge & Operating Cost Adjustment",
          sac: "996511",
          basis: "Diesel index benchmarked",
          amount: data.fuelSurcharge,
        },
        {
          sl: "3",
          desc: "Loading, Detention & Auxiliary Transport Handling",
          sac: "996511",
          basis: "Verified accessorial tariff",
          amount: data.accessorialCharges,
        },
      ];

      items.forEach((item, idx) => {
        const bg = idx % 2 === 0 ? "#ffffff" : lightBg;
        doc
          .rect(leftX, currentY, contentWidth, 22)
          .fillAndStroke(bg, borderColor);

        doc
          .fillColor(primaryColor)
          .fontSize(8)
          .font("Helvetica")
          .text(item.sl, leftX + 8, currentY + 6)
          .text(item.desc, leftX + 32, currentY + 6)
          .fillColor(mutedColor)
          .text(item.sac, leftX + 245, currentY + 6)
          .text(item.basis, leftX + 320, currentY + 6)
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .text(formatMoney(item.amount, currency), rightX - 130, currentY + 6, {
            width: 120,
            align: "right",
          });

        currentY += 22;
      });

      // --- Summary / Totals Breakdown ---
      const totalsStartY = currentY + 10;
      const leftBoxWidth = 265;
      const rightBoxWidth = contentWidth - leftBoxWidth - 12;
      const rightBoxX = leftX + leftBoxWidth + 12;

      // Left Box: Amount in Words & GST Tax Statutory Declaration
      doc
        .roundedRect(leftX, totalsStartY, leftBoxWidth, 128, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("TOTAL AMOUNT IN WORDS", leftX + 10, totalsStartY + 8);

      const words = numberToIndianWords(data.totalAmount);
      doc
        .fillColor(accentColor)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text(words, leftX + 10, totalsStartY + 20, { width: leftBoxWidth - 20, lineGap: 1.5 });

      doc
        .moveTo(leftX + 10, totalsStartY + 48)
        .lineTo(leftX + leftBoxWidth - 10, totalsStartY + 48)
        .stroke(borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("STATUTORY GST DECLARATION & REVERSE CHARGE", leftX + 10, totalsStartY + 54);

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(
          "Goods Transport Agency (GTA) Service under SAC 996511. Tax discharged under forward charge mechanism in terms of notification No. 11/2017-CT(R). Certified that the particulars given in this tax invoice are true, complete, and legally authentic.",
          leftX + 10,
          totalsStartY + 66,
          { width: leftBoxWidth - 20, lineGap: 2 },
        );

      doc
        .fillColor("#047857")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("✓ Verified Electronic Invoice  •  Doxin Fleet OS", leftX + 10, totalsStartY + 112);

      // Right Box: Financial Totals Breakdown
      doc
        .roundedRect(rightBoxX, totalsStartY, rightBoxWidth, 128, 4)
        .fillAndStroke(lightBg, borderColor);

      let ty = totalsStartY + 8;

      // Subtotal
      doc
        .fillColor(mutedColor).fontSize(8).font("Helvetica").text("Taxable Freight Value:", rightBoxX + 12, ty)
        .fillColor(primaryColor).font("Helvetica-Bold")
        .text(formatMoney(data.subtotal, currency), rightBoxX + 100, ty, { width: rightBoxWidth - 112, align: "right" });

      ty += 16;

      // CGST
      doc
        .fillColor(mutedColor).fontSize(7.5).font("Helvetica").text("Central GST (CGST 9.0%):", rightBoxX + 12, ty)
        .fillColor(primaryColor).font("Helvetica")
        .text(formatMoney(data.gstAmount / 2, currency), rightBoxX + 100, ty, { width: rightBoxWidth - 112, align: "right" });

      ty += 14;

      // SGST
      doc
        .fillColor(mutedColor).fontSize(7.5).font("Helvetica").text("State GST (SGST 9.0%):", rightBoxX + 12, ty)
        .fillColor(primaryColor).font("Helvetica")
        .text(formatMoney(data.gstAmount / 2, currency), rightBoxX + 100, ty, { width: rightBoxWidth - 112, align: "right" });

      ty += 14;

      // Total GST
      doc
        .fillColor(accentColor).fontSize(8).font("Helvetica-Bold").text(`Total GST (${data.gstRate.toFixed(0)}%):`, rightBoxX + 12, ty)
        .fillColor(accentColor).font("Helvetica-Bold")
        .text(formatMoney(data.gstAmount, currency), rightBoxX + 100, ty, { width: rightBoxWidth - 112, align: "right" });

      ty += 16;
      doc.moveTo(rightBoxX + 8, ty).lineTo(rightX - 8, ty).stroke(borderColor);
      ty += 8;

      // Grand Total Amount
      doc
        .fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text("TOTAL AMOUNT:", rightBoxX + 12, ty)
        .fillColor(accentColor).fontSize(12).font("Helvetica-Bold")
        .text(formatMoney(data.totalAmount, currency), rightBoxX + 90, ty - 1, { width: rightBoxWidth - 102, align: "right" });

      ty += 20;
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica")
        .text("Payment terms: Net 30 days from delivery invoice date.", rightBoxX + 12, ty);

      // --- Consignment Note & E-Way Bill Notice Box ---
      const noticeY = totalsStartY + 138;
      doc
        .roundedRect(leftX, noticeY, contentWidth, 42, 4)
        .fillAndStroke("#f1f5f9", "#cbd5e1");

      doc
        .fillColor(primaryColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("CARRIER CONSIGNMENT & E-WAY BILL ACKNOWLEDGMENT", leftX + 10, noticeY + 7);

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(
          `Consignment Note (LR) No: LR-${data.loadId.replace(/[^0-9]/g, "") || "004291"}  |  E-Way Bill Status: Verified & Closed on Delivery  |  Place of Delivery: ${data.destinationCity}, ${data.destinationState}`,
          leftX + 10,
          noticeY + 18,
          { width: contentWidth - 20 },
        )
        .text(
          "Goods received in sound external condition without shortage or transit contamination.",
          leftX + 10,
          noticeY + 28,
        );

      // --- Page 1 Footer ---
      const footerY = 765;
      doc
        .moveTo(leftX, footerY)
        .lineTo(rightX, footerY)
        .stroke(borderColor);

      doc
        .fillColor(accentColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text(
          "Page 1 of 2  •  Turn over to Page 2 for Corporate Registrations, Banking Remittance & Transport Terms  ➔",
          leftX,
          footerY + 6,
          { align: "center", width: contentWidth },
        );

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(
          `${data.dispatcherCompanyName}  ·  Automated Cloud Accounting & Logistics System  ·  Powered by Doxin`,
          leftX,
          footerY + 18,
          { align: "center", width: contentWidth },
        );

      // =========================================================================
      // PAGE 2: CLIENT COMPANY'S OTHER DETAILS & THANK YOU
      // =========================================================================
      doc.addPage({ margin: 36, size: "A4" });
      doc.page.margins.bottom = 0;

      // Page 2 Header: Vector Logo + Company Name + Annexure Header
      drawCompanyLogo(doc, leftX, 36, accentColor, primaryColor);

      doc
        .fillColor(primaryColor)
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(data.dispatcherCompanyName.toUpperCase(), leftX + 54, 38, { width: 280, ellipsis: true });

      doc
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .fillColor(accentColor)
        .text("ANNEXURE: CORPORATE SPECIFICATIONS & SETTLEMENT TERMS", leftX + 54, 55);

      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(mutedColor)
        .text(`Reference Invoice: ${data.billId}  |  Load ID: ${data.loadId}`, leftX + 54, 66);

      // Top Right: Document Annexure Badge
      doc
        .roundedRect(rightX - 160, 36, 160, 44, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(accentColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("DOCUMENT ANNEXURE", rightX - 155, 42, { width: 150, align: "right" });

      doc
        .fillColor(primaryColor)
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .text("LEGAL & BANKING", rightX - 155, 52, { width: 150, align: "right" });

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(`Generated: ${todayStr}`, rightX - 155, 66, { width: 150, align: "right" });

      doc
        .moveTo(leftX, 90)
        .lineTo(rightX, 90)
        .stroke(borderColor);

      // --- Section 1: Corporate Profile & Regulatory Identifiers ---
      const sec1Y = 98;
      doc
        .roundedRect(leftX, sec1Y, contentWidth, 18, 2)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("1. CORPORATE IDENTIFICATION & LOGISTICS OPERATING PROFILE", leftX + 10, sec1Y + 5);

      const sec1BodyY = sec1Y + 18;
      doc
        .rect(leftX, sec1BodyY, contentWidth, 86)
        .fillAndStroke(lightBg, borderColor);

      const p2Col1 = leftX + 12;
      const p2Col2 = leftX + 265;

      // Left Column
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("REGISTERED CORPORATE OFFICE", p2Col1, sec1BodyY + 8)
        .fillColor(primaryColor).fontSize(8).font("Helvetica-Bold")
        .text(data.dispatcherCompanyName, p2Col1, sec1BodyY + 17)
        .fillColor(mutedColor).fontSize(7.5).font("Helvetica")
        .text(companyAddress, p2Col1, sec1BodyY + 28, { width: 235, lineGap: 1.5 })
        .text("Regional Operations: Mumbai, Delhi-NCR, Bengaluru, Chennai, Pune, Ahmedabad", p2Col1, sec1BodyY + 62, { width: 235 });

      // Right Column
      doc
        .fillColor(mutedColor).fontSize(7).font("Helvetica").text("STATUTORY REGISTRATIONS & IDENTIFIERS", p2Col2, sec1BodyY + 8)
        .fillColor(primaryColor).fontSize(7.5).font("Helvetica")
        .text(`• Corporate Identity No. (CIN):  U60200KA2021PTC148921`, p2Col2, sec1BodyY + 18)
        .text(`• Goods & Services Tax (GSTIN):  ${companyGstin}`, p2Col2, sec1BodyY + 29)
        .text(`• Permanent Account No. (PAN):  ${companyPan}`, p2Col2, sec1BodyY + 40)
        .text(`• MSME / Udyam Reg. No.:  UDYAM-KR-03-0098412`, p2Col2, sec1BodyY + 51)
        .text(`• 24x7 Fleet Helpline:  ${companyPhone}  |  ${companyEmail}`, p2Col2, sec1BodyY + 62);

      // --- Section 2: Bank Remittance Details ---
      const sec2Y = 210;
      doc
        .roundedRect(leftX, sec2Y, contentWidth, 18, 2)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("2. BANK REMITTANCE & PAYMENT SETTLEMENT DETAILS (NEFT / RTGS / IMPS / UPI)", leftX + 10, sec2Y + 5);

      const sec2BodyY = sec2Y + 18;
      doc
        .rect(leftX, sec2BodyY, contentWidth, 86)
        .fillAndStroke("#eff6ff", "#bfdbfe"); // Light blue background

      // Left Bank Column
      doc
        .fillColor("#1e3a8a").fontSize(7.5).font("Helvetica-Bold").text("DIRECT BANK TRANSFER (NEFT / RTGS)", p2Col1, sec2BodyY + 8);

      doc
        .fillColor(mutedColor).fontSize(7.5).font("Helvetica")
        .text("Beneficiary Name:", p2Col1, sec2BodyY + 20)
        .fillColor(primaryColor).font("Helvetica-Bold").text(data.dispatcherCompanyName, p2Col1 + 80, sec2BodyY + 20)
        .fillColor(mutedColor).font("Helvetica").text("Bank Name:", p2Col1, sec2BodyY + 32)
        .fillColor(primaryColor).font("Helvetica-Bold").text(companyBankName, p2Col1 + 80, sec2BodyY + 32)
        .fillColor(mutedColor).font("Helvetica").text("Account Number:", p2Col1, sec2BodyY + 44)
        .fillColor(primaryColor).font("Helvetica-Bold").text(companyBankAccount, p2Col1 + 80, sec2BodyY + 44)
        .fillColor(mutedColor).font("Helvetica").text("IFSC Code:", p2Col1, sec2BodyY + 56)
        .fillColor(primaryColor).font("Helvetica-Bold").text(companyBankIfsc, p2Col1 + 80, sec2BodyY + 56)
        .fillColor(mutedColor).font("Helvetica").text("Account Type:", p2Col1, sec2BodyY + 68)
        .fillColor(primaryColor).font("Helvetica-Bold").text("Current Account", p2Col1 + 80, sec2BodyY + 68);

      // Right Remittance Advice Column
      doc
        .fillColor("#1e3a8a").fontSize(7.5).font("Helvetica-Bold").text("DIGITAL REMITTANCE & ADVICE", p2Col2, sec2BodyY + 8);

      doc
        .fillColor(mutedColor).fontSize(7.5).font("Helvetica")
        .text("UPI Virtual Address (VPA):", p2Col2, sec2BodyY + 20)
        .fillColor(accentColor).font("Helvetica-Bold")
        .text(`billing@${data.dispatcherCompanyName.toLowerCase().replace(/[^a-z0-9]/g, "") || "doxin"}`, p2Col2 + 105, sec2BodyY + 20)
        .fillColor(mutedColor).font("Helvetica")
        .text("Payment Advice Instructions:", p2Col2, sec2BodyY + 35)
        .fillColor(primaryColor)
        .text(`• Please quote Invoice Ref #${data.billId} in your payment narration.`, p2Col2, sec2BodyY + 47, { width: 235 })
        .text(`• Email payment confirmation / UTR to ${companyEmail} for prompt receipt generation.`, p2Col2, sec2BodyY + 62, { width: 235 });

      // --- Section 3: Terms & Conditions of Carriage ---
      const sec3Y = 322;
      doc
        .roundedRect(leftX, sec3Y, contentWidth, 18, 2)
        .fill(primaryColor);

      doc
        .fillColor("#ffffff")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("3. STANDARD TERMS & CONDITIONS OF FREIGHT CARRIAGE", leftX + 10, sec3Y + 5);

      const sec3BodyY = sec3Y + 18;
      doc
        .rect(leftX, sec3BodyY, contentWidth, 150)
        .fillAndStroke("#ffffff", borderColor);

      const terms = [
        {
          num: "1.",
          title: "Payment Terms & Commercial Due Date:",
          text: "Payment is strictly due within 30 days from presentation of this delivery bill. Overdue balances attract commercial interest @ 18% per annum from the due date until full realization.",
        },
        {
          num: "2.",
          title: "Statutory Carriage Framework:",
          text: "Freight carriage is governed under the provisions of the Carriage by Road Act, 2007 and applicable Central Motor Vehicles Rules. The carrier operates under standard Goods Transport Agency (GTA) guidelines.",
        },
        {
          num: "3.",
          title: "Proof of Delivery & Claim Window:",
          text: "The delivery is deemed complete and accepted in sound external order upon electronic or physical endorsement of the Consignment Note (POD). Any transit discrepancy or claim must be notified in writing within 7 calendar days of delivery.",
        },
        {
          num: "4.",
          title: "Free Loading / Unloading & Detention Tariff:",
          text: "A standard allowance of 6 hours free time is provided for loading and unloading operations respectively. Detention charges beyond free time will be invoiced at the applicable fleet tariff schedule.",
        },
        {
          num: "5.",
          title: "Exclusive Legal Jurisdiction:",
          text: "Any dispute, difference, or claim arising out of or related to this transaction shall be subject to the exclusive jurisdiction of the competent courts of the issuer's registered head office city.",
        },
      ];

      let termY = sec3BodyY + 8;
      terms.forEach((t) => {
        doc
          .fillColor(accentColor).fontSize(7.5).font("Helvetica-Bold").text(t.num, p2Col1, termY)
          .fillColor(primaryColor).fontSize(7.5).font("Helvetica-Bold").text(t.title, p2Col1 + 14, termY);

        const titleWidth = doc.widthOfString(t.title) + 18;
        doc
          .fillColor(mutedColor).fontSize(7).font("Helvetica")
          .text(t.text, p2Col1 + 14, termY + 10, { width: contentWidth - 28, lineGap: 1 });

        termY += 27;
      });

      // --- Section 4: Authorized Digital Signatory Block ---
      const sec4Y = 498;
      const sigCardW = 254;

      // Left Box: Commercial Statutory Declaration
      doc
        .roundedRect(leftX, sec4Y, sigCardW, 76, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("DECLARATION & CERTIFICATION", leftX + 10, sec4Y + 8);

      doc
        .fillColor(mutedColor)
        .fontSize(7.5)
        .font("Helvetica")
        .text(
          "Certified that the particulars given above are true and correct and the amount indicated represents the price actually charged for the road freight transportation of the consignment.",
          leftX + 10,
          sec4Y + 22,
          { width: sigCardW - 20, lineGap: 2 },
        );

      // Right Box: Authorized Signatory Block
      const sigRightX = leftX + sigCardW + 15;
      doc
        .roundedRect(sigRightX, sec4Y, sigCardW, 76, 4)
        .fillAndStroke(lightBg, borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text(`FOR ${data.dispatcherCompanyName.toUpperCase()}`, sigRightX + 10, sec4Y + 8, { width: sigCardW - 20, ellipsis: true });

      doc
        .roundedRect(sigRightX + 10, sec4Y + 20, 110, 20, 2)
        .fillAndStroke("#ecfdf5", "#a7f3d0");

      doc
        .fillColor("#047857")
        .fontSize(7)
        .font("Helvetica-Bold")
        .text("✓ DIGITALLY SIGNED", sigRightX + 15, sec4Y + 25);

      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("Authorized Signatory", sigRightX + 10, sec4Y + 44)
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text("Commercial Accounts & Dispatch Fleet Division", sigRightX + 10, sec4Y + 56);

      // --- Section 5: Warm Thank You Banner ---
      const thankYouY = 588;
      doc
        .roundedRect(leftX, thankYouY, contentWidth, 80, 6)
        .fillAndStroke("#fff7ed", "#fed7aa"); // Warm amber/orange card

      // Star accents & bold heading
      doc
        .fillColor("#9a3412")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("★  THANK YOU FOR YOUR BUSINESS & VALUED PARTNERSHIP!  ★", leftX, thankYouY + 12, {
          align: "center",
          width: contentWidth,
        });

      doc
        .fillColor("#7c2d12")
        .fontSize(8.5)
        .font("Helvetica")
        .text(
          "We sincerely appreciate your association and the opportunity to handle your freight logistics movements. Our commitment is safe, reliable, and on-time transportation every single mile. For new load bookings, specialized trailer assignments, or tracking inquiries, our dispatch desk is always at your service.",
          leftX + 20,
          thankYouY + 30,
          { align: "center", width: contentWidth - 40, lineGap: 2.5 },
        );

      doc
        .fillColor("#b45309")
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text(`24x7 Customer Support: ${companyPhone}  •  ${companyEmail}`, leftX, thankYouY + 62, {
          align: "center",
          width: contentWidth,
        });

      // --- Page 2 Footer ---
      doc
        .moveTo(leftX, footerY)
        .lineTo(rightX, footerY)
        .stroke(borderColor);

      doc
        .fillColor(primaryColor)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text(
          "Page 2 of 2  •  Official Freight Documentation of " + data.dispatcherCompanyName,
          leftX,
          footerY + 6,
          { align: "center", width: contentWidth },
        );

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(
          "Powered by Doxin Cloud Logistics OS  ·  GST & ISO Compliant Transport Architecture",
          leftX,
          footerY + 18,
          { align: "center", width: contentWidth },
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
