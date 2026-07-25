import {
  assertPhotoLimit,
  blobToDataUrl,
  calculateContainedSize,
  dataUrlToBlob,
  getAnthropicImageMediaType,
  revokePendingPhoto
} from "./photos";

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
