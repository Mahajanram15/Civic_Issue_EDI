import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageComparisonModalProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen Before/After comparison modal.
 * Preserves the draggable slider interaction inside a 100vw × 100vh overlay.
 */
export function ImageComparisonModal({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  open,
  onClose,
}: ImageComparisonModalProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (open) {
      // Reset slider position on open
      setPosition(50);
      // Small delay for CSS transition to kick in
      requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
    } else {
      setVisible(false);
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  // Pointer events for drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      onClick={(e) => {
        // Close when clicking the backdrop (not the slider itself)
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen before and after comparison"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-[110] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-red-500/80 focus:outline-none focus:ring-2 focus:ring-white/30"
        title="Close (Esc)"
        aria-label="Close fullscreen view"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Hint text */}
      <div className="absolute bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs font-medium text-white/60 backdrop-blur-sm pointer-events-none">
        Drag to compare • Press Esc to close
      </div>

      {/* Slider container */}
      <div
        className={`relative w-[92vw] max-w-6xl transition-transform duration-300 ${
          visible ? 'scale-100' : 'scale-95'
        }`}
        style={{ aspectRatio: '16 / 10', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={containerRef}
          className="relative h-full w-full cursor-ew-resize select-none overflow-hidden rounded-xl shadow-2xl"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* After image (full background) */}
          <img
            src={afterSrc}
            alt={afterLabel}
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
              alt={beforeLabel}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                width: `${containerRef.current?.offsetWidth || 0}px`,
                maxWidth: 'none',
              }}
              draggable={false}
            />
          </div>

          {/* Divider line */}
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.6)]"
            style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
          >
            {/* Drag handle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-black/50 backdrop-blur-md shadow-lg transition-transform hover:scale-110">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <path d="M5 3L2 8L5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 3L14 8L11 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-4 left-4 z-20 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            {beforeLabel}
          </div>
          <div className="absolute top-4 right-4 z-20 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
            {afterLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
