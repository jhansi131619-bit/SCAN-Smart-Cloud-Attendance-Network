import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Slider,
  TextField,
  Button,
  Alert,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Snackbar
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save,
  VolumeUp,
  Security,
  Timer,
  Refresh,
  Backup,
  RestoreFromTrash,
  Info,
  CheckCircle,
  Warning,
  CloudSync,
  Storage,
  Notifications,
  Palette
} from '@mui/icons-material';
import { API_BASE_URL, AUDIO_BASE_URL } from '../config';
import axios from 'axios';

interface SystemSettings {
  autoRecognition: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  confidenceThreshold: number;
  attendanceCooldown: number;
  autoRefresh: boolean;
  refreshInterval: number;
  notifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  retryAttempts: number;
  debugMode: boolean;
}

interface SystemStatus {
  backendConnected: boolean;
  modelTrained: boolean;
  knownFacesCount: number;
  lastBackup: string;
  uptime: string;
}

function Settings() {
  const [settings, setSettings] = useState<SystemSettings>({
    autoRecognition: true,
    soundEnabled: true,
    soundVolume: 80,
    confidenceThreshold: 0.65,
    attendanceCooldown: 60,
    autoRefresh: true,
    refreshInterval: 30,
    notifications: true,
    theme: 'light',
    language: 'en',
    retryAttempts: 3,
    debugMode: false
  });
  
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    backendConnected: false,
    modelTrained: false,
    knownFacesCount: 0,
    lastBackup: 'Never',
    uptime: '0m'
  });
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [testAudio, setTestAudio] = useState(false);
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [backupStatus, setBackupStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
  const [retrainStatus, setRetrainStatus] = useState<'idle' | 'training' | 'success' | 'error'>('idle');
  const [showNotification, setShowNotification] = useState<{open: boolean, message: string, severity: 'success' | 'error' | 'info'}>({
    open: false,
    message: '',
    severity: 'info'
  });

  useEffect(() => {
    loadSettings();
    checkSystemStatus();
    
    // Set up periodic status checks
    const interval = setInterval(checkSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSettings = () => {
    try {
      const savedSettings = localStorage.getItem('attendanceSettings');
      if (savedSettings) {
        setSettings({ ...settings, ...JSON.parse(savedSettings) });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      showNotificationMessage('Failed to load saved settings', 'error');
    }
  };

  const checkSystemStatus = async () => {
    try {
      // Check backend connection
      const healthResponse = await axios.get(`${API_BASE_URL}/health`);
      
      // Get model status
      const modelResponse = await axios.get(`${API_BASE_URL}/model-status`);
      
      setSystemStatus({
        backendConnected: healthResponse.status === 200,
        modelTrained: modelResponse.data.is_trained || false,
        knownFacesCount: modelResponse.data.known_faces_count || 0,
        lastBackup: localStorage.getItem('lastBackup') || 'Never',
        uptime: 'Connected'
      });
    } catch (error) {
      setSystemStatus(prev => ({
        ...prev,
        backendConnected: false,
        uptime: 'Disconnected'
      }));
    }
  };

  const saveSettings = async () => {
    try {
      setSaveStatus('saving');
      localStorage.setItem('attendanceSettings', JSON.stringify(settings));
      
      // Apply settings to the system (simulate API call)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaveStatus('success');
      showNotificationMessage('Settings saved successfully!', 'success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      setSaveStatus('error');
      showNotificationMessage('Failed to save settings', 'error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const resetSettings = () => {
    const defaultSettings: SystemSettings = {
      autoRecognition: true,
      soundEnabled: true,
      soundVolume: 80,
      confidenceThreshold: 0.65,
      attendanceCooldown: 60,
      autoRefresh: true,
      refreshInterval: 30,
      notifications: true,
      theme: 'light',
      language: 'en',
      retryAttempts: 3,
      debugMode: false
    };
    setSettings(defaultSettings);
    showNotificationMessage('Settings reset to defaults', 'info');
  };

  const testAudioFunction = () => {
    setTestAudio(true);
    try {
      const audio = new Audio(`${AUDIO_BASE_URL}/attendance_marked.wav`);
      audio.volume = settings.soundVolume / 100;
      audio.play().catch(console.error);
      showNotificationMessage('Audio test played', 'success');
    } catch (error) {
      console.error('Failed to play test audio:', error);
      showNotificationMessage('Audio test failed', 'error');
    }
    setTimeout(() => setTestAudio(false), 2000);
  };

  const createBackup = async () => {
    try {
      setBackupStatus('creating');
      const response = await axios.post(`${API_BASE_URL}/api/backup`);
      
      if (response.data.success) {
        const backupTime = new Date().toISOString();
        localStorage.setItem('lastBackup', backupTime);
        setSystemStatus(prev => ({ ...prev, lastBackup: backupTime }));
        setBackupStatus('success');
        showNotificationMessage('Backup created successfully', 'success');
      } else {
        throw new Error(response.data.message || 'Backup failed');
      }
    } catch (error: any) {
      setBackupStatus('error');
      showNotificationMessage(error.response?.data?.message || 'Backup failed', 'error');
    }
    
    setTimeout(() => setBackupStatus('idle'), 3000);
  };

  const retrainModel = async () => {
    try {
      setRetrainStatus('training');
      const response = await axios.post(`${API_BASE_URL}/api/retrain-model`);
      
      if (response.data.success) {
        setRetrainStatus('success');
        showNotificationMessage('Model retrained successfully', 'success');
        checkSystemStatus(); // Refresh system status
      } else {
        throw new Error(response.data.message || 'Retraining failed');
      }
    } catch (error: any) {
      setRetrainStatus('error');
      showNotificationMessage(error.response?.data?.message || 'Model retraining failed', 'error');
    }
    
    setTimeout(() => setRetrainStatus('idle'), 3000);
  };

  const showNotificationMessage = (message: string, severity: 'success' | 'error' | 'info') => {
    setShowNotification({ open: true, message, severity });
  };

  const handleSettingChange = (key: keyof SystemSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <SettingsIcon />
        System Settings & Configuration
      </Typography>

      {/* System Status Card */}
      <Card sx={{ mb: 3, bgcolor: systemStatus.backendConnected ? 'success.50' : 'error.50' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudSync color={systemStatus.backendConnected ? 'success' : 'error'} />
            System Status
            <Tooltip title="Refresh status">
              <IconButton size="small" onClick={checkSystemStatus}>
                <Refresh />
              </IconButton>
            </Tooltip>
          </Typography>
          
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 2 
          }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Backend</Typography>
              <Chip 
                label={systemStatus.backendConnected ? 'Connected' : 'Disconnected'}
                color={systemStatus.backendConnected ? 'success' : 'error'}
                size="small"
              />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Model</Typography>
              <Chip 
                label={systemStatus.modelTrained ? 'Trained' : 'Not Trained'}
                color={systemStatus.modelTrained ? 'success' : 'warning'}
                size="small"
              />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Known Faces</Typography>
              <Typography variant="h6">{systemStatus.knownFacesCount}</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <Typography variant="body1">{systemStatus.uptime}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {saveStatus === 'success' && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}

      {saveStatus === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to save settings. Please try again.
        </Alert>
      )}

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 3 
      }}>
        {/* Recognition Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Security color="primary" />
              Recognition Settings
            </Typography>
            <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.autoRecognition}
                      onChange={(e) => handleSettingChange('autoRecognition', e.target.checked)}
                    />
                  }
                  label="Auto Recognition Mode"
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: -2, ml: 4 }}>
                  Automatically detect and mark attendance
                </Typography>

                <Box>
                  <Typography gutterBottom>
                    Confidence Threshold: {(settings.confidenceThreshold * 100).toFixed(0)}%
                  </Typography>
                  <Slider
                    value={settings.confidenceThreshold * 100}
                    onChange={(_, value) => handleSettingChange('confidenceThreshold', (value as number) / 100)}
                    min={50}
                    max={95}
                    step={5}
                    marks
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value}%`}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Minimum confidence required for recognition
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  label="Attendance Cooldown (seconds)"
                  type="number"
                  value={settings.attendanceCooldown}
                  onChange={(e) => handleSettingChange('attendanceCooldown', parseInt(e.target.value))}
                  helperText="Minimum time between attendance marks for same person"
                />

                <TextField
                  fullWidth
                  label="Retry Attempts"
                  type="number"
                  value={settings.retryAttempts}
                  onChange={(e) => handleSettingChange('retryAttempts', parseInt(e.target.value))}
                  inputProps={{ min: 1, max: 10 }}
                  helperText="Number of recognition retry attempts"
                />
              </Box>
            </CardContent>
          </Card>

        {/* Audio & Interface Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <VolumeUp color="primary" />
                Audio & Interface
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.soundEnabled}
                      onChange={(e) => handleSettingChange('soundEnabled', e.target.checked)}
                    />
                  }
                  label="Enable Sound Notifications"
                />

                <Box>
                  <Typography gutterBottom>
                    Volume: {settings.soundVolume}%
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Slider
                      value={settings.soundVolume}
                      onChange={(_, value) => handleSettingChange('soundVolume', value as number)}
                      min={0}
                      max={100}
                      step={10}
                      disabled={!settings.soundEnabled}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={testAudioFunction}
                      disabled={!settings.soundEnabled || testAudio}
                    >
                      {testAudio ? 'Testing...' : 'Test'}
                    </Button>
                  </Box>
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications}
                      onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                    />
                  }
                  label="Browser Notifications"
                />

                <FormControl fullWidth>
                  <InputLabel>Theme</InputLabel>
                  <Select
                    value={settings.theme}
                    label="Theme"
                    onChange={(e) => handleSettingChange('theme', e.target.value)}
                  >
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="auto">Auto</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={settings.language}
                    label="Language"
                    onChange={(e) => handleSettingChange('language', e.target.value)}
                  >
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="es">Spanish</MenuItem>
                    <MenuItem value="fr">French</MenuItem>
                    <MenuItem value="de">German</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </CardContent>
          </Card>

        {/* System Settings */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Timer color="primary" />
                System Behavior
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.autoRefresh}
                      onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                    />
                  }
                  label="Auto Refresh Data"
                />

                <TextField
                  fullWidth
                  label="Refresh Interval (seconds)"
                  type="number"
                  value={settings.refreshInterval}
                  onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                  disabled={!settings.autoRefresh}
                  inputProps={{ min: 10, max: 300 }}
                  helperText="How often to refresh data automatically"
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.debugMode}
                      onChange={(e) => handleSettingChange('debugMode', e.target.checked)}
                    />
                  }
                  label="Debug Mode"
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: -2, ml: 4 }}>
                  Show detailed logs and error information
                </Typography>
              </Box>
            </CardContent>
          </Card>

        {/* System Actions */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Storage color="primary" />
                System Actions
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={createBackup}
                  disabled={backupStatus === 'creating'}
                  startIcon={<Backup />}
                  color={backupStatus === 'success' ? 'success' : backupStatus === 'error' ? 'error' : 'primary'}
                >
                  {backupStatus === 'creating' ? 'Creating Backup...' : 
                   backupStatus === 'success' ? 'Backup Created!' :
                   backupStatus === 'error' ? 'Backup Failed' : 'Create Data Backup'}
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  onClick={retrainModel}
                  disabled={retrainStatus === 'training'}
                  startIcon={<Refresh />}
                  color={retrainStatus === 'success' ? 'success' : retrainStatus === 'error' ? 'error' : 'primary'}
                >
                  {retrainStatus === 'training' ? 'Retraining Model...' : 
                   retrainStatus === 'success' ? 'Model Retrained!' :
                   retrainStatus === 'error' ? 'Retraining Failed' : 'Retrain Face Model'}
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => setShowSystemInfo(true)}
                  startIcon={<Info />}
                >
                  System Information
                </Button>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Last backup: {systemStatus.lastBackup !== 'Never' 
                    ? new Date(systemStatus.lastBackup).toLocaleString() 
                    : 'Never'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
      </Box>

      {/* Current Configuration Summary */}
      <Card sx={{ bgcolor: 'grey.50', mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Current Configuration Summary
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip
              label={`Auto Recognition: ${settings.autoRecognition ? 'ON' : 'OFF'}`}
              color={settings.autoRecognition ? 'success' : 'default'}
              size="small"
            />
            <Chip
              label={`Sound: ${settings.soundEnabled ? `${settings.soundVolume}%` : 'OFF'}`}
              color={settings.soundEnabled ? 'success' : 'default'}
              size="small"
            />
            <Chip
              label={`Confidence: ${(settings.confidenceThreshold * 100).toFixed(0)}%`}
              color="primary"
              size="small"
            />
            <Chip
              label={`Cooldown: ${settings.attendanceCooldown}s`}
              color="primary"
              size="small"
            />
            <Chip
              label={`Auto Refresh: ${settings.autoRefresh ? `${settings.refreshInterval}s` : 'OFF'}`}
              color={settings.autoRefresh ? 'success' : 'default'}
              size="small"
            />
            <Chip
              label={`Theme: ${settings.theme}`}
              color="secondary"
              size="small"
            />
            <Chip
              label={`Debug: ${settings.debugMode ? 'ON' : 'OFF'}`}
              color={settings.debugMode ? 'warning' : 'default'}
              size="small"
            />
          </Box>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 4, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="large"
          onClick={saveSettings}
          disabled={saveStatus === 'saving'}
          startIcon={<Save />}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
        </Button>
        
        <Button
          variant="outlined"
          size="large"
          onClick={resetSettings}
          disabled={saveStatus === 'saving'}
          startIcon={<RestoreFromTrash />}
        >
          Reset to Defaults
        </Button>
      </Box>

      {/* System Information Dialog */}
      <Dialog
        open={showSystemInfo}
        onClose={() => setShowSystemInfo(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          🔧 System Information
        </DialogTitle>
        <DialogContent>
          <List>
            <ListItem>
              <ListItemIcon>
                <CheckCircle color={systemStatus.backendConnected ? 'success' : 'error'} />
              </ListItemIcon>
              <ListItemText
                primary="Backend Connection"
                secondary={systemStatus.backendConnected ? 'Connected and responsive' : 'Disconnected or unavailable'}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Warning color={systemStatus.modelTrained ? 'success' : 'warning'} />
              </ListItemIcon>
              <ListItemText
                primary="Face Recognition Model"
                secondary={systemStatus.modelTrained ? `Trained with ${systemStatus.knownFacesCount} faces` : 'Not trained or no faces available'}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Notifications color={settings.notifications ? 'primary' : 'disabled'} />
              </ListItemIcon>
              <ListItemText
                primary="Browser Notifications"
                secondary={settings.notifications ? 'Enabled' : 'Disabled'}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Storage />
              </ListItemIcon>
              <ListItemText
                primary="Local Storage"
                secondary={`Settings and configuration stored locally`}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <Palette />
              </ListItemIcon>
              <ListItemText
                primary="Current Theme"
                secondary={`${settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)} theme active`}
              />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSystemInfo(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={showNotification.open}
        autoHideDuration={4000}
        onClose={() => setShowNotification(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          severity={showNotification.severity} 
          onClose={() => setShowNotification(prev => ({ ...prev, open: false }))}
        >
          {showNotification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Settings;
