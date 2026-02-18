import { useState } from 'react';

interface IpfsImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function IpfsImage({ src, alt, className = '', fallback }: IpfsImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

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
        src={src}
        alt={alt}
        loading="lazy"
        className={`${className} ${status !== 'loaded' ? 'hidden' : ''}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  );
}
