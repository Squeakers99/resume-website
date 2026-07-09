import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Statement PDFs are private: no public-read ACL, keys under statements/*.
// Required env: S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT_URL || undefined;
    client = new S3Client({
      region: process.env.AWS_REGION,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }
  return client;
}

// Non-production runs archive under testing/ so local testing never touches
// the real statement archive. Keys are stored absolute in budget_documents,
// so deletes work no matter which environment wrote them.
export function statementKeyPrefix(): string {
  return process.env.NODE_ENV === "production" ? "" : "testing/";
}

export function requireBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3 is not configured (S3_BUCKET missing)");
  }
  return bucket;
}

export async function putStatementPdf(
  key: string,
  body: Buffer,
  contentType = "application/pdf"
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteStatementPdf(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: requireBucket(), Key: key }));
}
