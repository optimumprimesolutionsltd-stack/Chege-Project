import { randomUUID } from "crypto";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_PATH_PATTERN = /^\/objects\/photos\/[a-f0-9-]+$/i;

type PhotoStorageProvider = "replit" | "s3";

let s3Client: S3Client | null = null;

export type PhotoUpload = {
  objectPath: string;
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  uploadFields?: Record<string, string>;
};

function storageProvider(): PhotoStorageProvider {
  const configured = process.env.PHOTO_STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured === "replit" || configured === "s3") return configured;

  // Local Replit workflows keep using the managed storage sidecar. Any
  // external host defaults to S3-compatible private object storage.
  return process.env.REPL_ID ? "replit" : "s3";
}

function requiredS3Setting(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Private photo storage is not configured: set ${key} for S3-compatible storage.`,
    );
  }
  return value;
}

export function s3Bucket(): string {
  return requiredS3Setting("S3_BUCKET");
}

export function s3ClientInstance(): S3Client {
  if (s3Client) return s3Client;

  const endpoint = process.env.S3_ENDPOINT?.trim();
  s3Client = new S3Client({
    region: requiredS3Setting("S3_REGION"),
    endpoint: endpoint || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredS3Setting("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredS3Setting("AWS_SECRET_ACCESS_KEY"),
    },
  });
  return s3Client;
}

function privateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!value) throw new Error("Private object storage is not configured.");
  return value;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid private object storage path.");
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}

async function signObjectUrl(
  objectPath: string,
  method: "GET" | "PUT",
  ttlSeconds: number,
): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok)
    throw new Error(`Could not sign photo URL (${response.status}).`);
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url)
    throw new Error("Photo storage did not return a signed URL.");
  return body.signed_url;
}

async function signS3DownloadUrl(objectName: string): Promise<string> {
  const client = s3ClientInstance();
  const bucket = s3Bucket();
  await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }),
  );

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectName,
    }),
    { expiresIn: 60 * 60 },
  );
}

function photoObjectName(photoId: string): string {
  return `photos/${photoId}`;
}

function photoIdFromPath(photoPath: string): string {
  return photoPath.slice("/objects/photos/".length);
}

/**
 * Fail during external-production startup rather than leaving photo controls
 * visible and broken. Replit development continues to use PRIVATE_OBJECT_DIR.
 */
export function assertPhotoStorageConfiguration(): void {
  if (storageProvider() === "s3") {
    s3Bucket();
    requiredS3Setting("S3_REGION");
    requiredS3Setting("AWS_ACCESS_KEY_ID");
    requiredS3Setting("AWS_SECRET_ACCESS_KEY");
    return;
  }
  privateObjectDir();
}

export function isStoredPhotoPath(
  value: string | null | undefined,
): value is string {
  return Boolean(value && PHOTO_PATH_PATTERN.test(value));
}

export async function createPhotoUpload(
  contentType: string,
  size: number,
): Promise<PhotoUpload> {
  if (!ACCEPTED_PHOTO_TYPES.has(contentType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) {
    throw new Error("Choose an image smaller than 15 MB.");
  }

  const photoId = randomUUID();
  const objectName = photoObjectName(photoId);

  if (storageProvider() === "s3") {
    // Presigned POST policies are the only browser upload form that lets us
    // enforce the byte range in storage itself. A signed PUT can be replayed
    // with a larger body even after the API validates the declared size.
    const signed = await createPresignedPost(s3ClientInstance(), {
      Bucket: s3Bucket(),
      Key: objectName,
      Expires: 15 * 60,
      Fields: {
        "Content-Type": contentType,
      },
      Conditions: [
        ["content-length-range", 1, MAX_PHOTO_BYTES],
        ["eq", "$Content-Type", contentType],
      ],
    });

    return {
      objectPath: `/objects/${objectName}`,
      uploadUrl: signed.url,
      uploadMethod: "POST",
      uploadFields: signed.fields,
    };
  }

  const storagePath = `${privateObjectDir()}/${objectName}`;
  return {
    objectPath: `/objects/${objectName}`,
    uploadUrl: await signObjectUrl(storagePath, "PUT", 15 * 60),
    uploadMethod: "PUT",
  };
}

export async function verifyPhotoObject(photoPath: string): Promise<void> {
  if (!isStoredPhotoPath(photoPath)) throw new Error("Invalid photo object path.");
  const objectName = photoObjectName(photoIdFromPath(photoPath));
  if (storageProvider() === "s3") {
    await s3ClientInstance().send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: objectName }));
    return;
  }
  const response = await fetch(
    await signObjectUrl(`${privateObjectDir()}/${objectName}`, "GET", 60),
    { method: "HEAD", signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`Photo object verification failed (${response.status}).`);
}

export async function resolvePhotoUrl(
  photoPath: string | null | undefined,
): Promise<string | null> {
  if (!isStoredPhotoPath(photoPath)) return null;
  const objectName = photoObjectName(photoIdFromPath(photoPath));

  if (storageProvider() === "s3") {
    return signS3DownloadUrl(objectName);
  }

  return signObjectUrl(`${privateObjectDir()}/${objectName}`, "GET", 60 * 60);
}
