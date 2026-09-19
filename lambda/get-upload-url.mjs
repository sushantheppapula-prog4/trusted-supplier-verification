import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";

const s3 = new S3Client({});
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "OPTIONS,POST",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") return response(204, {});

  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;
  if (!userId) return response(401, { error: "Authentication required" });

  let input;
  try {
    input = JSON.parse(event.body ?? "{}");
  } catch {
    return response(400, { error: "Request body must be valid JSON" });
  }

  const contentType = String(input.contentType ?? "").toLowerCase();
  const originalName = String(input.fileName ?? "");
  const fileSize = Number(input.fileSize);
  const extension = ALLOWED_TYPES.get(contentType);
  if (!extension || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_FILE_SIZE) {
    return response(400, { error: "Only PDF, JPG, JPEG, and PNG files up to 10 MB are allowed" });
  }

  const safeBaseName = originalName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || `invoice${extension}`;
  const key = `invoices/${userId}/${crypto.randomUUID()}/${safeBaseName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.INVOICE_BUCKET,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
    Metadata: { "uploaded-by": userId },
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return response(200, { uploadUrl, key, expiresIn: 300 });
};
