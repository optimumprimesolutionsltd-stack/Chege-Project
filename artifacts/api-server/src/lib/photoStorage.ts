import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function privateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!value) throw new Error("Private object storage is not configured.");
  return value;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
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
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) throw new Error(`Could not sign photo URL (${response.status}).`);
  const body = await response.json() as { signed_url?: string };
  if (!body.signed_url) throw new Error("Photo storage did not return a signed URL.");
  return body.signed_url;
}

export function isStoredPhotoPath(value: string | null | undefined): value is string {
  return Boolean(value && /^\/objects\/photos\/[a-f0-9-]+$/i.test(value));
}

export async function createPhotoUpload(
  contentType: string,
  size: number,
): Promise<{ objectPath: string; uploadUrl: string }> {
  if (!ACCEPTED_PHOTO_TYPES.has(contentType)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) {
    throw new Error("Choose an image smaller than 5 MB.");
  }

  const storagePath = `${privateObjectDir()}/photos/${randomUUID()}`;
  return {
    objectPath: `/objects/photos/${storagePath.split("/").pop()}`,
    uploadUrl: await signObjectUrl(storagePath, "PUT", 15 * 60),
  };
}

export async function resolvePhotoUrl(photoPath: string | null | undefined): Promise<string | null> {
  if (!isStoredPhotoPath(photoPath)) return null;
  const objectId = photoPath.slice("/objects/".length);
  return signObjectUrl(`${privateObjectDir()}/${objectId}`, "GET", 60 * 60);
}