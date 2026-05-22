import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Tabs,
  Tab,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Paper,
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress
} from '@mui/material';
import { 
  CameraAlt, 
  PersonAdd, 
  People,
  List, 
  Assessment,
  Settings as SettingsIcon,
  Notifications,
  MoreVert,
  Info,
  Help,
  Feedback,
  WifiOff,
  CheckCircle
} from '@mui/icons-material';
import AttendanceCapture from './components/AttendanceCapture';
import AddPerson from './components/AddPerson';
import KnownFaces from './components/KnownFaces';
import AttendanceView from './components/AttendanceView';
import Reports from './components/Reports';
import Settings from './components/Settings';
import axios from 'axios';
import { API_BASE_URL } from './config';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#4caf50',
    },
    background: {
      default: '#f8fafc',
    },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", sans-serif',
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          paddingLeft: 8,
          paddingRight: 8,
          '@media (min-width: 600px)': {
            paddingLeft: 16,
            paddingRight: 16,
          },
        },
      },
    },
  },
});

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1, sm: 2, md: 3 } }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState(3); // Mock notification count
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [lastActivity, setLastActivity] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkConnection();
    
    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkConnection = async () => {
    try {
      setConnectionStatus('checking');
      const response = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 5000 });
      if (response.status === 200) {
        setConnectionStatus('connected');
        if (showConnectionAlert) {
          setShowConnectionAlert(false);
          showNotification('Connection restored!', 'success');
        }
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      if (!showConnectionAlert) {
        setShowConnectionAlert(true);
        showNotification('Backend connection lost', 'error');
      }
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Face Attendance System', {
        body: message,
        icon: '/favicon.ico'
      });
    }
    
    setLastActivity(`${new Date().toLocaleTimeString()}: ${message}`);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setIsLoading(true);
    
    // Release the backend camera immediately on any tab navigation to prevent hardware conflicts
    axios.post(`${API_BASE_URL}/api/camera-control/stop`).catch(err => {
      console.warn('Failed to stop camera on navigation:', err);
    });
    
    // Simulate loading delay for better UX
    setTimeout(() => setIsLoading(false), 300);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAbout = () => {
    setShowAboutDialog(true);
    handleMenuClose();
  };

  const handleHelp = () => {
    window.open('https://github.com/kartikeyg0104/attendance/blob/main/README.md', '_blank');
    handleMenuClose();
  };

  const handleFeedback = () => {
    window.open('mailto:feedback@attendance-system.com?subject=Feedback&body=Please share your feedback...', '_blank');
    handleMenuClose();
  };

  const tabLabels = [
    { icon: <CameraAlt />, label: 'Mark Attendance', shortLabel: 'Attendance' },
    { icon: <PersonAdd />, label: 'Add Person', shortLabel: 'Add' },
    { icon: <People />, label: 'Manage People', shortLabel: 'Manage' },
    { icon: <List />, label: 'View Records', shortLabel: 'Records' },
    { icon: <Assessment />, label: 'Reports', shortLabel: 'Reports' },
    { icon: <SettingsIcon />, label: 'Settings', shortLabel: 'Settings' }
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" elevation={0} sx={{ bgcolor: 'white', color: 'text.primary' }}>
          <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flex: 1 }}>
              <Box
                sx={{
                  width: { xs: 32, sm: 40 },
                  height: { xs: 32, sm: 40 },
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CameraAlt sx={{ color: 'white', fontSize: { xs: 18, sm: 24 } }} />
              </Box>
              <Typography 
                variant="h6" 
                component="div" 
                sx={{ 
                  fontWeight: 600,
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  display: { xs: 'none', sm: 'block' }
                }}
              >
                SCAN: Smart Cloud Attendance Network
              </Typography>
              <Typography 
                variant="h6" 
                component="div" 
                sx={{ 
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  display: { xs: 'block', sm: 'none' }
                }}
              >
                SCAN
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
              <Tooltip title="Notifications">
                <IconButton 
                  color="inherit" 
                  size={window.innerWidth < 600 ? 'small' : 'medium'}
                  onClick={() => setNotifications(0)}
                >
                  <Badge badgeContent={notifications} color="error">
                    <Notifications />
                  </Badge>
                </IconButton>
              </Tooltip>
              
              <Tooltip title={`Backend: ${connectionStatus}`}>
                <IconButton 
                  color="inherit" 
                  size={window.innerWidth < 600 ? 'small' : 'medium'}
                  onClick={checkConnection}
                >
                  {connectionStatus === 'connected' ? (
                    <CheckCircle color="success" />
                  ) : connectionStatus === 'disconnected' ? (
                    <WifiOff color="error" />
                  ) : (
                    <Notifications />
                  )}
                </IconButton>
              </Tooltip>
              
              <Tooltip title="More options">
                <IconButton 
                  color="inherit" 
                  onClick={handleMenuClick}
                  size={window.innerWidth < 600 ? 'small' : 'medium'}
                >
                  <MoreVert />
                </IconButton>
              </Tooltip>
              
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
              >
                <MenuItem onClick={handleAbout}>
                  <Info sx={{ mr: 1 }} />
                  About
                </MenuItem>
                <MenuItem onClick={handleHelp}>
                  <Help sx={{ mr: 1 }} />
                  Help
                </MenuItem>
                <MenuItem onClick={handleFeedback}>
                  <Feedback sx={{ mr: 1 }} />
                  Feedback
                </MenuItem>
              </Menu>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: { xs: 1, sm: 2, md: 3 } }}>
          <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{
                  '& .MuiTab-root': {
                    fontWeight: 500,
                    textTransform: 'none',
                    fontSize: { xs: '0.75rem', sm: '0.875rem', md: '0.9rem' },
                    py: { xs: 1, sm: 2 },
                    minHeight: { xs: 48, sm: 60 },
                    minWidth: { xs: 80, sm: 120 },
                    '& .MuiTab-iconWrapper': {
                      marginBottom: { xs: '2px', sm: '4px' },
                    },
                  },
                  '& .MuiTabs-scrollButtons': {
                    '&.Mui-disabled': {
                      opacity: 0.3,
                    },
                  },
                }}
              >
                {tabLabels.map((tab, index) => (
                  <Tab 
                    key={index} 
                    icon={tab.icon} 
                    label={
                      <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                        {tab.label}
                      </Box>
                    }
                    aria-label={tab.label}
                  />
                ))}
              </Tabs>
            </Box>

            {isLoading && <LinearProgress sx={{ width: '100%', position: 'absolute', bottom: 0 }} />}

            <TabPanel value={tabValue} index={0}>
              <AttendanceCapture />
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              <AddPerson />
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              <KnownFaces />
            </TabPanel>
            <TabPanel value={tabValue} index={3}>
              <AttendanceView />
            </TabPanel>
            <TabPanel value={tabValue} index={4}>
              <Reports />
            </TabPanel>
            <TabPanel value={tabValue} index={5}>
              <Settings />
            </TabPanel>
          </Paper>
        </Container>

        {/* Connection Alert */}
        <Snackbar
          open={showConnectionAlert}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert 
            severity="warning" 
            onClose={() => setShowConnectionAlert(false)}
            action={
              <Button color="inherit" size="small" onClick={checkConnection}>
                Retry
              </Button>
            }
          >
            Backend connection lost. Some features may not work properly.
          </Alert>
        </Snackbar>

        {/* About Dialog */}
        <Dialog
          open={showAboutDialog}
          onClose={() => setShowAboutDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            🏛️ SCAN: Smart Cloud Attendance Network
          </DialogTitle>
          <DialogContent>
            <Typography paragraph>
              A premium, high-performance face recognition attendance platform with real-time server-side MJPEG video streaming and MongoDB Atlas cloud synchronization.
            </Typography>
            <Typography paragraph>
              <strong>Features:</strong>
            </Typography>
            <ul>
              <li>High-compatibility DirectShow camera capture</li>
              <li>Automated attendance marking via cloud database</li>
              <li>Real-time MJPEG stream with facial boundaries overlay</li>
              <li>Sleek, fluid user dashboard</li>
              <li>Optimistic daily duplicate prevention checks</li>
            </ul>
            <Typography paragraph>
              <strong>Version:</strong> 3.0.0 (SCAN Rebrand)<br />
              <strong>Last Activity:</strong> {lastActivity || 'None'}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowAboutDialog(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
