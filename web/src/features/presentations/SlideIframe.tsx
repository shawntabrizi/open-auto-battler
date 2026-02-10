import { useState } from 'react';

interface SlideIframeProps {
  src: string;
  title: string;
  height?: string;
  requireFullscreen?: boolean;
}

export function SlideIframe({ src, title, height = '30vh', requireFullscreen = true }: SlideIframeProps) {
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <iframe
          src={src}
          className="w-full h-full border-0"
          title={title}
        />
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-3 right-3 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-white text-sm rounded-lg border border-gray-600 backdrop-blur-sm transition-colors"
        >
          Exit Fullscreen
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <iframe
        src={src}
        className="w-full h-full border-0 rounded-lg"
        title={title}
      />
      {requireFullscreen && (
        <div
          onClick={() => setFullscreen(true)}
          className="group absolute inset-0 rounded-lg cursor-pointer flex items-center justify-center"
        >
          <span className="px-8 py-4 bg-gray-900/90 group-hover:bg-yellow-500 text-white group-hover:text-black text-lg font-bold rounded-xl border-2 border-gray-500 group-hover:border-yellow-400 shadow-lg group-hover:shadow-yellow-500/30 backdrop-blur-sm transition-all duration-200 group-hover:scale-110">
            Click to go full screen
          </span>
        </div>
      )}
    </div>
  );
}
