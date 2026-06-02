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
  Divider,
  Stepper,
  Step,
  StepLabel,
  Paper,
  MenuItem,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { 
  PersonAdd, 
  CheckCircle, 
  Videocam, 
  CameraAlt, 
  Face, 
  Close, 
  Star,
  Add
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const ANGLES = [
  { id: 'front', label: 'Front', instruction: 'Look straight at the camera with a neutral expression' },
  { id: 'left', label: 'Left Profile', instruction: 'Turn your face slightly to the left' },
  { id: 'right', label: 'Right Profile', instruction: 'Turn your face slightly to the right' },
  { id: 'up', label: 'Looking Up', instruction: 'Tilt your head slightly upward' },
  { id: 'down', label: 'Looking Down', instruction: 'Tilt your head slightly downward' }
];

function AddPerson() {
  const webcamRef = useRef<Webcam>(null);
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [captureMode, setCaptureMode] = useState<'browser' | 'backend'>('browser');
  const [backendStreamError, setBackendStreamError] = useState<string | null>(null);

  // High-accuracy multi-angle states
  const [regMode, setRegMode] = useState<'single' | 'multi'>('multi');
  const [currentStep, setCurrentStep] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);

  // Add Class Dialog states
  const [showAddClassDialog, setShowAddClassDialog] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [addClassLoading, setAddClassLoading] = useState(false);

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    try {
      setAddClassLoading(true);
      const res = await axios.post(`${API_BASE_URL}/api/classes`, {
        class_name: newClassName.trim()
      });
      if (res.data && res.data.status === 'success') {
        const addedClass = newClassName.trim();
        setNewClassName('');
        setShowAddClassDialog(false);
        // Refresh classes and select the new class
        const fetchRes = await axios.get(`${API_BASE_URL}/api/classes`);
        if (fetchRes.data && fetchRes.data.status === 'success') {
          const classList = fetchRes.data.classes || [];
          setClasses(classList);
          setClassName(addedClass);
        }
      } else {
        alert(res.data.message || 'Failed to create class');
      }
    } catch (err: any) {
      console.error('Error creating class:', err);
      alert(err.response?.data?.message || 'Error creating class');
    } finally {
      setAddClassLoading(false);
    }
  };

  // Retrieve threshold from settings
  const savedSettings = localStorage.getItem('attendanceSettings');
  const settings = savedSettings ? JSON.parse(savedSettings) : {};
  const threshold = settings.confidenceThreshold !== undefined ? settings.confidenceThreshold : 0.45;

  // Load dynamic classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/classes`);
        if (res.data && res.data.status === 'success') {
          const classList = res.data.classes || [];
          setClasses(classList);
          if (classList.length > 0) {
            setClassName(classList[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching classes:', err);
      }
    };
    fetchClasses();
  }, []);

  // Release backend camera on unmount to prevent device locking
  useEffect(() => {
    return () => {
      axios.post(`${API_BASE_URL}/api/camera-control/stop`).catch(() => {});
    };
  }, []);

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

  const handleSingleCapture = async () => {
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
          image: imageSrc,
          angle: '',
          class_name: className
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
          name: name.trim(),
          angle: '',
          class_name: className
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

  const handleStepCapture = async () => {
    setIsLoading(true);
    setMessage('');
    setBackendStreamError(null);
    const angleObj = ANGLES[currentStep];

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
          image: imageSrc,
          angle: angleObj.id,
          class_name: className
        });
 
        // Step captured successfully!
        if (currentStep < ANGLES.length - 1) {
          setCurrentStep(prev => prev + 1);
          setMessage(`Successfully captured ${angleObj.label}! Proceed to the next angle.`);
          setIsSuccess(true);
        } else {
          // All steps captured! Now retrain the model.
          setMessage('All angles successfully captured! Retraining face recognition system for maximum accuracy...');
          setIsSuccess(true);
          try {
            await axios.post(`${API_BASE_URL}/api/retrain-model`);
            setMessage(`Congratulations! Successfully registered ${name} in High-Accuracy mode (5 angles)!`);
            setName('');
            setCurrentStep(0);
            setIsRegistering(false);
            playAudio('person_added_successfully.wav');
          } catch (retrainErr) {
            console.error('Retraining failed:', retrainErr);
            setMessage(`Registered all angles for ${name}, but model auto-retraining failed. You can retrain manually in settings.`);
          }
        }
      } catch (error: any) {
        setMessage(error.response?.data?.message || `Failed to detect face for ${angleObj.label}. Please adjust your posture and try capturing again.`);
        setIsSuccess(false);
        playAudio('person_not_detected.wav');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Backend capture mode
      try {
        await axios.post(`${API_BASE_URL}/add-person-backend`, {
          name: name.trim(),
          angle: angleObj.id,
          class_name: className
        });

        // Step captured successfully!
        if (currentStep < ANGLES.length - 1) {
          setCurrentStep(prev => prev + 1);
          setMessage(`Successfully captured ${angleObj.label}! Proceed to the next angle.`);
          setIsSuccess(true);
        } else {
          // All steps captured! Now retrain the model.
          setMessage('All angles successfully captured! Retraining face recognition system for maximum accuracy...');
          setIsSuccess(true);
          try {
            await axios.post(`${API_BASE_URL}/api/retrain-model`);
            setMessage(`Congratulations! Successfully registered ${name} in High-Accuracy mode (5 angles)!`);
            setName('');
            setCurrentStep(0);
            setIsRegistering(false);
            playAudio('person_added_successfully.wav');
          } catch (retrainErr) {
            console.error('Retraining failed:', retrainErr);
            setMessage(`Registered all angles for ${name}, but model auto-retraining failed. You can retrain manually in settings.`);
          }
        }
      } catch (error: any) {
        setMessage(error.response?.data?.message || `Failed to capture ${angleObj.label} using SCAN camera feed. Make sure your face is visible and looking in the correct direction.`);
        setIsSuccess(false);
        playAudio('person_not_detected.wav');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleStartMultiRegistration = () => {
    if (!name.trim()) {
      setMessage('Please enter a name first');
      setIsSuccess(false);
      return;
    }
    setIsRegistering(true);
    setCurrentStep(0);
    setMessage('');
  };

  const handleCancelRegistration = () => {
    setIsRegistering(false);
    setCurrentStep(0);
    setMessage('');
  };

  return (
    <Box sx={{ maxWidth: { xs: '100%', sm: 550, md: 650 }, mx: 'auto' }}>
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
          <TextField
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isRegistering}
            fullWidth
            placeholder="Enter person's name"
            variant="outlined"
          />

          {/* Class Name Input */}
          <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'center' }}>
            <TextField
              select
              label="Class Name"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              disabled={isRegistering}
              fullWidth
              variant="outlined"
            >
              {classes.map((cls) => (
                <MenuItem key={cls} value={cls}>
                  {cls}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title="Add New Class">
              <IconButton 
                color="primary" 
                onClick={() => setShowAddClassDialog(true)}
                disabled={isRegistering}
                sx={{ 
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1.2
                }}
              >
                <Add />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Registration Mode and Camera Source Selection */}
          {!isRegistering && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
              {/* Registration Scheme Selection */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Accuracy Scheme
                </Typography>
                <ToggleButtonGroup
                  value={regMode}
                  exclusive
                  onChange={(e, value) => {
                    if (value !== null) {
                      setRegMode(value);
                      setMessage('');
                    }
                  }}
                  size="small"
                  color="primary"
                >
                  <ToggleButton value="multi" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, fontSize: '0.8rem' }}>
                    <Star fontSize="small" sx={{ color: 'warning.main' }} />
                    5-Angle Scan (High Acc)
                  </ToggleButton>
                  <ToggleButton value="single" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, fontSize: '0.8rem' }}>
                    <Face fontSize="small" />
                    Quick Scan (1 Photo)
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Camera Source Selector */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Camera Source
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
                  size="small"
                  color="primary"
                >
                  <ToggleButton value="browser" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, fontSize: '0.8rem' }}>
                    <Videocam fontSize="small" />
                    Browser Webcam
                  </ToggleButton>
                  <ToggleButton value="backend" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, fontSize: '0.8rem' }}>
                    <CameraAlt fontSize="small" />
                    SCAN Live Feed
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Stack>
          )}

          {/* Guided Step Indicator for High Accuracy Mode */}
          {isRegistering && regMode === 'multi' && (
            <Box sx={{ width: '100%', my: 1 }}>
              <Stepper activeStep={currentStep} alternativeLabel>
                {ANGLES.map((angle) => (
                  <Step key={angle.id}>
                    <StepLabel>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {angle.label}
                      </Typography>
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>

              {/* Pose Instruction Panel */}
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 1.5, 
                  mt: 2, 
                  bgcolor: 'primary.50', 
                  borderColor: 'primary.200', 
                  borderRadius: 2,
                  textAlign: 'center'
                }}
              >
                <Typography variant="subtitle2" color="primary.800" sx={{ fontWeight: 'bold' }}>
                  Step {currentStep + 1} of 5: {ANGLES[currentStep].label} Capture
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  👉 {ANGLES[currentStep].instruction}
                </Typography>
              </Paper>
            </Box>
          )}

          <Divider />

          {/* Camera Viewport */}
          <Box>
            {captureMode === 'browser' ? (
              <Box sx={{ position: 'relative' }}>
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
                  Camera Viewport (Browser)
                </Typography>
                <Box sx={{ 
                  borderRadius: 3, 
                  overflow: 'hidden',
                  border: '2px solid #e0e0e0',
                  maxWidth: { xs: '100%', sm: 400 },
                  mx: 'auto',
                  position: 'relative',
                  boxShadow: 2
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
              <Box sx={{ position: 'relative' }}>
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
                  Camera Viewport (SCAN Live Feed)
                </Typography>
                <Box sx={{ 
                  borderRadius: 3, 
                  overflow: 'hidden',
                  border: '2px solid #e0e0e0',
                  maxWidth: { xs: '100%', sm: 400 },
                  mx: 'auto',
                  position: 'relative',
                  aspectRatio: '4/3',
                  bgcolor: 'black',
                  boxShadow: 2
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

          {/* Action Buttons */}
          <Stack spacing={1.5}>
            {regMode === 'multi' && !isRegistering ? (
              <Button
                variant="contained"
                onClick={handleStartMultiRegistration}
                disabled={!name.trim()}
                startIcon={<Star sx={{ color: 'warning.main' }} />}
                size="large"
                fullWidth
                sx={{ py: 1.5, fontWeight: 'bold' }}
              >
                Start Multi-Angle Registration
              </Button>
            ) : regMode === 'multi' && isRegistering ? (
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  onClick={handleCancelRegistration}
                  startIcon={<Close />}
                  color="error"
                  fullWidth
                  sx={{ py: 1.5 }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleStepCapture}
                  disabled={isLoading}
                  startIcon={isLoading ? <CircularProgress size={20} /> : <CameraAlt />}
                  fullWidth
                  sx={{ py: 1.5, fontWeight: 'bold' }}
                >
                  {isLoading ? 'Processing...' : `Capture ${ANGLES[currentStep].label}`}
                </Button>
              </Stack>
            ) : (
              // Single Photo Registration Mode
              <Button
                variant="contained"
                onClick={handleSingleCapture}
                disabled={isLoading || !name.trim()}
                startIcon={isLoading ? <CircularProgress size={20} /> : <PersonAdd />}
                size="large"
                fullWidth
                sx={{ py: 1.5 }}
              >
                {isLoading ? 'Adding Person...' : 'Add Person (Quick Scan)'}
              </Button>
            )}
          </Stack>
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
           <strong>High Accuracy Tip:</strong> In 5-Angle Scan, the system registers five views of your face.
           This dramatically increases recognition reliability when students approach the camera at slightly different angles or tilts during attendance marking.
        </Typography>
      </Card>
      {/* Dialog for adding new class room */}
      <Dialog 
        open={showAddClassDialog} 
        onClose={() => setShowAddClassDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>Add New Class Room</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Class Name"
            type="text"
            fullWidth
            placeholder="e.g., Class 10-C, Physics-B"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            disabled={addClassLoading}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setShowAddClassDialog(false)} 
            disabled={addClassLoading}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateClass} 
            variant="contained"
            disabled={addClassLoading || !newClassName.trim()}
            sx={{ borderRadius: 2, fontWeight: 'bold' }}
          >
            {addClassLoading ? 'Adding...' : 'Add Class'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AddPerson;
