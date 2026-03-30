import { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw } from 'lucide-react';

const videoConstraints = {
  width: 640,
  height: 480,
  facingMode: 'user',
};

export default function BiometricCapture({
  value,
  onCapture,
  disabled = false,
  className = '',
}) {
  const webcamRef = useRef(null);
  const [cameraError, setCameraError] = useState('');

  const handleCapture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      setCameraError('Failed to capture frame. Please retry.');
      return;
    }
    setCameraError('');
    onCapture(imageSrc);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {!value ? (
        <div className="rounded-lg overflow-hidden border border-border/30 bg-black/50">
          <Webcam
            audio={false}
            mirrored
            screenshotFormat="image/jpeg"
            screenshotQuality={0.92}
            videoConstraints={videoConstraints}
            onUserMediaError={(err) => setCameraError(err?.message || 'Camera access denied')}
            ref={webcamRef}
            className="w-full h-auto"
          />
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-emerald-500/30 bg-emerald-500/5">
          <img src={value} alt="Captured biometric sample" className="w-full h-auto" />
        </div>
      )}

      {cameraError && <p className="text-xs text-destructive">{cameraError}</p>}

      <div className="flex gap-2">
        {!value ? (
          <Button type="button" size="sm" onClick={handleCapture} disabled={disabled} className="gap-1.5 text-xs">
            <Camera className="h-3.5 w-3.5" /> Capture Face
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCapture('')}
            disabled={disabled}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retake
          </Button>
        )}
      </div>
    </div>
  );
}
