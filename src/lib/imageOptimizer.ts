/**
 * High-performance, client-side image optimization engine.
 * Automatically downsamples and compresses images (WebP/JPEG)
 * to ensure 100% fast, reliable synchronization across all devices and databases.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  size: number;
  type: string;
  name: string;
  width: number;
  height: number;
}

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  preferredType?: string;
}

/**
 * Checks if a given string is a valid, renderable image URL or Base64 data URL.
 */
export function isValidRenderableImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('_OMITTED_DUE_TO_SIZE_')) return false;
  if (trimmed.startsWith('data:image/')) return true;
  if (trimmed.startsWith('blob:')) return true;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    // Exclude Google Drive HTML web view links from being used as <img> src
    if (trimmed.includes('drive.google.com/file/d/') && trimmed.includes('/view')) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Compresses an image File or Blob to a lightweight, high-fidelity Base64 data URL.
 * Resizes large dimensions (e.g. 4000x3000 down to max 1280x1280) and applies WebP/JPEG compression.
 */
export async function compressImageForSync(
  fileOrBlob: File | Blob,
  options: OptimizeOptions = {}
): Promise<OptimizedImageResult> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.82,
  } = options;

  const fileName = (fileOrBlob as File).name || 'image.webp';
  const fileType = fileOrBlob.type || 'image/jpeg';

  // For SVGs or non-raster graphics, return original base64 directly
  if (fileType.includes('svg')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          dataUrl,
          size: fileOrBlob.size,
          type: 'image/svg+xml',
          name: fileName,
          width: 300,
          height: 300,
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrBlob);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const srcUrl = e.target?.result as string;
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // Calculate aspect ratio preserving dimensions
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Fallback if 2D context fails
            resolve({
              dataUrl: srcUrl,
              size: fileOrBlob.size,
              type: fileType,
              name: fileName,
              width: img.width,
              height: img.height,
            });
            return;
          }

          // Enable high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Try WebP first for superior compression, fallback to JPEG
          let outputType = 'image/webp';
          let dataUrl = canvas.toDataURL(outputType, quality);

          // If browser does not support WebP canvas export (returns image/png), use image/jpeg
          if (!dataUrl.startsWith('data:image/webp')) {
            outputType = 'image/jpeg';
            dataUrl = canvas.toDataURL(outputType, quality);
          }

          // Calculate estimated byte size from base64
          const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
          const estimatedBytes = Math.round((base64Length * 3) / 4);

          // Construct a nice file name
          const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
          const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
          const finalName = `${baseName}.${extension}`;

          resolve({
            dataUrl,
            size: estimatedBytes,
            type: outputType,
            name: finalName,
            width,
            height,
          });
        } catch (err) {
          console.warn('[ImageOptimizer] Canvas processing failed, falling back to original:', err);
          resolve({
            dataUrl: srcUrl,
            size: fileOrBlob.size,
            type: fileType,
            name: fileName,
            width: img.width,
            height: img.height,
          });
        }
      };

      img.onerror = () => {
        console.warn('[ImageOptimizer] Failed to load image element, using original Base64');
        resolve({
          dataUrl: srcUrl,
          size: fileOrBlob.size,
          type: fileType,
          name: fileName,
          width: 300,
          height: 300,
        });
      };

      img.src = srcUrl;
    };

    reader.onerror = () => {
      console.error('[ImageOptimizer] FileReader failed');
      resolve({
        dataUrl: '',
        size: 0,
        type: fileType,
        name: fileName,
        width: 0,
        height: 0,
      });
    };

    reader.readAsDataURL(fileOrBlob);
  });
}
