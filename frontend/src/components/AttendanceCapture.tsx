import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  Alert,
  Chip,
  Stack,
  Divider,
  CircularProgress
} from '@mui/material';
import { CheckCircle, ErrorOutline, Videocam } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface FaceResult {
  name: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
  liveness: string;
  attendance_marked?: boolean;
  attendance_message?: string;
}

/**
 * Returns a color based on SCAN confidence thresholds:
 *   ≥80  → green  (high confidence – attendance marked)
 *  50–79 → yellow (moderate – verifying)
 *   <50  → red    (low / unrecognized)
 */
function getScoreColor(score: number): string {
  if (score >= 80) return '#4caf50';   // green – high confidence
  if (score >= 50) return '#ffc107';   // yellow – moderate
  return '#f44336';                     // red – low / unknown
}

/** Pulsing glow and slide-in keyframes injected once via <style> tag */
const GLOW_KEYFRAMES = `
@keyframes scorePulse {
  0%, 100% { box-shadow: 0 0 12px var(--glow-color); }
  50%      { box-shadow: 0 0 28px var(--glow-color), 0 0 48px var(--glow-color); }
}
@keyframes slideIn {
  from { transform: translate(-50%, -20px); opacity: 0; }
  to   { transform: translate(-50%, 0); opacity: 1; }
}
`;

/** Inject keyframes once on module load */
if (typeof document !== 'undefined' && !document.getElementById('scan-score-keyframes')) {
  const style = document.createElement('style');
  style.id = 'scan-score-keyframes';
  style.textContent = GLOW_KEYFRAMES;
  document.head.appendChild(style);
}

function AttendanceCapture() {
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Emotion / confidence score state (facemeet-inspired) ---
  const [avgScore, setAvgScore] = useState<number>(0);
  const [lastRecognizedName, setLastRecognizedName] = useState<string | null>(null);

  // Audio and visual notification states
  const lastAudioRef = useRef<{ [name: string]: number }>({});
  const [successBanner, setSuccessBanner] = useState<{ name: string; score: number; type: 'marked' | 'already_marked' } | null>(null);
  const [flashBorder, setFlashBorder] = useState<'green' | 'blue' | 'red' | null>(null);

  // Retrieve threshold from settings
  const savedSettings = localStorage.getItem('attendanceSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {};
  const threshold = settings.confidenceThreshold !== undefined ? settings.confidenceThreshold : 0.45;

  const playAudio = useCallback((audioFile: string) => {
    try {
      const savedSettings = localStorage.getItem('attendanceSettings');
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      const soundEnabled = settings.soundEnabled !== undefined ? settings.soundEnabled : true;
      const soundVolume = settings.soundVolume !== undefined ? settings.soundVolume : 80;
      
      if (!soundEnabled) return;

      const audio = new Audio(`${API_BASE_URL}/audio/${audioFile}`);
      audio.volume = soundVolume / 100;
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err);
      });
    } catch (err) {
      console.warn('Audio creation failed:', err);
    }
  }, []);

  // Check backend connection
  useEffect(() => {
    // Release any backend camera lock on mount to prevent hardware conflicts
    axios.post(`${API_BASE_URL}/api/camera-control/stop`).catch(() => {});

    const checkConnection = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 5000 });
        if (response.data.status === 'healthy') {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      } catch (err) {
        setConnectionStatus('disconnected');
        console.error('Backend connection failed:', err);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  // Setup WebRTC and the Poll Loop
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
        setError('Unable to access webcam. Please ensure permissions are granted.');
      }
    };

    startCamera();

    // The polling loop function
    const captureAndSend = async () => {
      if (!videoRef.current || !hiddenCanvasRef.current || !canvasOverlayRef.current) return;
      if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) return;
      
      const video = videoRef.current;
      const hiddenCanvas = hiddenCanvasRef.current;
      const overlayCanvas = canvasOverlayRef.current;
      
      // Ensure canvases match video dimensions
      if (hiddenCanvas.width !== video.videoWidth || hiddenCanvas.height !== video.videoHeight) {
        hiddenCanvas.width = video.videoWidth;
        hiddenCanvas.height = video.videoHeight;
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;
      }
      
      const hiddenCtx = hiddenCanvas.getContext('2d');
      if (!hiddenCtx) return;
      
      // Draw current frame to hidden canvas
      hiddenCtx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
      
      // Extract Base64
      const base64Image = hiddenCanvas.toDataURL('image/jpeg', 0.5);
      
      try {
        setIsProcessing(true);
        const response = await axios.post(`${API_BASE_URL}/api/recognize`, {
          image: base64Image,
          threshold: threshold
        });
        
        const faces: FaceResult[] = response.data.faces || [];

        // ── Compute average confidence score (facemeet-style) ──
        if (faces.length > 0) {
          const total = faces.reduce((sum, f) => sum + f.confidence, 0);
          const avg = total / faces.length;
          setAvgScore(parseFloat(avg.toFixed(1)));

          // Track the most-confident recognized name
          const recognized = faces.filter(f => f.name !== 'Unknown' && f.confidence > 0);
          if (recognized.length > 0) {
            const best = recognized.reduce((a, b) => a.confidence > b.confidence ? a : b);
            setLastRecognizedName(best.name);
          } else {
            setLastRecognizedName(null);
          }

          // ── AUDIO & VISUAL SIGNALS TRIGGER ──
          let flashType: 'green' | 'blue' | 'red' | null = null;
          const now = Date.now();

          faces.forEach(face => {
            if (face.name !== 'Unknown') {
              const lastPlayed = lastAudioRef.current[face.name] || 0;

              if (face.attendance_marked) {
                // Attendance marked successfully just now!
                playAudio('attendance_marked.wav');
                lastAudioRef.current[face.name] = now;

                setSuccessBanner({ name: face.name, score: face.confidence, type: 'marked' });
                flashType = 'green';

                // Clear banner after 4 seconds
                setTimeout(() => {
                  setSuccessBanner(prev => prev && prev.name === face.name && prev.type === 'marked' ? null : prev);
                }, 4000);
              } else if (face.attendance_message && face.attendance_message.toLowerCase().includes('already marked')) {
                // Attendance is already marked!
                // Play audio only if we haven't played it for this person in the last 15 seconds to prevent audio spam
                if (now - lastPlayed > 15000) {
                  playAudio('attendance_is_already_marked.wav');
                  lastAudioRef.current[face.name] = now;
                }

                setSuccessBanner(prev => {
                  if (!prev || prev.type === 'already_marked') {
                    return { name: face.name, score: face.confidence, type: 'already_marked' };
                  }
                  return prev;
                });

                if (!flashType) flashType = 'blue';

                // Clear banner after 3 seconds
                setTimeout(() => {
                  setSuccessBanner(prev => prev && prev.name === face.name && prev.type === 'already_marked' ? null : prev);
                }, 3000);
              }
            } else {
              // Face detected but unrecognized (Unknown)
              if (!flashType) flashType = 'red';

              // Play person_not_detected voice alert with a cooldown of 10s to prevent spamming
              const lastUnknownPlayed = lastAudioRef.current['__unknown__'] || 0;
              if (now - lastUnknownPlayed > 10000) {
                playAudio('person_not_detected.wav');
                lastAudioRef.current['__unknown__'] = now;
              }
            }
          });

          if (flashType) {
            setFlashBorder(flashType);
            setTimeout(() => setFlashBorder(prev => prev === flashType ? null : prev), 1200);
          }

        } else {
          // Decay score smoothly toward 0 when no faces present
          setAvgScore(prev => parseFloat((prev * 0.7).toFixed(1)));
          setLastRecognizedName(null);
        }
        
        // Clear overlay
        const overlayCtx = overlayCanvas.getContext('2d');
        if (overlayCtx) {
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          
          // Draw each face
          faces.forEach(face => {
            const { x, y, w, h } = face.box;
            
            // Determine color based on liveness
            let strokeColor = '#f44336'; // Red
            if (face.attendance_marked) strokeColor = '#4caf50'; // Green
            else if (face.attendance_message && face.attendance_message.toLowerCase().includes('already marked')) strokeColor = '#2196f3'; // Blue
            else if (face.liveness === 'passed') strokeColor = '#4caf50'; // Green fallback
            
            // Draw Box
            overlayCtx.strokeStyle = strokeColor;
            overlayCtx.lineWidth = 3;
            overlayCtx.strokeRect(x, y, w, h);
            
            // Label Background
            overlayCtx.fillStyle = strokeColor;
            const text = face.name !== 'Unknown' && face.confidence > 0 
              ? `${face.name} (${face.confidence}%)` 
              : face.name;
              
            overlayCtx.fillRect(x, y - 30, w, 30);
            
            // Text
            overlayCtx.fillStyle = 'white';
            overlayCtx.font = 'bold 16px Arial';
            overlayCtx.fillText(text, x + 5, y - 10);
          });
        }
        
      } catch (err: any) {
        console.error('Recognition error:', err);
      } finally {
        setIsProcessing(false);
      }
    };

    // Run interval every 1.2 seconds to allow audio to trigger properly without overlap
    intervalRef.current = setInterval(captureAndSend, 1200);

    return () => {
      // Cleanup interval and tracks
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [threshold, playAudio]);

  // Derived values for the score badge
  const scoreColor = getScoreColor(avgScore);
  const scoreLabel =
    avgScore >= 80 ? 'Verified' :
    avgScore >= 50 ? 'Verifying' :
    avgScore > 0   ? 'Uncertain' :
    'No Face';

  return (
    <Box sx={{ maxWidth: { xs: '100%', sm: 600, md: 800 }, mx: 'auto' }}>
      <Typography 
        variant="h5" 
        gutterBottom 
        sx={{ textAlign: 'center', mb: { xs: 2, sm: 3 }, fontWeight: 600 }}
      >
        Live Attendance Capture (DNN)
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Chip
          icon={connectionStatus === 'connected' ? <CheckCircle /> : <ErrorOutline />}
          label={connectionStatus === 'connected' ? 'Backend Connected' : 'Checking Connection...'}
          color={connectionStatus === 'connected' ? 'success' : 'default'}
          size="small"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Stack spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Videocam color="primary" />
            <Typography variant="subtitle1" fontWeight="bold">
              Client-Side Capture
            </Typography>
            {isProcessing && <CircularProgress size={16} sx={{ ml: 1 }} />}
          </Box>
          <Divider sx={{ width: '100%' }} />
          
          {/* ── Video container with score badge overlay and glow flash border ── */}
          <Box sx={{ 
            position: 'relative', 
            width: '100%', 
            maxWidth: 640, 
            borderRadius: 2, 
            overflow: 'hidden', 
            border: flashBorder === 'green'
              ? '4px solid #4caf50'
              : flashBorder === 'blue'
              ? '4px solid #2196f3'
              : flashBorder === 'red'
              ? '4px solid #f44336'
              : '4px solid #e0e0e0',
            boxShadow: flashBorder === 'green'
              ? '0 0 24px rgba(76, 175, 80, 0.8)'
              : flashBorder === 'blue'
              ? '0 0 24px rgba(33, 150, 243, 0.8)'
              : flashBorder === 'red'
              ? '0 0 24px rgba(244, 67, 54, 0.8)'
              : 'none',
            transition: 'border 0.2s ease, box-shadow 0.2s ease'
          }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} 
            />
            
            <canvas 
              ref={canvasOverlayRef} 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none',
                transform: 'scaleX(-1)' 
              }} 
            />
            {/* Hidden canvas for image extraction */}
            <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

            {/* ── Visual Floating Success Banner Overlay ── */}
            {successBanner && (
              <Box sx={{
                position: 'absolute',
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                width: '90%',
                maxWidth: 450,
                pointerEvents: 'none',
                animation: 'slideIn 0.3s ease-out'
              }}>
                <Alert 
                  severity={successBanner.type === 'marked' ? 'success' : 'info'} 
                  icon={successBanner.type === 'marked' ? <CheckCircle /> : undefined}
                  sx={{
                    boxShadow: 4,
                    borderRadius: 2,
                    fontSize: '0.95rem',
                    fontWeight: 750,
                    backdropFilter: 'blur(6px)',
                    bgcolor: successBanner.type === 'marked' ? 'rgba(76, 175, 80, 0.95)' : 'rgba(33, 150, 243, 0.95)',
                    color: 'white',
                    '& .MuiAlert-icon': {
                      color: 'white'
                    }
                  }}
                >
                  {successBanner.type === 'marked' 
                    ? `Success! Attendance marked for ${successBanner.name}`
                    : `Attendance already marked for ${successBanner.name}`}
                </Alert>
              </Box>
            )}

            {/* ── Real-time Confidence Score Badge (facemeet-inspired) ── */}
            <Box
              id="score-badge-overlay"
              sx={{
                '--glow-color': scoreColor,
                position: 'absolute',
                bottom: 16,
                right: 16,
                width: 110,
                height: 110,
                borderRadius: '50%',
                border: `4px solid ${scoreColor}`,
                bgcolor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                backdropFilter: 'blur(8px)',
                animation: avgScore > 0 ? 'scorePulse 2s ease-in-out infinite' : 'none',
                transition: 'border-color 0.4s ease',
              } as any}
            >
              <Typography
                sx={{
                  color: scoreColor,
                  fontWeight: 800,
                  fontSize: '1.85rem',
                  lineHeight: 1,
                  fontFamily: '"Inter", "Roboto Mono", monospace',
                  transition: 'color 0.4s ease',
                }}
              >
                {avgScore > 0 ? `${avgScore}%` : '—'}
              </Typography>
              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  mt: 0.4,
                  fontWeight: 600,
                }}
              >
                {scoreLabel}
              </Typography>
            </Box>

            {/* ── Recognized-name pill (visible when someone is recognized) ── */}
            {lastRecognizedName && (
              <Box
                id="recognized-name-pill"
                sx={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  bgcolor: avgScore >= 80
                    ? 'rgba(76, 175, 80, 0.9)'
                    : avgScore >= 50
                    ? 'rgba(255, 193, 7, 0.9)'
                    : 'rgba(244, 67, 54, 0.9)',
                  color: avgScore >= 50 && avgScore < 80 ? '#1a1a1a' : '#fff',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  backdropFilter: 'blur(4px)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                  transition: 'background-color 0.4s ease, opacity 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                {avgScore >= 80 ? '✓' : avgScore >= 50 ? '⟳' : '✗'}{' '}
                {lastRecognizedName}
              </Box>
            )}
          </Box>
          
        </Stack>
      </Card>
      
      <Card sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          <strong>Interactive Kiosk Feedback:</strong> When a face is successfully matched, the terminal will instantly flash green and announce your attendance marking with a voice confirmation.
        </Typography>
      </Card>
    </Box>
  );
}

export default AttendanceCapture;
