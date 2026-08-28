import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { s3Send } = vi.hoisted(() => ({
  s3Send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  S3Client: class {
    send = s3Send;
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: vi.fn(),
}));

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
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
  vi.mocked(createPresignedPost).mockResolvedValue({
    url: signedUrl,
    fields: {
      key: "photos/test",
      "Content-Type": "image/png",
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("S3 private photo storage", () => {
  it("creates a size-bounded private upload form and signed viewing URL", async () => {
    const upload = await createPhotoUpload("image/png", 1024);

    expect(upload.objectPath).toMatch(/^\/objects\/photos\/[a-f0-9-]+$/);
    expect(upload.uploadUrl).toBe(signedUrl);
    expect(upload.uploadMethod).toBe("POST");
    expect(upload.uploadFields).toEqual({
      key: "photos/test",
      "Content-Type": "image/png",
    });
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Bucket: "jamvi-private",
        Expires: 15 * 60,
        Fields: { "Content-Type": "image/png" },
        Conditions: [
          ["content-length-range", 1, 15 * 1024 * 1024],
          ["eq", "$Content-Type", "image/png"],
        ],
      }),
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

  it("validates S3 configuration and preserves stored photo path recognition", () => {
    expect(() => assertPhotoStorageConfiguration()).not.toThrow();
    expect(
      isStoredPhotoPath("/objects/photos/3dc216cd-296f-4d0d-97aa-6ceeeb1ee34c"),
    ).toBe(true);
    expect(isStoredPhotoPath("/objects/public/photo.png")).toBe(false);

    vi.stubEnv("S3_BUCKET", "");
    expect(() => assertPhotoStorageConfiguration()).toThrow("S3_BUCKET");
  });

  it("allows larger photos up to the 15 MB policy limit", async () => {
    await expect(createPhotoUpload("image/jpeg", 10 * 1024 * 1024)).resolves.toMatchObject({
      uploadMethod: "POST",
    });
    await expect(createPhotoUpload("image/jpeg", MAX_PHOTO_BYTES + 1)).rejects.toThrow(
      "smaller than 15 MB",
    );
  });
});
