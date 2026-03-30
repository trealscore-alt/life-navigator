import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, CameraOff, SwitchCamera, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  isStreaming: boolean;
  onStreamToggle: (streaming: boolean) => void;
}

export function CameraCapture({ onCapture, isStreaming, onStreamToggle }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [expanded, setExpanded] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      onStreamToggle(true);
    } catch (err) {
      toast.error('Camera access denied or not available');
      console.error('Camera error:', err);
    }
  }, [facingMode, onStreamToggle]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    onStreamToggle(false);
    setExpanded(false);
  }, [onStreamToggle]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    onCapture(base64);
    toast.success('Frame captured — CLRK can see it');
  }, [onCapture]);

  const switchCamera = useCallback(async () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  // Restart camera when facing mode changes while streaming
  useEffect(() => {
    if (isStreaming) startCamera();
  }, [facingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  if (!isStreaming) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={startCamera}
        className="text-muted-foreground hover:text-primary flex-shrink-0"
        title="Open camera — let CLRK see what you see"
      >
        <Camera className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Camera feed overlay */}
      <div className={`absolute z-20 ${
        expanded 
          ? 'inset-0 bg-background/95 backdrop-blur-xl' 
          : 'bottom-16 right-3 w-48 h-36 sm:w-64 sm:h-48 rounded-xl overflow-hidden'
      } border border-primary/30 shadow-[0_0_20px_-5px_hsl(var(--neon-glow)/0.3)]`}>
        {/* Camera controls */}
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-7 h-7 bg-background/60 backdrop-blur-sm text-foreground hover:bg-background/80"
            onClick={switchCamera}
          >
            <SwitchCamera className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-7 h-7 bg-background/60 backdrop-blur-sm text-foreground hover:bg-background/80"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-7 h-7 bg-destructive/60 backdrop-blur-sm text-white hover:bg-destructive/80"
            onClick={stopCamera}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Live indicator */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 bg-background/60 backdrop-blur-sm rounded-full px-2 py-0.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-mono text-foreground">LIVE</span>
        </div>

        {/* Capture button */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30">
          <Button
            onClick={captureFrame}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(var(--neon-glow)/0.5)] font-mono text-[10px] h-7 px-3"
          >
            <Camera className="w-3 h-3 mr-1.5" /> Capture for CLRK
          </Button>
        </div>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${expanded ? '' : 'rounded-xl'}`}
        />
      </div>

      {/* Toolbar button when streaming */}
      <Button
        variant="ghost"
        size="icon"
        onClick={captureFrame}
        className="text-primary bg-primary/10 shadow-[0_0_12px_-2px_hsl(var(--neon-glow)/0.5)] flex-shrink-0"
        title="Capture frame for CLRK"
      >
        <Camera className="w-4 h-4 animate-pulse" />
      </Button>
    </>
  );
}
