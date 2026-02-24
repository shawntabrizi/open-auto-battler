import { useCallback, useRef, useState } from 'react';
import { IPFS_GATEWAYS, extractCid } from '../utils/ipfs';

const RETRIES_PER_GATEWAY = 2;
const RETRY_DELAY_MS = 2000;

interface IpfsImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function IpfsImage({ src, alt, className = '', fallback }: IpfsImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const gatewayIndex = useRef(0);
  const retryCount = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleError = useCallback(() => {
    const cid = extractCid(src);
    if (!cid || !imgRef.current) {
      setStatus('error');
      return;
    }

    // Retry same gateway (the first attempt warms the cache)
    if (retryCount.current < RETRIES_PER_GATEWAY - 1) {
      retryCount.current += 1;
      setTimeout(() => {
        if (imgRef.current) {
          imgRef.current.src = `${IPFS_GATEWAYS[gatewayIndex.current]}${cid}#retry=${retryCount.current}`;
        }
      }, RETRY_DELAY_MS);
      return;
    }

    // Move to next gateway
    const nextIdx = gatewayIndex.current + 1;
    if (nextIdx < IPFS_GATEWAYS.length) {
      gatewayIndex.current = nextIdx;
      retryCount.current = 0;
      imgRef.current.src = `${IPFS_GATEWAYS[nextIdx]}${cid}`;
    } else {
      setStatus('error');
    }
  }, [src]);

  if (!src) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <>
      {status === 'loading' && (
        <div className={`animate-pulse bg-slate-700 rounded ${className}`} />
      )}
      {status === 'error' && (
        fallback ? <>{fallback}</> : (
          <div className={`bg-slate-800 rounded flex items-center justify-center text-slate-500 text-xs ${className}`}>
            Failed to load
          </div>
        )
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        className={`${className} ${status !== 'loaded' ? 'hidden' : ''}`}
        onLoad={() => setStatus('loaded')}
        onError={handleError}
      />
    </>
  );
}
