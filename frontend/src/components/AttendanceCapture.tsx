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

/** Pulsing glow keyframes injected once via <style> tag */
const GLOW_KEYFRAMES = `
@keyframes scorePulse {
  0%, 100% { box-shadow: 0 0 12px var(--glow-color); }
  50%      { box-shadow: 0 0 28px var(--glow-color), 0 0 48px var(--glow-color); }
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

  // Retrieve threshold from settings
  const savedSettings = localStorage.getItem('attendanceSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {};
  const threshold = settings.confidenceThreshold !== undefined ? settings.confidenceThreshold : 0.65;

  // Check backend connection
  useEffect(() => {
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
            if (face.liveness === 'passed') strokeColor = '#4caf50'; // Green
            else if (face.liveness === 'verifying') strokeColor = '#ff9800'; // Orange
            
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

    // Run interval every 1 second
    intervalRef.current = setInterval(captureAndSend, 1000);

    return () => {
      // Cleanup interval and tracks
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [threshold]);

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
          
          {/* ── Video container with score badge overlay ── */}
          <Box sx={{ position: 'relative', width: '100%', maxWidth: 640, borderRadius: 2, overflow: 'hidden', border: '2px solid #e0e0e0' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }} 
            />
            {/* Note: The overlay coordinates may need transform scaling if video is mirrored. 
                For MVP, we just place it directly. If mirrored video creates mismatch, 
                we'll adjust CSS transform scaleX(-1) on canvas too. */}
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
          <strong>DNN Real-Time Processing:</strong> The camera feed is processed client-side and frames are analyzed securely by the DNN model. Look straight at the camera to mark your attendance.
        </Typography>
      </Card>
    </Box>
  );
}

export default AttendanceCapture;
