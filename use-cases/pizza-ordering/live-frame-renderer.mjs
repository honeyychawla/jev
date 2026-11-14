// Decode offscreen and replace the pixels in one paint. The current frame stays
// visible during a slow request, image decode, or connection failure.
export async function paintLiveFrame(canvas, blob, isCurrent = () => true) {
  const bitmap = await createImageBitmap(blob);
  try {
    if (!isCurrent()) return false;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Live screen is unavailable.');
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    context.drawImage(bitmap, 0, 0);
    return true;
  } finally { bitmap.close(); }
}
