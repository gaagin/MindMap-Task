import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, RotateCcw, AlertCircle, Sparkles, SwitchCamera, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = 'Сделать снимок с камеры'
}: CameraCaptureModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackFileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop active media stream tracks
  const stopMediaStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping media track:', e);
        }
      });
      setStream(null);
    }
  }, [stream]);

  // Check for multiple available video input devices
  const checkAvailableDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch (err) {
      console.warn('Unable to enumerate video devices:', err);
    }
  };

  // Start camera stream
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setIsInitializing(true);
    setCameraError(null);
    stopMediaStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Ваш браузер не поддерживает прямой доступ к веб-камере через WebRTC.');
      setIsInitializing(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        // If specific facingMode fails, try generic video constraint
        console.warn('FacingMode constraint failed, falling back to default video:', firstErr);
        newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(e => console.warn('Video play prevented:', e));
      }
      await checkAvailableDevices();
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Доступ к камере отклонен или заблокирован в настройках браузера.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Камера не обнаружена на этом устройстве.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Камера уже используется другим приложением или вкладкой.');
      } else {
        setCameraError(`Не удалось запустить камеру: ${err.message || 'Ошибка доступа'}`);
      }
    } finally {
      setIsInitializing(false);
    }
  }, [stopMediaStream]);

  // Handle modal open / close
  useEffect(() => {
    if (isOpen) {
      setCapturedPhotoUrl(null);
      setCapturedBlob(null);
      setCameraError(null);
      startCamera(cameraFacing);
    } else {
      stopMediaStream();
      setCapturedPhotoUrl(null);
      setCapturedBlob(null);
    }

    return () => {
      stopMediaStream();
    };
  }, [isOpen, cameraFacing, startCamera, stopMediaStream]);

  // Connect video element to stream when ready
  useEffect(() => {
    if (videoRef.current && stream && !capturedPhotoUrl) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn('Video play error:', e));
    }
  }, [stream, capturedPhotoUrl]);

  // Switch between front and back camera
  const handleToggleFacingMode = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
  };

  // Capture current frame from live video
  const handleTakePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flash animation effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    // If front camera (user), mirror horizontally for intuitive natural selfie orientation
    if (cameraFacing === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPhotoUrl(url);
      }
    }, 'image/jpeg', 0.92);
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
    }
    setCapturedPhotoUrl(null);
    setCapturedBlob(null);
    if (videoRef.current && stream) {
      videoRef.current.play().catch(e => console.warn('Play error on retake:', e));
    }
  };

  // Confirm and submit captured photo
  const handleConfirmPhoto = () => {
    if (!capturedBlob) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Photo_${timestamp}.jpg`;
    const photoFile = new File([capturedBlob], fileName, { type: 'image/jpeg' });

    onCapture(photoFile);
    handleCloseModal();
  };

  // Close and cleanup
  const handleCloseModal = () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
    }
    stopMediaStream();
    onClose();
  };

  // Fallback direct mobile/native camera file input
  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onCapture(files[0]);
      handleCloseModal();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[99999] animate-fade-in"
        onClick={handleCloseModal}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col w-full max-w-xl max-h-[92vh] text-white"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-100">{title}</h3>
                <p className="text-[11px] text-slate-400">
                  {capturedPhotoUrl ? 'Проверьте снимок перед сохранением' : 'Наведите камеру и нажмите на кнопку съемки'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseModal}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Viewfinder / Preview Body */}
          <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] sm:min-h-[380px] max-h-[60vh] overflow-hidden">
            {/* Flash Effect */}
            {isFlashing && (
              <div className="absolute inset-0 bg-white z-50 animate-pulse pointer-events-none" />
            )}

            {/* Error state */}
            {cameraError ? (
              <div className="p-6 text-center max-w-md space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-slate-200">Не удалось запустить камеру</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
                  <button
                    type="button"
                    onClick={() => startCamera(cameraFacing)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Попробовать снова
                  </button>

                  <button
                    type="button"
                    onClick={() => fallbackFileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" /> Выбрать фото с устройства
                  </button>
                </div>
              </div>
            ) : isInitializing ? (
              /* Loading / Initializing state */
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="w-10 h-10 rounded-2xl border-2 border-indigo-500 border-t-transparent animate-spin" />
                <p className="text-xs font-medium text-slate-400">Подключение к камере...</p>
              </div>
            ) : capturedPhotoUrl ? (
              /* Captured Photo Review state */
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                <img
                  src={capturedPhotoUrl}
                  alt="Captured snapshot"
                  className="max-h-[58vh] max-w-full object-contain rounded-lg shadow-lg"
                />
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[11px] font-medium text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3 h-3" /> Фото готово
                </div>
              </div>
            ) : (
              /* Live Camera Stream View */
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover sm:object-contain ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* Viewfinder Target Guidelines */}
                <div className="absolute inset-4 sm:inset-8 border border-white/20 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
                  <div className="flex justify-between">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-indigo-400" />
                    <div className="w-4 h-4 border-t-2 border-r-2 border-indigo-400" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-4 h-4 border-b-2 border-l-2 border-indigo-400" />
                    <div className="w-4 h-4 border-b-2 border-r-2 border-indigo-400" />
                  </div>
                </div>

                {/* Flip camera quick floating button */}
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95"
                  title="Переключить камеру (передняя / задняя)"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Offscreen Canvas for Snapshot Extraction */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Fallback Native Input with capture="environment" */}
          <input
            type="file"
            ref={fallbackFileInputRef}
            onChange={handleFallbackFile}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          {/* Footer Controls */}
          <div className="p-4 sm:p-5 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            {capturedPhotoUrl ? (
              /* Review Actions */
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Переснять
                </button>

                <button
                  type="button"
                  onClick={handleConfirmPhoto}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Использовать фото
                </button>
              </>
            ) : (
              /* Camera Shooting Actions */
              <>
                <button
                  type="button"
                  onClick={handleToggleFacingMode}
                  className="p-2.5 sm:px-3 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                  title="Переключить камеру"
                >
                  <SwitchCamera className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {cameraFacing === 'environment' ? 'Задняя' : 'Передняя'}
                  </span>
                </button>

                {/* Primary Shutter Button */}
                <div className="flex-1 flex justify-center">
                  <button
                    type="button"
                    disabled={isInitializing || !!cameraError}
                    onClick={handleTakePhoto}
                    className="group relative w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border-4 border-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-indigo-500/10"
                    title="Сделать фото"
                  >
                    <div className="w-11 h-11 rounded-full bg-white group-hover:scale-95 transition-transform" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fallbackFileInputRef.current?.click()}
                  className="p-2.5 sm:px-3 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition cursor-pointer"
                  title="Выбрать файл из галереи или памяти устройства"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Файл</span>
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
