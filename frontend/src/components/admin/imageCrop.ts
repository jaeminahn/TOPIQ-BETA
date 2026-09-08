export const ADMIN_CROP_ASPECT = 4 / 3;
export const ADMIN_CROP_MAX_WIDTH = 1_600;
export const ADMIN_CROP_MAX_HEIGHT = 1_200;

export type CropSize = { width: number; height: number };
export type CropOffset = { x: number; y: number };
export type CropGeometry = {
  offset: CropOffset;
  source: { x: number; y: number; width: number; height: number };
  output: CropSize;
  rendered: CropSize;
  scale: number;
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function cropGeometry(
  image: CropSize,
  viewport: CropSize,
  zoom: number,
  requestedOffset: CropOffset,
): CropGeometry {
  if (![image.width, image.height, viewport.width, viewport.height].every(finitePositive)) {
    throw new Error("Image and crop viewport dimensions must be positive");
  }

  const safeZoom = clamp(zoom, 1, 3);
  const baseScale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const scale = baseScale * safeZoom;
  const rendered = { width: image.width * scale, height: image.height * scale };
  const limitX = Math.max(0, (rendered.width - viewport.width) / 2);
  const limitY = Math.max(0, (rendered.height - viewport.height) / 2);
  const offset = {
    x: clamp(requestedOffset.x, -limitX, limitX),
    y: clamp(requestedOffset.y, -limitY, limitY),
  };
  const sourceWidth = viewport.width / scale;
  const sourceHeight = viewport.height / scale;
  const source = {
    x: clamp((image.width - sourceWidth) / 2 - offset.x / scale, 0, image.width - sourceWidth),
    y: clamp((image.height - sourceHeight) / 2 - offset.y / scale, 0, image.height - sourceHeight),
    width: sourceWidth,
    height: sourceHeight,
  };

  const uncappedWidth = Math.floor(Math.min(
    ADMIN_CROP_MAX_WIDTH,
    ADMIN_CROP_MAX_HEIGHT * ADMIN_CROP_ASPECT,
    sourceWidth,
  ));
  const outputWidth = Math.floor(uncappedWidth / 4) * 4;
  if (outputWidth < 4) throw new Error("Image is too small to crop");
  const output = { width: outputWidth, height: outputWidth / ADMIN_CROP_ASPECT };

  return { offset, source, output, rendered, scale };
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob?.type === "image/webp"
        ? resolve(blob)
        : reject(new Error("이 브라우저에서는 WebP 크롭을 지원하지 않습니다.")),
      "image/webp",
      0.92,
    );
  });
}

export async function cropImageToWebp(
  sourceFile: File,
  imageElement: HTMLImageElement,
  viewport: CropSize,
  zoom: number,
  offset: CropOffset,
) {
  const geometry = cropGeometry(
    { width: imageElement.naturalWidth, height: imageElement.naturalHeight },
    viewport,
    zoom,
    offset,
  );
  const canvas = document.createElement("canvas");
  canvas.width = geometry.output.width;
  canvas.height = geometry.output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이 브라우저에서는 이미지 크롭을 사용할 수 없습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    imageElement,
    geometry.source.x,
    geometry.source.y,
    geometry.source.width,
    geometry.source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await canvasBlob(canvas);
  const baseName = sourceFile.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}-cropped.webp`, { type: "image/webp", lastModified: Date.now() });
}
