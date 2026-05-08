import "server-only";

import sharp from "sharp";
import type { SelectionBox } from "@/lib/types";
import { clamp } from "@/lib/utils";

function escapeNumber(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export async function createSelectionMaskBlob(selectionBox: SelectionBox) {
  const imageWidth = escapeNumber(selectionBox.imageWidth);
  const imageHeight = escapeNumber(selectionBox.imageHeight);
  const x = clamp(escapeNumber(selectionBox.x), 0, imageWidth);
  const y = clamp(escapeNumber(selectionBox.y), 0, imageHeight);
  const width = clamp(escapeNumber(selectionBox.width), 1, imageWidth - x);
  const height = clamp(escapeNumber(selectionBox.height), 1, imageHeight - y);

  const svg = `
    <svg width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black"/>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white"/>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Blob([new Uint8Array(png)], {
    type: "image/png"
  });
}
