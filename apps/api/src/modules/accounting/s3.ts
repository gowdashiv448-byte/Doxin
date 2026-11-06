import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../../config.js";

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (s3ClientInstance) return s3ClientInstance;
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  s3ClientInstance = new S3Client({
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    endpoint: config.AWS_ENDPOINT_URL || undefined,
    forcePathStyle: Boolean(config.AWS_ENDPOINT_URL),
  });
  return s3ClientInstance;
}

async function resolveStorageDir(): Promise<string> {
  const preferred = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR, "bills")
    : path.resolve(process.cwd(), "uploads", "bills");

  try {
    await fs.mkdir(preferred, { recursive: true });
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), "doxin-uploads", "bills");
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
}

export interface S3UploadResult {
  s3Url: string;
  s3Bucket: string;
  s3Key: string;
  localPath: string;
}

export async function uploadBillToS3(
  tenantId: string,
  billId: string,
  pdfBuffer: Buffer,
): Promise<S3UploadResult> {
  const bucket = config.AWS_S3_BUCKET || "doxin-bills";
  const s3Key = `${tenantId}/bills/${billId}.pdf`;
  const s3Url = `s3://${bucket}/${s3Key}`;

  // Always save a local copy in the workspace storage directory for local inspection & dev fallback
  const baseDir = await resolveStorageDir();
  const tenantDir = path.join(baseDir, tenantId);
  await fs.mkdir(tenantDir, { recursive: true });
  const localPath = path.join(tenantDir, `${billId}.pdf`);
  await fs.writeFile(localPath, pdfBuffer);

  const client = getS3Client();
  if (client) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: pdfBuffer,
          ContentType: "application/pdf",
          Metadata: {
            tenantId,
            billId,
            generatedAt: new Date().toISOString(),
          },
        }),
      );
    } catch (err) {
      console.error(`[AWS S3] Failed to upload bill ${billId} to S3:`, err);
      // We still return s3Url because the local copy succeeded and the canonical S3 path is defined
    }
  } else {
    // Development or test environment without live AWS credentials
    if (config.NODE_ENV !== "test") {
      console.log(`[AWS S3 Mock] Bill ${billId} saved locally at ${localPath}. Canonical S3 URL: ${s3Url}`);
    }
  }

  return {
    s3Url,
    s3Bucket: bucket,
    s3Key,
    localPath,
  };
}

export async function fetchBillPdf(tenantId: string, billId: string, s3Key?: string): Promise<Buffer> {
  // First attempt local cache (check base dir, tmpdir, cwd)
  const baseDir = await resolveStorageDir();
  const candidatePaths = [
    path.join(baseDir, tenantId, `${billId}.pdf`),
    path.join(os.tmpdir(), "doxin-uploads", "bills", tenantId, `${billId}.pdf`),
    path.resolve(process.cwd(), "uploads", "bills", tenantId, `${billId}.pdf`),
  ];

  for (const localPath of candidatePaths) {
    try {
      const data = await fs.readFile(localPath);
      return data;
    } catch {
      // Continue to next candidate
    }
  }

  const client = getS3Client();
  const bucket = config.AWS_S3_BUCKET || "doxin-bills";
  const key = s3Key || `${tenantId}/bills/${billId}.pdf`;

  if (client) {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const streamToBuffer = async (stream: unknown): Promise<Buffer> => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    };
    return streamToBuffer(response.Body);
  }

  throw new Error(`Bill PDF for ${billId} not found locally or in S3`);
}

