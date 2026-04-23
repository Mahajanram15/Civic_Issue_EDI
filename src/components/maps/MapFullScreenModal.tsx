import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MapFullScreenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latitude: number;
  longitude: number;
  title?: string;
}

export function MapFullScreenModal({
  open,
  onOpenChange,
  latitude,
  longitude,
  title = 'Issue Location',
}: MapFullScreenModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-0 top-0 z-50 h-[100vh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0"
        // Override default centered positioning/animations to true fullscreen
        style={{ transform: 'none' }}
      >
        {/* Dark overlay handled by DialogOverlay; match required opacity */}
        <div className="absolute inset-0 bg-black/90" />

        <div className="relative h-full w-full">
          {/* Render map only when open so it sizes correctly */}
          {open && (
            <MapContainer
              center={[latitude, longitude]}
              zoom={16}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[latitude, longitude]}>
                <Popup>
                  {title}
                  <br />
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </Popup>
              </Marker>
            </MapContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

