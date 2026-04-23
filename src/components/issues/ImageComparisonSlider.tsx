import { useState, useRef, useCallback } from 'react';
import { ImageIcon, Maximize2 } from 'lucide-react';
import { ImageComparisonModal } from './ImageComparisonModal';

interface ImageComparisonSliderProps {
  beforeSrc: string;
  afterSrc: string | null;
  beforeLabel?: string;
  afterLabel?: string;
  /** Optional callback when an individual image thumbnail is clicked for single-image fullscreen */
  onImageClick?: (src: string, alt: string) => void;
}

export function ImageComparisonSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  onImageClick,
}: ImageComparisonSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hasDragged = useRef(false);

  // Fullscreen comparison modal state
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    hasDragged.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    hasDragged.current = true;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    const wasDragging = hasDragged.current;
    dragging.current = false;
    hasDragged.current = false;

    // If the user just clicked (no drag) → open fullscreen
    if (!wasDragging && afterSrc) {
      setFullscreenOpen(true);
    }
  }, [afterSrc]);

  if (!afterSrc) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{beforeLabel}</span>
          <div
            className={`relative overflow-hidden rounded-xl group ${onImageClick ? 'cursor-pointer' : ''}`}
            onClick={() => onImageClick?.(beforeSrc, beforeLabel)}
          >
            <img src={beforeSrc} alt="Before" className="w-full h-64 object-cover" />
            {onImageClick && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{afterLabel}</span>
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30">
            <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Awaiting Worker Upload</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Inline slider comparison — click (without drag) opens fullscreen */}
        <div className="relative">
          <div
            ref={containerRef}
            className="relative h-72 w-full cursor-ew-resize select-none overflow-hidden rounded-xl"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* After image (full background) */}
            <img
              src={afterSrc}
              alt="After"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />

            {/* Before image (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${position}%` }}
            >
              <img
                src={beforeSrc}
                alt="Before"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ width: `${containerRef.current?.offsetWidth || 0}px`, maxWidth: 'none' }}
                draggable={false}
              />
            </div>

            {/* Divider line */}
            <div
              className="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]"
              style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
            >
              {/* Handle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-black/50 backdrop-blur-sm shadow-lg">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3L2 8L5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M11 3L14 8L11 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-3 left-3 z-20 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {beforeLabel}
            </div>
            <div className="absolute top-3 right-3 z-20 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {afterLabel}
            </div>
          </div>

          {/* Fullscreen hint badge */}
          <button
            onClick={() => setFullscreenOpen(true)}
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white cursor-pointer"
            title="Open full screen comparison"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Full Screen
          </button>
        </div>

        {/* Side-by-side thumbnails — clickable for individual fullscreen */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{beforeLabel}</span>
            <div
              className={`relative overflow-hidden rounded-lg group ${onImageClick ? 'cursor-pointer' : ''}`}
              onClick={() => onImageClick?.(beforeSrc, beforeLabel)}
            >
              <img src={beforeSrc} alt="Before" className="w-full h-32 object-cover rounded-lg" />
              {onImageClick && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{afterLabel}</span>
            <div
              className={`relative overflow-hidden rounded-lg group ${onImageClick ? 'cursor-pointer' : ''}`}
              onClick={() => onImageClick?.(afterSrc, afterLabel)}
            >
              <img src={afterSrc} alt="After" className="w-full h-32 object-cover rounded-lg" />
              {onImageClick && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen comparison modal */}
      <ImageComparisonModal
        beforeSrc={beforeSrc}
        afterSrc={afterSrc}
        beforeLabel={beforeLabel}
        afterLabel={afterLabel}
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
      />
    </>
  );
}
