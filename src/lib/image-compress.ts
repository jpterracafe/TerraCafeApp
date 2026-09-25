/**
 * Utilitário de compressão de fotos no navegador antes do upload.
 * Reduz fotos de celulares (5MB - 12MB) para aproximadamente 200KB - 350KB
 * mantendo alta resolução (Full HD 1920px) e excelente nitidez visual.
 * 
 * Evita lentidão no 3G/4G rural e previne estouro do limite de payload da Vercel (4.5MB).
 */
export async function compressImage(
  file: File,
  maxDimension = 1920,
  quality = 0.82
): Promise<File> {
  // Ignora arquivos que não sejam imagem ou que já sejam bem pequenos (< 300KB)
  if (typeof window === 'undefined' || !file.type.startsWith('image/') || file.size <= 300 * 1024) {
    return file;
  }

  // Não comprime GIFs para não quebrar animações
  if (file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);

      let { width, height } = img;
      if (width <= 0 || height <= 0) {
        resolve(file);
        return;
      }

      // Redimensionamento proporcional se maior que maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Renderiza com boa interpolação
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // Se o arquivo resultante ficou maior que o original, mantém o original
            resolve(file);
            return;
          }

          const newFileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
          const compressedFile = new File([blob], newFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(file); // Fallback silencioso para o arquivo original se não conseguir ler
    };

    img.src = blobUrl;
  });
}
