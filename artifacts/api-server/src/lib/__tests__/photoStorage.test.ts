import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { s3Send, s3Config } = vi.hoisted(() => ({
  s3Send: vi.fn(),
  // Captures what the client was constructed with, so the addressing style
  // can be asserted rather than assumed.
  s3Config: { last: undefined as unknown },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  S3Client: class {
    constructor(config: unknown) {
      s3Config.last = config;
    }
    send = s3Send;
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertPhotoStorageConfiguration,
  createPhotoUpload,
  isStoredPhotoPath,
  MAX_PHOTO_BYTES,
  resolvePhotoUrl,
} from "../photoStorage";

const signedUrl = "https://storage.example.test/signed";

beforeEach(() => {
  vi.stubEnv("PHOTO_STORAGE_PROVIDER", "s3");
  vi.stubEnv("S3_BUCKET", "jamvi-private");
  vi.stubEnv("S3_REGION", "auto");
  vi.stubEnv("S3_ENDPOINT", "https://storage.example.test");
  vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret-key");
  s3Send.mockResolvedValue({});
  vi.mocked(getSignedUrl).mockResolvedValue(signedUrl);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("S3 private photo storage", () => {
  it("signs a PUT upload and a viewing URL", async () => {
    const upload = await createPhotoUpload("image/png", 1024);

    expect(upload.objectPath).toMatch(/^\/objects\/photos\/[a-f0-9-]+$/);
    expect(upload.uploadUrl).toBe(signedUrl);
    // PUT, not POST: R2 does not implement PostObject, so a signed policy
    // returned a 200 from us and then had no endpoint to reach.
    expect(upload.uploadMethod).toBe("PUT");
    expect(upload.uploadFields).toBeUndefined();
    // Content-Type is signed, so the browser must send exactly what it asked
    // for. The client sends the same value it declared, and a mismatch is a
    // signature failure rather than a wrongly typed object in the bucket.
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "jamvi-private",
          ContentType: "image/png",
          Key: expect.stringMatching(/^photos\/[a-f0-9-]+$/),
        }),
      }),
      { expiresIn: 15 * 60 },
    );

    await expect(resolvePhotoUrl(upload.objectPath)).resolves.toBe(signedUrl);
    expect(getSignedUrl).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "jamvi-private",
        }),
      }),
      { expiresIn: 60 * 60 },
    );
    expect(s3Send).toHaveBeenCalledWith({
      input: {
        Bucket: "jamvi-private",
        Key: expect.stringMatching(/^photos\/[a-f0-9-]+$/),
      },
    });
  });

  it("does not sign a URL when the private photo object is missing", async () => {
    s3Send.mockRejectedValueOnce(new Error("NotFound"));

    await expect(
      resolvePhotoUrl("/objects/photos/3dc216cd-296f-4d0d-97aa-6ceeeb1ee34c"),
    ).rejects.toThrow("NotFound");
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("reads S3_FORCE_PATH_STYLE leniently, because it is typed by hand", async () => {
    // R2 serves path-style only. A value of "True" or one carrying a stray
    // space used to fall through to virtual-hosted addressing, where every
    // upload fails before CORS is consulted and the browser reports nothing
    // more useful than "Failed to fetch".
    for (const value of ["true", "TRUE", "True", " true "]) {
      vi.resetModules();
      vi.stubEnv("S3_FORCE_PATH_STYLE", value);
      const { s3ClientInstance } = await import("../photoStorage");
      s3ClientInstance();
      expect((s3Config.last as { forcePathStyle?: boolean }).forcePathStyle).toBe(true);
    }

    for (const value of ["false", "", "no"]) {
      vi.resetModules();
      vi.stubEnv("S3_FORCE_PATH_STYLE", value);
      const { s3ClientInstance } = await import("../photoStorage");
      s3ClientInstance();
      expect((s3Config.last as { forcePathStyle?: boolean }).forcePathStyle).toBe(false);
    }
  });

  it("validates S3 configuration and preserves stored photo path recognition", () => {
    expect(() => assertPhotoStorageConfiguration()).not.toThrow();
    expect(
      isStoredPhotoPath("/objects/photos/3dc216cd-296f-4d0d-97aa-6ceeeb1ee34c"),
    ).toBe(true);
    expect(isStoredPhotoPath("/objects/public/photo.png")).toBe(false);

    vi.stubEnv("S3_BUCKET", "");
    expect(() => assertPhotoStorageConfiguration()).toThrow("S3_BUCKET");
  });

  it("still refuses anything over 15 MB, which is now the only size check", async () => {
    // A POST policy let storage enforce the ceiling. A signed PUT cannot, so
    // this validation is the whole of it: it bounds an honest client, and the
    // cost of getting past it is the member's own storage quota.
    await expect(createPhotoUpload("image/jpeg", 10 * 1024 * 1024)).resolves.toMatchObject({
      uploadMethod: "PUT",
    });
    await expect(createPhotoUpload("image/jpeg", MAX_PHOTO_BYTES + 1)).rejects.toThrow(
      "smaller than 15 MB",
    );
  });
});
