import { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageModalProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export function ImageModal({ src, alt = 'Image', open, onClose }: ImageModalProps) {
  const [zoom, setZoom] = useState(1);

  const resetZoom = useCallback(() => setZoom(1), []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  // Reset zoom when modal opens/closes
  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  // Keyboard: Escape to close, +/- to zoom
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetZoom();
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose, zoomIn, zoomOut, resetZoom]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Full screen view: ${alt}`}
    >
      {/* Controls */}
      <div
        className="absolute top-4 right-4 z-[110] flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={zoomOut}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium text-white/80">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={resetZoom}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          title="Reset zoom (0)"
          aria-label="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-white/20" />
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-red-500/80"
          title="Close (Esc)"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image label */}
      {alt && alt !== 'Image' && (
        <div className="absolute bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
          {alt}
        </div>
      )}

      {/* Image container */}
      <div
        className="flex max-h-[85vh] max-w-[90vw] items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            'max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-transform duration-200 ease-out',
          )}
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}

/**
 * Helper hook for managing ImageModal state.
 * Usage:
 *   const { modalSrc, modalAlt, isOpen, openModal, closeModal } = useImageModal();
 *   <img onClick={() => openModal(url, 'Before Image')} ... />
 *   <ImageModal src={modalSrc} alt={modalAlt} open={isOpen} onClose={closeModal} />
 */
export function useImageModal() {
  const [state, setState] = useState<{ src: string; alt: string; open: boolean }>({
    src: '',
    alt: 'Image',
    open: false,
  });

  const openModal = useCallback((src: string, alt = 'Image') => {
    setState({ src, alt, open: true });
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return {
    modalSrc: state.src,
    modalAlt: state.alt,
    isOpen: state.open,
    openModal,
    closeModal,
  };
}
