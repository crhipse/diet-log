import {
  assertPhotoLimit,
  blobToDataUrl,
  calculateContainedSize,
  compressImage,
  compressImages,
  dataUrlToBlob,
  getAnthropicImageMediaType,
  revokePendingPhoto
} from "./photos";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("calculateContainedSize", () => {
  it("keeps an image within the maximum dimension", () => {
    expect(calculateContainedSize(4_000, 3_000)).toEqual({
      width: 1_024,
      height: 768
    });
  });

  it("does not upscale a small image", () => {
    expect(calculateContainedSize(800, 600)).toEqual({
      width: 800,
      height: 600
    });
  });

  it("rejects invalid source dimensions", () => {
    expect(() => calculateContainedSize(0, 600)).toThrow(
      "이미지 크기가 올바르지 않습니다."
    );
  });
});

describe("photo count validation", () => {
  it("accepts up to five photos including existing photos", () => {
    expect(() => assertPhotoLimit(3, 2)).not.toThrow();
  });

  it("rejects more than five photos", () => {
    expect(() => assertPhotoLimit(4, 2)).toThrow("최대 5장");
  });
});

describe("photo compression", () => {
  it("falls back to JPEG when the browser cannot encode WebP", async () => {
    const close = vi.fn();
    const requestedFormats: string[] = [];

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 2_000,
        height: 1_000,
        close
      } as unknown as ImageBitmap)
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, type) => {
        requestedFormats.push(type ?? "");
        callback(
          new Blob(["compressed"], {
            type: type === "image/webp" ? "image/png" : "image/jpeg"
          })
        );
      }
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo-preview");

    const photo = await compressImage(
      new File(["camera-photo"], "meal.heic", { type: "image/heic" })
    );

    expect(requestedFormats).toEqual(["image/webp", "image/jpeg"]);
    expect(photo.blob.type).toBe("image/jpeg");
    expect(photo.width).toBe(1_024);
    expect(photo.height).toBe(512);
    expect(photo.previewUrl).toBe("blob:photo-preview");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("tries to decode mobile photos whose MIME type is empty", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 800,
        height: 600,
        close: vi.fn()
      } as unknown as ImageBitmap)
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["compressed"], { type: "image/webp" }))
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo-preview");

    const photo = await compressImage(new File(["photo"], "mobile-photo"));

    expect(photo.blob.type).toBe("image/webp");
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("identifies which selected photo could not be processed", async () => {
    await expect(
      compressImages([
        new File(["not-an-image"], "first.txt", { type: "text/plain" }),
        new File(["not-an-image"], "second.txt", { type: "text/plain" })
      ])
    ).rejects.toThrow("1번째 사진: 이미지 파일만 추가할 수 있습니다.");
  });
});

describe("data URL conversion", () => {
  it("round-trips a base64 blob", async () => {
    const original = dataUrlToBlob("data:image/webp;base64,AAECAwQ=");
    const dataUrl = await blobToDataUrl(original);
    const restored = dataUrlToBlob(dataUrl);

    expect(dataUrl).toBe("data:image/webp;base64,AAECAwQ=");
    expect(restored.type).toBe("image/webp");
    expect(restored.size).toBe(5);
  });

  it("decodes a percent-encoded data URL", () => {
    const blob = dataUrlToBlob(
      "data:text/plain;charset=UTF-8,hello%20world"
    );

    expect(blob.type).toBe("text/plain");
    expect(blob.size).toBe(11);
  });

  it("rejects malformed values", () => {
    expect(() => dataUrlToBlob("https://example.com/photo.webp")).toThrow(
      "올바른 데이터 URL"
    );
  });
});

describe("Anthropic image formats", () => {
  it("accepts JPEG photos created by the mobile fallback", () => {
    expect(
      getAnthropicImageMediaType(new Blob([], { type: "image/jpeg" }))
    ).toBe("image/jpeg");
  });

  it("normalizes image/jpg", () => {
    expect(getAnthropicImageMediaType(new Blob([], { type: "image/jpg" }))).toBe(
      "image/jpeg"
    );
  });

  it("rejects unsupported formats", () => {
    expect(() =>
      getAnthropicImageMediaType(new Blob([], { type: "image/heic" }))
    ).toThrow("지원하지 않는 사진 형식");
  });
});

describe("preview cleanup", () => {
  it("revokes the object URL", () => {
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    revokePendingPhoto({ previewUrl: "blob:test-preview" });

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-preview");
  });
});
