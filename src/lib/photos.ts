import {
  IMAGE_QUALITY,
  MAX_IMAGE_DIMENSION,
  MAX_PHOTOS_PER_RECORD
} from "../constants";
import type { PendingPhoto } from "../types";
import { createId } from "./id";

export interface ImageDimensions {
  width: number;
  height: number;
}

interface DecodedImage extends ImageDimensions {
  source: CanvasImageSource;
  cleanup: () => void;
}

const WEBP_MEDIA_TYPE = "image/webp";
const JPEG_MEDIA_TYPE = "image/jpeg";
const JPEG_FALLBACK_QUALITY = 0.82;

export function calculateContainedSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension = MAX_IMAGE_DIMENSION
): ImageDimensions {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error("이미지 크기가 올바르지 않습니다.");
  }

  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new Error("최대 이미지 크기가 올바르지 않습니다.");
  }

  const limit = Math.floor(maxDimension);
  const scale = Math.min(1, limit / sourceWidth, limit / sourceHeight);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

export function assertPhotoLimit(
  incomingCount: number,
  existingCount = 0
): void {
  if (
    !Number.isInteger(incomingCount) ||
    !Number.isInteger(existingCount) ||
    incomingCount < 0 ||
    existingCount < 0
  ) {
    throw new Error("사진 개수가 올바르지 않습니다.");
  }

  if (incomingCount + existingCount > MAX_PHOTOS_PER_RECORD) {
    throw new Error(
      `사진은 기록 하나에 최대 ${MAX_PHOTOS_PER_RECORD}장까지 추가할 수 있습니다.`
    );
  }
}

export async function compressImage(file: File): Promise<PendingPhoto> {
  const sourceMediaType = normalizeMediaType(file.type);
  if (sourceMediaType && !sourceMediaType.startsWith("image/")) {
    throw new Error("이미지 파일만 추가할 수 있습니다.");
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch (error) {
    if (isHeicFile(file)) {
      throw new Error(
        "이 HEIC/HEIF 사진을 열지 못했습니다. 기기를 업데이트하거나 사진을 스크린샷으로 저장한 뒤 다시 선택해 주세요."
      );
    }
    throw error;
  }
  const dimensions = calculateContainedSize(decoded.width, decoded.height);
  let canvas: HTMLCanvasElement | undefined;

  try {
    canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("이 브라우저에서는 사진을 처리할 수 없습니다.");
    }

    context.drawImage(
      decoded.source,
      0,
      0,
      dimensions.width,
      dimensions.height
    );

    const blob = await encodeCanvasPhoto(canvas);

    return {
      id: createId("photo"),
      blob,
      width: dimensions.width,
      height: dimensions.height,
      previewUrl: URL.createObjectURL(blob)
    };
  } finally {
    decoded.cleanup();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export async function compressImages(
  files: readonly File[],
  existingCount = 0
): Promise<PendingPhoto[]> {
  assertPhotoLimit(files.length, existingCount);

  const photos: PendingPhoto[] = [];
  try {
    // Mobile devices can run out of memory if several full-size photos are decoded
    // at once, so process them sequentially.
    for (const [index, file] of files.entries()) {
      try {
        photos.push(await compressImage(file));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "사진을 불러오지 못했습니다.";
        throw new Error(
          files.length > 1 ? `${index + 1}번째 사진: ${message}` : message
        );
      }
    }
    return photos;
  } catch (error) {
    revokePendingPhotos(photos);
    throw error;
  }
}

export function revokePendingPhoto(
  photo: Pick<PendingPhoto, "previewUrl">
): void {
  if (
    photo.previewUrl &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(photo.previewUrl);
  }
}

export function revokePendingPhotos(
  photos: readonly Pick<PendingPhoto, "previewUrl">[]
): void {
  photos.forEach(revokePendingPhoto);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("사진을 데이터로 변환하지 못했습니다."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("사진을 읽지 못했습니다."));
    };
    reader.onabort = () => {
      reject(new Error("사진 읽기가 취소되었습니다."));
    };
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith("data:")) {
    throw new Error("올바른 데이터 URL이 아닙니다.");
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("올바른 데이터 URL이 아닙니다.");
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const metadataParts = metadata.split(";");
  const mediaType =
    metadataParts[0]?.trim().toLowerCase() || "application/octet-stream";
  const isBase64 = metadataParts
    .slice(1)
    .some((part) => part.trim().toLowerCase() === "base64");

  try {
    if (isBase64) {
      const binary = atob(payload.replace(/\s/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: mediaType });
    }

    const decoded = decodeURIComponent(payload);
    return new Blob([new TextEncoder().encode(decoded)], { type: mediaType });
  } catch {
    throw new Error("데이터 URL을 사진으로 변환하지 못했습니다.");
  }
}

export function getAnthropicImageMediaType(
  blob: Blob
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const mediaType = normalizeMediaType(blob.type);

  if (mediaType === "image/jpg") return "image/jpeg";
  if (
    mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp"
  ) {
    return mediaType;
  }

  throw new Error(
    "지원하지 않는 사진 형식입니다. 앱에서 사진을 다시 추가해 주세요."
  );
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isHeicFile(file: File): boolean {
  const mediaType = normalizeMediaType(file.type);
  return (
    mediaType === "image/heic" ||
    mediaType === "image/heif" ||
    /\.(?:heic|heif)$/i.test(file.name)
  );
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image"
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close()
      };
    } catch {
      // Some mobile browsers expose createImageBitmap but cannot decode camera
      // formats through it. The HTMLImageElement fallback may still work.
    }
  }

  return decodeWithImageElement(blob);
}

function decodeWithImageElement(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("사진 크기를 확인하지 못했습니다."));
        return;
      }

      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "사진을 열지 못했습니다. 다른 형식의 사진으로 다시 시도해 주세요."
        )
      );
    };
    image.src = objectUrl;
  });
}

async function encodeCanvasPhoto(canvas: HTMLCanvasElement): Promise<Blob> {
  const formats = [
    { mediaType: WEBP_MEDIA_TYPE, quality: IMAGE_QUALITY },
    { mediaType: JPEG_MEDIA_TYPE, quality: JPEG_FALLBACK_QUALITY }
  ] as const;

  for (const format of formats) {
    try {
      const blob = await canvasToBlob(
        canvas,
        format.mediaType,
        format.quality
      );
      if (
        blob &&
        normalizeMediaType(blob.type) === format.mediaType
      ) {
        return blob;
      }
    } catch {
      // Encoding support differs between mobile browsers. Try the next
      // broadly supported format instead of rejecting the selected photo.
    }
  }

  throw new Error(
    "사진을 저장 가능한 형식으로 압축하지 못했습니다. 다른 사진으로 다시 시도해 주세요."
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mediaType,
      quality
    );
  });
}
