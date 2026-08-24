import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { proxiedFetch } from '../utils';
import { isValidRenderableImageUrl } from '../lib/imageOptimizer';

const fetch = proxiedFetch;

interface GoogleDriveImageProps {
  driveId?: string;
  googleToken?: string | null;
  className?: string;
  imgClassName?: string;
  alt?: string;
  sz?: string;
  onClick?: (e: React.MouseEvent) => void;
  fallbackUrl?: string;
}

// Global in-memory cache to avoid duplicate network fetches
const driveBlobCache: { [key: string]: string } = {};

export default function GoogleDriveImage({
  driveId,
  googleToken,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  alt = 'Task Attachment',
  sz = 'w600',
  onClick,
  fallbackUrl
}: GoogleDriveImageProps) {
  const hasValidFallback = useMemo(() => isValidRenderableImageUrl(fallbackUrl), [fallbackUrl]);

  // Initial source calculation: prioritize cached blob, then valid base64 preview, then server proxy
  const [src, setSrc] = useState<string>(() => {
    if (driveId && driveBlobCache[driveId]) {
      return driveBlobCache[driveId];
    }
    if (hasValidFallback && fallbackUrl) {
      return fallbackUrl;
    }
    if (driveId) {
      return `/api/drive-image/${driveId}?sz=${sz}`;
    }
    return fallbackUrl || '';
  });

  const [loading, setLoading] = useState(false);
  const [hasFailedAll, setHasFailedAll] = useState(false);
  const [errorStep, setErrorStep] = useState(0);

  const handleImageError = () => {
    if (!driveId) {
      setHasFailedAll(true);
      return;
    }

    setErrorStep(prev => {
      const nextStep = prev + 1;
      if (nextStep === 1 && hasValidFallback && fallbackUrl && src !== fallbackUrl) {
        setSrc(fallbackUrl);
      } else if (nextStep === 2) {
        setSrc(`/api/drive-image/${driveId}?sz=${sz}`);
      } else if (nextStep === 3) {
        setSrc(`https://lh3.googleusercontent.com/d/${driveId}`);
      } else if (nextStep === 4) {
        setSrc(`https://drive.google.com/thumbnail?id=${driveId}&sz=${sz}`);
      } else if (nextStep === 5) {
        setSrc(`https://drive.google.com/uc?export=view&id=${driveId}`);
      } else {
        setHasFailedAll(true);
      }
      return nextStep;
    });
  };

  useEffect(() => {
    setErrorStep(0);
    setHasFailedAll(false);

    if (!driveId) {
      if (hasValidFallback && fallbackUrl) {
        setSrc(fallbackUrl);
      } else {
        setHasFailedAll(true);
      }
      return;
    }

    // 1. Check in-memory blob cache
    if (driveBlobCache[driveId]) {
      setSrc(driveBlobCache[driveId]);
      return;
    }

    // 2. If valid Base64 fallback is present, display it immediately while async loading full HD image
    if (hasValidFallback && fallbackUrl) {
      setSrc(fallbackUrl);
    } else {
      setSrc(`/api/drive-image/${driveId}?sz=${sz}`);
    }

    let isMounted = true;

    // 3. If token is present, asynchronously fetch high-res image and cache as Blob URL
    if (googleToken) {
      const fetchImageBlob = async () => {
        setLoading(true);
        try {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, {
            headers: {
              'Authorization': `Bearer ${googleToken}`
            }
          });

          if (!response.ok) {
            throw new Error(`Google Drive API returned status ${response.status}`);
          }

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          if (isMounted) {
            driveBlobCache[driveId] = objectUrl;
            setSrc(objectUrl);
            setHasFailedAll(false);
          }
        } catch (err) {
          console.warn('[GoogleDriveImage] Direct API fetch failed, relying on proxy or fallback:', err);
          if (isMounted && !hasValidFallback) {
            setSrc(`/api/drive-image/${driveId}?sz=${sz}`);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

      fetchImageBlob();
    }

    return () => {
      isMounted = false;
    };
  }, [driveId, googleToken, sz, fallbackUrl, hasValidFallback]);

  if (hasFailedAll && !src) {
    return (
      <div className={`relative ${className} flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2 text-center rounded-lg border border-slate-200 dark:border-slate-700`}>
        <ImageOff className="w-5 h-5 mb-1 opacity-60" />
        <span className="text-[10px] select-none truncate max-w-full">Изображение недоступно</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className} flex items-center justify-center overflow-hidden`}>
      <img
        src={src}
        alt={alt}
        className={`${imgClassName} cursor-pointer`}
        onClick={onClick}
        onError={handleImageError}
        referrerPolicy="no-referrer"
        loading="lazy"
      />
      {loading && (
        <div className="absolute inset-0 bg-slate-100/10 dark:bg-slate-900/10 flex items-center justify-center backdrop-blur-xs pointer-events-none">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
        </div>
      )}
    </div>
  );
}
