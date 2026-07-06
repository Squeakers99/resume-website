import "server-only";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Server-only S3 helper. The browser uploads directly to S3 via presigned
// PUT URLs, so credentials never leave the server and uploads bypass any
// request-body size limits.
//
// Required env: S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
// Optional: S3_ENDPOINT_URL for S3-compatible services (MinIO, R2, ...).

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error("S3 is not configured (S3_BUCKET / AWS_REGION missing)");
  }
  const endpoint = process.env.S3_ENDPOINT_URL || undefined;
  return { bucket, region, endpoint };
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const { region, endpoint } = s3Config();
  client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
  return client;
}

export function projectImageKey(projectId: string, which: "main" | number): string {
  const name = which === "main" ? "main" : `secondary${which}`;
  return `project/${projectId}/${name}`;
}

export function publicObjectUrl(key: string): string {
  const { bucket, region, endpoint } = s3Config();
  if (endpoint) return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function presignImagePut(key: string, contentType: string): Promise<string> {
  if (!contentType.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }
  const { bucket } = s3Config();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3(), command, { expiresIn: 600 });
}

export async function objectExists(key: string): Promise<boolean> {
  const { bucket } = s3Config();
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
