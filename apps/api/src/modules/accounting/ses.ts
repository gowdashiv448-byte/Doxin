import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { config } from "../../config.js";

let sesClientInstance: SESClient | null = null;

function getSESClient(): SESClient | null {
  if (sesClientInstance) return sesClientInstance;
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  sesClientInstance = new SESClient({
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    endpoint: config.AWS_ENDPOINT_URL || undefined,
  });
  return sesClientInstance;
}

export interface SendBillEmailParams {
  to: string;
  from?: string;
  billId: string;
  loadId: string;
  tripId?: string | null;
  dispatcherCompanyName: string;
  customerName: string;
  totalAmount: number;
  subtotal: number;
  gstAmount: number;
  currency?: string;
  pdfBuffer: Buffer;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  htmlContent: string;
  attachmentName: string;
  attachmentBuffer: Buffer;
}): Buffer {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const crlf = "\r\n";

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    params.htmlContent,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${params.attachmentName}"`,
    "",
    params.attachmentBuffer.toString("base64").match(/.{1,76}/g)?.join(crlf) ?? "",
    "",
    `--${boundary}--`,
  ];

  return Buffer.from(lines.join(crlf));
}

export async function sendBillEmail(params: SendBillEmailParams): Promise<SendEmailResult> {
  const fromEmail = params.from || config.AWS_SES_FROM_EMAIL || "billing@doxin.com";
  const currency = params.currency || "USD";
  const formattedTotal = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(params.totalAmount);
  const formattedSubtotal = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(params.subtotal);
  const formattedGst = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(params.gstAmount);

  const subject = `Invoice & Delivery Receipt ${params.billId} for Load ${params.loadId} - ${params.dispatcherCompanyName}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 24px; background: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          .header { background: #0f172a; color: #ffffff; padding: 24px; }
          .header h1 { margin: 0 0 4px; font-size: 20px; color: #ffffff; }
          .header p { margin: 0; color: #94a3b8; font-size: 13px; }
          .content { padding: 24px; }
          .badge { display: inline-block; background: #ecfdf5; color: #047857; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; margin-bottom: 16px; }
          .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 16px 0; }
          .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .summary-row.total { border-top: 1px solid #cbd5e1; margin-top: 12px; padding-top: 12px; font-weight: bold; font-size: 16px; color: #0f172a; }
          .footer { padding: 16px 24px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${params.dispatcherCompanyName}</h1>
            <p>Automated Delivery Bill & Tax Invoice Receipt</p>
          </div>
          <div class="content">
            <span class="badge">Delivery Completed & Verified</span>
            <p>Dear <strong>${params.customerName}</strong>,</p>
            <p>Your delivery for Load <strong>${params.loadId}</strong> has been successfully marked as completed. Attached to this email is your official freight bill & tax invoice <strong>${params.billId}</strong>.</p>
            
            <div class="summary-card">
              <div style="font-weight: 600; font-size: 13px; color: #ea580c; text-transform: uppercase; margin-bottom: 12px;">Charges & GST Breakdown</div>
              <div class="summary-row"><span>Linehaul & Transport Subtotal:</span><span>${formattedSubtotal}</span></div>
              <div class="summary-row"><span>Goods & Services Tax (GST 18%):</span><span>${formattedGst}</span></div>
              <div class="summary-row total"><span>Total Amount Due:</span><span>${formattedTotal}</span></div>
            </div>

            <p style="font-size: 13px; color: #475569;">
              Trip Reference: <strong>${params.tripId || "Completed"}</strong><br />
              A PDF copy of this bill has been generated and securely stored in your tenant archive.
            </p>
            <p style="font-size: 13px; color: #475569;">
              Thank you for partnering with ${params.dispatcherCompanyName}.
            </p>
          </div>
          <div class="footer">
            Generated automatically via Doxin Fleet Accounting Platform & AWS SES
          </div>
        </div>
      </body>
    </html>
  `;

  const attachmentName = `Invoice-${params.billId}.pdf`;

  const client = getSESClient();
  if (client) {
    try {
      const rawMessage = buildMimeMessage({
        from: fromEmail,
        to: params.to,
        subject,
        htmlContent,
        attachmentName,
        attachmentBuffer: params.pdfBuffer,
      });

      const sendResult = await client.send(
        new SendRawEmailCommand({
          Source: fromEmail,
          Destinations: [params.to],
          RawMessage: { Data: rawMessage },
        }),
      );

      return {
        success: true,
        messageId: sendResult.MessageId,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[AWS SES] Failed sending email to ${params.to}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // Fallback in dev/test when AWS SES credentials are not present
  if (config.NODE_ENV !== "test") {
    console.log(`[AWS SES Mock] Email sent to ${params.to} for bill ${params.billId}. (AWS credentials not set)`);
  }
  return {
    success: true,
    messageId: `mock-ses-${Date.now()}`,
  };
}

