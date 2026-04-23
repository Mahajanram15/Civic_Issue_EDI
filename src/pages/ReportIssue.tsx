import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Upload, Image, FileText, Navigation, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { uploadIssueImage, createNotification, reportIssue } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { LocationSearch, type LocationResult } from '@/components/location/LocationSearch';

export default function ReportIssue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const applySelectedImageFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      applySelectedImageFile(file);
    }
  };

  const stopCameraStream = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraReady(true);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to access camera. Please allow camera permissions.';
        toast.error(message);
        setCameraOpen(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      toast.error('Failed to capture image. Please try again.');
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    applySelectedImageFile(file);
    setCameraOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!imageFile) return toast.error('Please upload an image');
    if (!description.trim()) return toast.error('Please add a description');
    if (!selectedLocation) return toast.error('Please select a location');

    setSubmitting(true);
    try {
      const [{ data: authData, error: authError }, { data: sessionData, error: sessionError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      const authUserId = authData.user?.id;
      const accessToken = sessionData.session?.access_token;
      if (authError || sessionError || !authUserId || !accessToken) {
        throw new Error('Authentication required. Please log in again.');
      }

      console.info('[Issue Submit] Uploading image...');
      const imageUrl = await uploadIssueImage(imageFile, user.id);

      console.info('[Issue Submit] Sending report...');
      const issue = await reportIssue({
        title: description.trim().slice(0, 80),
        image_url: imageUrl,
        description,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      }, accessToken);
      console.info('[Issue Submit] Done', { issueId: issue.id });

      await createNotification({
        user_id: user.id,
        message: 'Issue submitted successfully. AI processing in progress.',
        issue_id: issue.id,
      });

      toast.success('Issue submitted successfully. AI processing in progress.');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to report issue';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Report a New Problem</h1>
        <p className="mt-1.5 text-muted-foreground">Upload a photo and describe the problem. AI will classify and route it automatically.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload */}
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2"><Image className="h-4 w-4 text-primary" /></div>
            <Label className="text-sm font-semibold">Issue Photo</Label>
          </div>
          <label htmlFor="image-upload" className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/30 p-10 transition-all duration-300 hover:border-primary/40 hover:bg-primary/5">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-52 rounded-xl object-cover shadow-sm" />
            ) : (
              <>
                <div className="mb-3 rounded-xl bg-muted p-3">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground/70">Click to upload or drag & drop</p>
                <p className="mt-1 text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
              </>
            )}
          </label>
          <input id="image-upload" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="gap-2 rounded-xl" onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" />
              Use Camera
            </Button>
          </div>
        </div>

        <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Use Camera</DialogTitle>
              <DialogDescription>Capture a photo to attach to your report.</DialogDescription>
            </DialogHeader>

            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
              <video ref={videoRef} className="h-auto w-full" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCameraOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="gap-2 rounded-xl"
                onClick={handleCapture}
                disabled={!cameraReady}
              >
                <Camera className="h-4 w-4" />
                Capture
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Description */}
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2"><FileText className="h-4 w-4 text-primary" /></div>
            <Label htmlFor="description" className="text-sm font-semibold">Description</Label>
          </div>
          <Textarea
            id="description"
            placeholder="Describe the issue in detail — what's wrong, how severe, any safety concerns..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border-border/60 bg-muted/30 resize-none focus:bg-card"
          />
        </div>

        {/* Location — Smart Search */}
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2"><Navigation className="h-4 w-4 text-primary" /></div>
            <Label className="text-sm font-semibold">Location</Label>
          </div>
          <LocationSearch value={selectedLocation} onChange={setSelectedLocation} />
        </div>

        {/* Submit */}
        <Button type="submit" className="h-12 w-full gap-2 rounded-xl gradient-bg border-0 text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300" disabled={submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><Send className="h-4 w-4" /> Submit Report</>}
        </Button>
      </form>
    </div>
  );
}
