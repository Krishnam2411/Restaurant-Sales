import imageCompression from 'browser-image-compression';

interface CompressImageOptions {
  maxSize?: number;
  quality?: number;
  maxSizeMB?: number;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFile(file: File, options: CompressImageOptions = {}): Promise<string> {
  const maxSize = options.maxSize ?? 640;
  const quality = options.quality ?? 0.72;
  const maxSizeMB = options.maxSizeMB ?? 0.18;

  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image');
  }

  const compressedFile = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: maxSize,
    initialQuality: quality,
    useWebWorker: true,
    fileType: 'image/webp',
  });

  return fileToDataUrl(compressedFile);
}
