import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Card,
  Stack,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Divider
} from '@mui/material';
import { PersonAdd, CheckCircle, Videocam, CameraAlt } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function AddPerson() {
  const webcamRef = useRef<Webcam>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [captureMode, setCaptureMode] = useState<'browser' | 'backend'>('backend');
  const [backendStreamError, setBackendStreamError] = useState<string | null>(null);

  // Retrieve threshold from settings
  const savedSettings = localStorage.getItem('attendanceSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {};
  const threshold = settings.confidenceThreshold !== undefined ? settings.confidenceThreshold : 0.65;

  // Release backend camera on unmount to prevent device locking
  useEffect(() => {
    return () => {
      axios.post(`${API_BASE_URL}/api/camera-control/stop`).catch(() => {});
    };
  }, []);

  const playAudio = useCallback((audioFile: string) => {
    try {
      const audio = new Audio(`${API_BASE_URL}/audio/${audioFile}`);
      audio.volume = 0.8;
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err);
        // Fallback to text-to-speech if audio fails
        if ('speechSynthesis' in window) {
          let text = '';
          switch(audioFile) {
            case 'person_added_successfully.wav':
              text = 'Person added successfully';
              break;
            case 'person_not_detected.wav':
              text = 'Person not detected';
              break;
            default:
              text = 'Operation completed';
          }
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.volume = 0.8;
          speechSynthesis.speak(utterance);
        }
      });
    } catch (err) {
      console.warn('Audio creation failed:', err);
    }
  }, []);

  const handleAddPerson = async () => {
    if (!name.trim()) {
      setMessage('Please enter a name');
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage('');
    setBackendStreamError(null);

    if (captureMode === 'browser') {
      const imageSrc = webcamRef.current?.getScreenshot();
      if (!imageSrc) {
        setMessage('Please make sure camera is working, or switch to SCAN Live Feed');
        setIsSuccess(false);
        setIsLoading(false);
        return;
      }

      try {
        await axios.post(`${API_BASE_URL}/add-person`, {
          name: name.trim(),
          image: imageSrc
        });

        setMessage(`Successfully added ${name} to the system!`);
        setIsSuccess(true);
        setName('');
        playAudio('person_added_successfully.wav');
      } catch (error: any) {
        setMessage(error.response?.data?.message || 'Failed to add person. Try switching to SCAN Live Feed if face detection fails.');
        setIsSuccess(false);
        playAudio('person_not_detected.wav');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Backend capture mode
      try {
        await axios.post(`${API_BASE_URL}/add-person-backend`, {
          name: name.trim()
        });

        setMessage(`Successfully added ${name} to the system using SCAN camera!`);
        setIsSuccess(true);
        setName('');
        playAudio('person_added_successfully.wav');
      } catch (error: any) {
        setMessage(error.response?.data?.message || 'Failed to add person using SCAN camera feed. Make sure you look directly at the camera.');
        setIsSuccess(false);
        playAudio('person_not_detected.wav');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Box sx={{ maxWidth: { xs: '100%', sm: 500, md: 600 }, mx: 'auto' }}>
      <Typography 
        variant="h5" 
        gutterBottom 
        sx={{ 
          textAlign: 'center', 
          mb: { xs: 2, sm: 3 }, 
          fontWeight: 600,
          fontSize: { xs: '1.25rem', sm: '1.5rem' }
        }}
      >
         Add New Person
      </Typography>

      <Card sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={{ xs: 2, sm: 3 }}>
          {/* Name Input */}
          <TextField
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder="Enter person's name"
            variant="outlined"
          />

          {/* Photo Source Selector */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Camera Source Selector
            </Typography>
            <ToggleButtonGroup
              value={captureMode}
              exclusive
              onChange={(e, value) => {
                if (value !== null) {
                  setCaptureMode(value);
                  setMessage('');
                  if (value === 'browser') {
                    axios.post(`${API_BASE_URL}/api/camera-control/stop`).catch(() => {});
                  }
                }
              }}
              aria-label="camera source"
              size="small"
              color="primary"
            >
              <ToggleButton value="browser" sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}>
                <Videocam fontSize="small" />
                Browser Webcam
              </ToggleButton>
              <ToggleButton value="backend" sx={{ px: 2, py: 1, display: 'flex', gap: 1 }}>
                <CameraAlt fontSize="small" />
                SCAN Live Feed
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          {/* Camera Viewport */}
          <Box>
            {captureMode === 'browser' ? (
              <Box>
                <Typography 
                  variant="subtitle1" 
                  gutterBottom 
                  sx={{ 
                    fontWeight: 500,
                    fontSize: { xs: '0.9rem', sm: '1rem' },
                    textAlign: 'center',
                    mb: 1.5
                  }}
                >
                   Take Photo (Browser Camera)
                </Typography>
                <Box sx={{ 
                  borderRadius: 2, 
                  overflow: 'hidden',
                  border: '2px solid #e0e0e0',
                  maxWidth: { xs: '100%', sm: 400 },
                  mx: 'auto',
                  position: 'relative'
                }}>
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width="100%"
                    style={{ display: 'block' }}
                    videoConstraints={{
                      width: { ideal: 640 },
                      height: { ideal: 480 },
                      facingMode: "user"
                    }}
                    onUserMediaError={() => {
                      setMessage("Browser webcam failed to load. The camera is likely locked by the backend stream. Please select 'SCAN Live Feed' above!");
                      setIsSuccess(false);
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography 
                  variant="subtitle1" 
                  gutterBottom 
                  sx={{ 
                    fontWeight: 500,
                    fontSize: { xs: '0.9rem', sm: '1rem' },
                    textAlign: 'center',
                    mb: 1.5
                  }}
                >
                   SCAN Live Camera Feed (Processed)
                </Typography>
                <Box sx={{ 
                  borderRadius: 2, 
                  overflow: 'hidden',
                  border: '2px solid #e0e0e0',
                  maxWidth: { xs: '100%', sm: 400 },
                  mx: 'auto',
                  position: 'relative',
                  aspectRatio: '4/3',
                  bgcolor: 'black'
                }}>
                  <img
                    src={`${API_BASE_URL}/video_feed?threshold=${threshold}&t=${Date.now()}`}
                    alt="SCAN Live Feed"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={() => {
                      setBackendStreamError("Failed to connect to SCAN video stream. Verify that your backend is running.");
                    }}
                  />
                  <Box sx={{ 
                    position: 'absolute', 
                    top: 10, 
                    right: 10, 
                    bgcolor: 'error.main', 
                    color: 'white', 
                    px: 1, 
                    py: 0.5, 
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    zIndex: 10
                  }}>
                    LIVE
                  </Box>
                  {backendStreamError && (
                    <Box sx={{ 
                      position: 'absolute', 
                      inset: 0, 
                      bgcolor: 'rgba(0,0,0,0.85)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: 'white',
                      p: 2,
                      textAlign: 'center',
                      zIndex: 9
                    }}>
                      <Typography variant="body2">{backendStreamError}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {/* Add Button */}
          <Button
            variant="contained"
            onClick={handleAddPerson}
            disabled={isLoading || !name.trim()}
            startIcon={isLoading ? <CircularProgress size={20} /> : <PersonAdd />}
            size="large"
            fullWidth
            sx={{ py: 1.5 }}
          >
            {isLoading ? 'Adding Person...' : 'Add Person'}
          </Button>
        </Stack>
      </Card>

      {/* Result Message */}
      {message && (
        <Alert 
          severity={isSuccess ? "success" : "error"}
          icon={isSuccess ? <CheckCircle /> : undefined}
          sx={{ mt: 2 }}
          onClose={() => setMessage('')}
        >
          <Typography sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            {message}
          </Typography>
        </Alert>
      )}

      {/* Instructions */}
      <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'grey.50', mt: 2 }}>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            textAlign: 'center',
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            lineHeight: 1.4
          }}
        >
           <strong>Tips:</strong> Make sure your face is clearly visible. If you select 
           <strong> SCAN Live Feed</strong>, the photo is captured directly from the camera 
           running in the backend. Look straight at the physical camera lens!
        </Typography>
      </Card>
    </Box>
  );
}

export default AddPerson;
