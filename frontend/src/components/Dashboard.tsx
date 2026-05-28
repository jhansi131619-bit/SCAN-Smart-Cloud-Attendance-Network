import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Avatar,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Divider,
  Paper,
  Stack,
  Tooltip
} from '@mui/material';
import {
  People,
  CheckCircle,
  Settings as SettingsIcon,
  Refresh,
  Backup,
  GetApp,
  Security,
  Today,
  BarChart,
  Videocam,
  AccessTime,
  Star
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface DashboardProps {
  role: 'teacher' | 'student';
  user: { name: string; role: 'teacher' | 'student' } | null;
  setTabValue: (value: number) => void;
}

interface TeacherStats {
  totalRecords: number;
  uniquePeople: number;
  todayAttendance: number;
  averageConfidence: number;
  knownNames: string[];
}

export const Dashboard: React.FC<DashboardProps> = ({ role, user, setTabValue }) => {
  const [loading, setLoading] = useState(true);
  const [retrainLoading, setRetrainLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [teacherStats, setTeacherStats] = useState<TeacherStats>({
    totalRecords: 0,
    uniquePeople: 0,
    todayAttendance: 0,
    averageConfidence: 0,
    knownNames: []
  });
  const [studentRecords, setStudentRecords] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [role, user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (role === 'teacher') {
        const statsRes = await axios.get(`${API_BASE_URL}/api/statistics`);
        const modelRes = await axios.get(`${API_BASE_URL}/model-status`);
        
        setTeacherStats({
          totalRecords: statsRes.data.total_records || 0,
          uniquePeople: statsRes.data.unique_people || 0,
          todayAttendance: statsRes.data.today_attendance || 0,
          averageConfidence: statsRes.data.average_confidence || 0,
          knownNames: modelRes.data.known_names || []
        });
      } else if (role === 'student' && user) {
        const recordsRes = await axios.get(`${API_BASE_URL}/api/attendance`);
        const allRecords = recordsRes.data.records || [];
        const filtered = allRecords.filter((r: any) => r.name.toLowerCase() === user.name.toLowerCase());
        setStudentRecords(filtered);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetrain = async () => {
    try {
      setRetrainLoading(true);
      await axios.post(`${API_BASE_URL}/api/retrain-model`);
      fetchData();
    } catch (err) {
      console.error('Retraining failed:', err);
    } finally {
      setRetrainLoading(false);
    }
  };

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      await axios.post(`${API_BASE_URL}/api/backup`);
    } catch (err) {
      console.error('Backup failed:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/download-attendance`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_records_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Student specific computations
  const studentStats = useMemo(() => {
    if (studentRecords.length === 0) {
      return { percentage: 0, presentDays: 0, lastMarked: 'N/A' };
    }
    
    // Assume a school month consists of 20 typical school days for calculation rate
    const schoolDays = 20; 
    const presentDays = studentRecords.length;
    const rawPercent = (presentDays / schoolDays) * 100;
    const percentage = Math.min(100, parseFloat(rawPercent.toFixed(1)));
    
    // Get last marked time
    const sorted = [...studentRecords].sort((a, b) => {
      return new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime();
    });
    
    const lastMarked = sorted[0] ? `${sorted[0].date} at ${sorted[0].time}` : 'N/A';

    return { percentage, presentDays, lastMarked };
  }, [studentRecords]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
        <CircularProgress size={50} />
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>Loading your dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Welcome Banner */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 4 },
          mb: 3,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
          color: 'white',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' }, 
          justifyContent: 'space-between', 
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: 3 
        }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px' }}>
              Welcome, {role === 'teacher' ? 'Teacher' : user?.name}! 🌟
            </Typography>
            <Typography variant="subtitle1" sx={{ opacity: 0.85, fontWeight: 400 }}>
              {role === 'teacher' 
                ? 'Welcome back to the SCAN Admin Command Center. Manage student registrations, models, and records.'
                : 'Welcome to your SCAN self-service portal. Keep track of your attendance progress and register new angles.'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Chip 
              icon={<Security sx={{ color: 'white !important' }} />}
              label={role === 'teacher' ? 'Admin Portal' : 'Student Access'} 
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.2)', 
                color: 'white', 
                fontWeight: 'bold', 
                border: '1px solid rgba(255, 255, 255, 0.4)',
                px: 1,
                py: 2
              }}
            />
          </Box>
        </Box>
      </Paper>

      {/* --- TEACHER DASHBOARD --- */}
      {role === 'teacher' && (
        <Box>
          {/* Key Metric Cards */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, 
            gap: 3 
          }}>
            <Card sx={{ 
              borderRadius: 3, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' }
            }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
                <Avatar sx={{ bgcolor: 'primary.50', color: 'primary.main', width: 56, height: 56 }}>
                  <People sx={{ fontSize: 28 }} />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="800" color="text.primary">
                    {teacherStats.uniquePeople}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="500">
                    Registered Students
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ 
              borderRadius: 3, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' }
            }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
                <Avatar sx={{ bgcolor: 'success.50', color: 'success.main', width: 56, height: 56 }}>
                  <CheckCircle sx={{ fontSize: 28 }} />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="800" color="success.main">
                    {teacherStats.todayAttendance}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="500">
                    Attendance Today
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ 
              borderRadius: 3, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
              transition: 'transform 0.2s',
              '&:hover': { transform: 'translateY(-4px)' }
            }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
                <Avatar sx={{ bgcolor: 'info.50', color: 'info.main', width: 56, height: 56 }}>
                  <BarChart sx={{ fontSize: 28 }} />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="800" color="info.main">
                    {teacherStats.totalRecords}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="500">
                    Total Logs Streamed
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Command and Roster Panels */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, 
            gap: 3,
            mt: 3
          }}>
            {/* Quick Actions Panel */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SettingsIcon color="primary" />
                  Quick Actions Command Center
                </Typography>
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Direct administrator hooks to train the neural network engine, export records, or secure cloud databases.
                </Typography>

                <Stack spacing={2}>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    disabled={retrainLoading}
                    onClick={handleRetrain}
                    startIcon={retrainLoading ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
                    sx={{ py: 1.5, fontWeight: 'bold' }}
                  >
                    {retrainLoading ? 'Training Network...' : 'Retrain LBPH Face Model Now'}
                  </Button>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      size="large"
                      onClick={downloadExcel}
                      startIcon={<GetApp />}
                      sx={{ py: 1.5, fontWeight: 'bold' }}
                    >
                      Excel Dump
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      size="large"
                      disabled={backupLoading}
                      onClick={handleBackup}
                      startIcon={backupLoading ? <CircularProgress size={20} /> : <Backup />}
                      sx={{ py: 1.5, fontWeight: 'bold' }}
                    >
                      Cloud Backup
                    </Button>
                  </Box>

                  <Button
                    variant="text"
                    color="primary"
                    onClick={() => setTabValue(1)}
                    startIcon={<Videocam />}
                    sx={{ fontWeight: 'bold', alignSelf: 'center' }}
                  >
                    Open Live Marking Feed
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Student Directory Roster */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <People color="primary" />
                  Roster Directory Preview
                </Typography>
                <Divider sx={{ my: 2 }} />

                {teacherStats.knownNames.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">No students registered yet.</Typography>
                    <Button variant="text" size="small" onClick={() => setTabValue(2)} sx={{ mt: 1 }}>
                      Register student
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                    <List disablePadding>
                      {teacherStats.knownNames.map((name, idx) => (
                        <ListItem key={idx} sx={{ px: 0, py: 1 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.85rem', bgcolor: 'primary.light' }}>
                              {name.charAt(0).toUpperCase()}
                            </Avatar>
                          </ListItemIcon>
                          <ListItemText 
                            primary={name} 
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                          />
                          <Chip size="small" label="Trained" color="success" variant="outlined" />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}

      {/* --- STUDENT DASHBOARD --- */}
      {role === 'student' && user && (
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, 
          gap: 3 
        }}>
          {/* Left Column: Profile Card & Action Links */}
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', textAlign: 'center', p: 3 }}>
            <Avatar
              src={`${API_BASE_URL}/images/${user.name}_front.jpg`}
              sx={{
                width: 110,
                height: 110,
                mx: 'auto',
                mb: 2,
                boxShadow: '0 0 0 4px #3b82f6',
                fontSize: '2.5rem',
                bgcolor: 'primary.main'
              }}
            >
              {user.name.charAt(0).toUpperCase()}
            </Avatar>

            <Typography variant="h5" fontWeight="800" color="text.primary">
              {user.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontWeight: 500 }}>
              SCAN Student Profile
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Stack spacing={2} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={() => setTabValue(2)}
                startIcon={<Videocam />}
                sx={{ py: 1.2, fontWeight: 'bold' }}
              >
                Mark Self Attendance
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setTabValue(1)}
                startIcon={<AccessTime />}
                sx={{ py: 1.2, fontWeight: 'bold' }}
              >
                View My History
              </Button>
            </Stack>
          </Card>

          {/* Right Column: Attendance Progress & Stats */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, 
            gap: 3 
          }}>
            {/* Circular Progress rate */}
            <Card sx={{ 
              borderRadius: 3, 
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              p: 3,
              height: '100%'
            }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Attendance Rate
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                Based on typical 20 class-day schedule
              </Typography>

              <Box sx={{ position: 'relative', display: 'inline-flex', my: 2 }}>
                <CircularProgress 
                  variant="determinate" 
                  value={studentStats.percentage} 
                  size={120} 
                  thickness={6} 
                  color={studentStats.percentage >= 75 ? 'success' : 'warning'}
                />
                <Box sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Typography variant="h5" component="div" fontWeight="bold" color="text.primary">
                    {studentStats.percentage}%
                  </Typography>
                </Box>
              </Box>
              
              <Chip 
                label={studentStats.percentage >= 75 ? 'On Track' : 'Below Target'} 
                color={studentStats.percentage >= 75 ? 'success' : 'warning'}
                size="small"
                sx={{ mt: 1 }}
              />
            </Card>

            {/* General Personal metrics */}
            <Stack spacing={3} sx={{ height: '100%', justifyContent: 'space-between' }}>
              <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 2.5 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'success.50', color: 'success.main' }}>
                    <CheckCircle />
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight="800">
                      {studentStats.presentDays} Days
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Days Present
                    </Typography>
                  </Box>
                </Stack>
              </Card>

              <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 2.5 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'primary.50', color: 'primary.main' }}>
                    <AccessTime />
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="800" sx={{ wordBreak: 'break-all' }}>
                      {studentStats.lastMarked}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Last Marked Scan
                    </Typography>
                  </Box>
                </Stack>
              </Card>

              <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 2.5 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar sx={{ bgcolor: 'warning.50', color: 'warning.main' }}>
                    <Star />
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight="800">
                      Verified
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Registration Angle status
                    </Typography>
                  </Box>
                </Stack>
              </Card>
            </Stack>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default Dashboard;