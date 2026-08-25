import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, groupsTable, pool, usersTable } from "@workspace/db";
import { logger } from "./lib/logger";
import {
  isStoredPhotoPath,
  s3Bucket,
  s3ClientInstance,
} from "./lib/photoStorage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PhotoReference = {
  path: string;
  referencedBy: string;
};

function replitPrivateObjectDir(): string {
  const value = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!value) {
    throw new Error(
      "PRIVATE_OBJECT_DIR must be set when copying legacy Replit-hosted photos.",
    );
  }
  return value;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error(`Invalid source object path: ${path}`);
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}

async function signedReplitDownloadUrl(objectPath: string): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(objectPath);
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "GET",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not sign legacy photo download (${response.status}).`,
    );
  }

  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Legacy photo download URL was empty.");
  return body.signed_url;
}

async function loadLegacyPhoto(photoPath: string): Promise<{
  body: Buffer;
  contentType: string;
  checksum: string;
}> {
  const objectName = photoPath.slice("/objects/".length);
  const response = await fetch(
    await signedReplitDownloadUrl(`${replitPrivateObjectDir()}/${objectName}`),
    { signal: AbortSignal.timeout(60_000) },
  );

  if (!response.ok) {
    throw new Error(
      `Could not download legacy photo ${photoPath} (${response.status}).`,
    );
  }

  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !ACCEPTED_PHOTO_TYPES.has(contentType)) {
    throw new Error(
      `Legacy photo ${photoPath} has unsupported content type "${contentType ?? "unknown"}".`,
    );
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1 || body.length > MAX_PHOTO_BYTES) {
    throw new Error(`Legacy photo ${photoPath} is outside the 1 B–15 MB limit.`);
  }

  return {
    body,
    contentType,
    checksum: createHash("sha256").update(body).digest("hex"),
  };
}

async function legacyPhotoReferences(): Promise<PhotoReference[]> {
  const [profiles, groups] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        photoPath: usersTable.customProfilePhotoPath,
      })
      .from(usersTable),
    db
      .select({
        id: groupsTable.id,
        photoPath: groupsTable.photoPath,
      })
      .from(groupsTable),
  ]);

  const references = [
    ...profiles.map((row) => ({
      path: row.photoPath,
      referencedBy: `profile:${row.id}`,
    })),
    ...groups.map((row) => ({
      path: row.photoPath,
      referencedBy: `workspace:${row.id}`,
    })),
  ].filter((reference): reference is { path: string; referencedBy: string } =>
    isStoredPhotoPath(reference.path),
  );

  return Array.from(
    new Map(
      references.map((reference) => [reference.path, reference]),
    ).values(),
  );
}

async function run(): Promise<void> {
  const write = process.env.PHOTO_MIGRATION_WRITE === "true";
  const references = await legacyPhotoReferences();

  logger.info(
    { count: references.length, write },
    "Checking legacy private photos for Render migration",
  );

  for (const reference of references) {
    const source = await loadLegacyPhoto(reference.path);
    const objectName = reference.path.slice("/objects/".length);

    if (!write) {
      logger.info(
        {
          photoPath: reference.path,
          referencedBy: reference.referencedBy,
          bytes: source.body.length,
          checksum: source.checksum,
        },
        "Verified legacy photo source (dry run)",
      );
      continue;
    }

    await s3ClientInstance().send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: objectName,
        Body: source.body,
        ContentType: source.contentType,
        Metadata: { sha256: source.checksum },
      }),
    );

    const target = await s3ClientInstance().send(
      new HeadObjectCommand({
        Bucket: s3Bucket(),
        Key: objectName,
      }),
    );

    if (
      target.ContentLength !== source.body.length ||
      target.Metadata?.sha256 !== source.checksum
    ) {
      throw new Error(
        `Target verification failed for ${reference.path}; no DNS cutover should happen.`,
      );
    }

    logger.info(
      {
        photoPath: reference.path,
        referencedBy: reference.referencedBy,
        bytes: source.body.length,
        checksum: source.checksum,
      },
      "Migrated and verified legacy private photo",
    );
  }

  logger.info(
    { count: references.length, write },
    write
      ? "Legacy private photo migration completed"
      : "Legacy private photo dry run completed",
  );
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Legacy private photo migration failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
