import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { proxiedFetch } from '../utils';

const fetch = proxiedFetch;

interface GoogleDriveImageProps {
  driveId: string;
  googleToken?: string | null;
  className?: string;
  imgClassName?: string;
  alt?: string;
  sz?: string;
  onClick?: (e: React.MouseEvent) => void;
  fallbackUrl?: string;
}

// Global cache to avoid multi-fetching same drive image and creating duplicate blob URLs
const driveBlobCache: { [key: string]: string } = {};

export default function GoogleDriveImage({
  driveId,
  googleToken,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  alt = 'Google Drive Image',
  sz = 'w300',
  onClick,
  fallbackUrl
}: GoogleDriveImageProps) {
  const [src, setSrc] = useState<string>(() => {
    // If we already have a cached blob URL for this drive ID, use it immediately
    if (driveBlobCache[driveId]) {
      return driveBlobCache[driveId];
    }
    // Fall back to direct cookieless CDN url which is extremely friendly to mobile browser ITP/third-party cookie blocking
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Reset/update src immediately when driveId changes to avoid showing stale image from another card
    if (driveBlobCache[driveId]) {
      setSrc(driveBlobCache[driveId]);
      return;
    }

    if (!googleToken) {
      setSrc(fallbackUrl || `https://lh3.googleusercontent.com/d/${driveId}`);
      return;
    }

    // Set immediate fallback/loading source
    setSrc(fallbackUrl || `https://lh3.googleusercontent.com/d/${driveId}`);

    let isMounted = true;
    const fetchImageBlob = async () => {
      setLoading(true);
      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, {
          headers: {
            'Authorization': `Bearer ${googleToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image from Google Drive API: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          driveBlobCache[driveId] = objectUrl;
          setSrc(objectUrl);
        }
      } catch (err) {
        console.warn('[GoogleDriveImage] Failed to load image via OAuth, falling back to cookieless link:', err);
        if (isMounted) {
          setSrc(fallbackUrl || `https://lh3.googleusercontent.com/d/${driveId}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchImageBlob();

    return () => {
      isMounted = false;
    };
  }, [driveId, googleToken, sz, fallbackUrl]);

  return (
    <div className={`relative ${className} flex items-center justify-center overflow-hidden`}>
      <img
        src={src}
        alt={alt}
        className={`${imgClassName} cursor-pointer`}
        onClick={onClick}
        referrerPolicy="no-referrer"
      />
      {loading && (
        <div className="absolute inset-0 bg-slate-100/10 dark:bg-slate-900/10 flex items-center justify-center backdrop-blur-xs">
          <Loader2 className="w-4.5 h-4.5 animate-spin text-indigo-500" />
        </div>
      )}
    </div>
  );
}
