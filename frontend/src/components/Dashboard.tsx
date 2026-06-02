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
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  People,
  CheckCircle,
  Settings as SettingsIcon,
  Refresh,
  Backup,
  GetApp,
  Security,
  BarChart,
  Videocam,
  AccessTime,
  Star,
  Delete,
  Add,
  Search
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
  const [registeredStudents, setRegisteredStudents] = useState<any[]>([]);
  const [studentRecords, setStudentRecords] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'registered' | 'today' | 'logs' | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Dynamic Class Management states
  const [classes, setClasses] = useState<string[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [classesLoading, setClassesLoading] = useState(false);
  const [classActionLoading, setClassActionLoading] = useState(false);

  const fetchClasses = async () => {
    try {
      setClassesLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/classes`);
      if (res.data && res.data.status === 'success') {
        setClasses(res.data.classes || []);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    } finally {
      setClassesLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      setClassActionLoading(true);
      const res = await axios.post(`${API_BASE_URL}/api/classes`, {
        class_name: newClassName.trim()
      });
      if (res.data && res.data.status === 'success') {
        setNewClassName('');
        fetchClasses();
      } else {
        alert(res.data.message || 'Failed to create class');
      }
    } catch (err: any) {
      console.error('Error creating class:', err);
      alert(err.response?.data?.message || 'Error creating class');
    } finally {
      setClassActionLoading(false);
    }
  };

  const handleDeleteClass = async (className: string) => {
    if (!window.confirm(`Are you sure you want to delete the class "${className}"?`)) {
      return;
    }
    try {
      setClassActionLoading(true);
      const res = await axios.delete(`${API_BASE_URL}/api/classes`, {
        data: { class_name: className }
      });
      if (res.data && res.data.status === 'success') {
        fetchClasses();
      } else {
        alert(res.data.message || 'Failed to delete class');
      }
    } catch (err: any) {
      console.error('Error deleting class:', err);
      alert(err.response?.data?.message || 'Error deleting class');
    } finally {
      setClassActionLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (role === 'teacher') {
      fetchClasses();
    }
  }, [role, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      setLoading(true);
      if (role === 'teacher') {
        const statsRes = await axios.get(`${API_BASE_URL}/api/statistics`);
        const facesRes = await axios.get(`${API_BASE_URL}/known-faces`);
        const recordsRes = await axios.get(`${API_BASE_URL}/api/attendance`);
        
        const peopleList = facesRes.data.people || [];
        setRegisteredStudents(peopleList);
        
        const allRecords = recordsRes.data.records || recordsRes.data.data || [];
        setStudentRecords(allRecords);
        
        setTeacherStats({
          totalRecords: statsRes.data.total_records || 0,
          uniquePeople: peopleList.length,
          todayAttendance: statsRes.data.today_attendance || 0,
          averageConfidence: statsRes.data.average_confidence || 0,
          knownNames: peopleList.map((p: any) => p.name)
        });
        fetchClasses();
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

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredModalData = useMemo(() => {
    if (!activeModal) return [];
    
    const query = modalSearchQuery.toLowerCase().trim();
    
    if (activeModal === 'registered') {
      return registeredStudents.filter((student: any) => {
        const name = (student.name || '').toLowerCase();
        const cls = (student.class_name || '').toLowerCase();
        return name.includes(query) || cls.includes(query);
      });
    }
    
    if (activeModal === 'today') {
      const todayDate = getTodayDateString();
      const todayLogs = studentRecords.filter((r: any) => r.date === todayDate);
      return todayLogs.filter((r: any) => {
        const name = (r.name || '').toLowerCase();
        const cls = (r.class_name || '').toLowerCase();
        const period = (r.period || '').toLowerCase();
        const time = (r.time || '').toLowerCase();
        return name.includes(query) || cls.includes(query) || period.includes(query) || time.includes(query);
      });
    }
    
    if (activeModal === 'logs') {
      const sortedLogs = [...studentRecords].sort((a: any, b: any) => {
        return new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime();
      });
      return sortedLogs.filter((r: any) => {
        const name = (r.name || '').toLowerCase();
        const cls = (r.class_name || '').toLowerCase();
        const period = (r.period || '').toLowerCase();
        const date = (r.date || '').toLowerCase();
        const time = (r.time || '').toLowerCase();
        return name.includes(query) || cls.includes(query) || period.includes(query) || date.includes(query) || time.includes(query);
      });
    }
    
    return [];
  }, [activeModal, modalSearchQuery, registeredStudents, studentRecords]);

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

  // Class distributions for teacher stats
  const classCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    registeredStudents.forEach((student: any) => {
      const cls = student.class_name || 'N/A';
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return counts;
  }, [registeredStudents]);

  // Class-wise statistics for students
  const studentClassStats = useMemo(() => {
    const stats: { [key: string]: { presentDays: number; percentage: number; lastMarked: string } } = {};
    
    studentRecords.forEach((record: any) => {
      const cls = record.class_name;
      if (!cls || cls === 'General') return; // Skip General or falsy class names
      if (!stats[cls]) {
        stats[cls] = { presentDays: 0, percentage: 0, lastMarked: 'N/A' };
      }
      stats[cls].presentDays += 1;
    });
    
    Object.keys(stats).forEach(cls => {
      const schoolDays = 20; 
      const presentDays = stats[cls].presentDays;
      stats[cls].percentage = Math.min(100, parseFloat(((presentDays / schoolDays) * 100).toFixed(1)));
      
      const classRecords = studentRecords
        .filter((r: any) => r.class_name === cls)
        .sort((a: any, b: any) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime());
      
      stats[cls].lastMarked = classRecords[0] ? `${classRecords[0].date} at ${classRecords[0].time}` : 'N/A';
    });
    
    return stats;
  }, [studentRecords]);

  // Period-wise statistics for students
  const studentPeriodStats = useMemo(() => {
    const periods = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6'];
    const stats: { [key: string]: { count: number; percentage: number } } = {};
    
    // Initialize
    periods.forEach(p => {
      stats[p] = { count: 0, percentage: 0 };
    });
    
    studentRecords.forEach((record: any) => {
      const p = record.period;
      if (p && stats[p] !== undefined) {
        stats[p].count += 1;
      }
    });
    
    // Calculate percentage against a typical target of 10 sessions per period
    periods.forEach(p => {
      const target = 10;
      stats[p].percentage = Math.min(100, parseFloat(((stats[p].count / target) * 100).toFixed(1)));
    });
    
    return stats;
  }, [studentRecords]);

  // Day-wise statistics for students (last 14 calendar days)
  const studentDayStats = useMemo(() => {
    const daysList = [];
    const today = new Date();
    
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateString = d.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Find if student has any record on this date
      const dayRecords = studentRecords.filter((r: any) => r.date === dateString && r.period !== 'General');
      const isPresent = dayRecords.length > 0;
      
      // Format nice date label like "Mon, Jun 1"
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      daysList.push({
        date: dateString,
        label,
        isPresent,
        records: dayRecords
      });
    }
    return daysList;
  }, [studentRecords]);

  const selectedStudentDetails = useMemo(() => {
    if (!selectedStudent) return null;
    return registeredStudents.find(s => s.name.toLowerCase() === selectedStudent.toLowerCase());
  }, [selectedStudent, registeredStudents]);

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
            <Card 
              onClick={() => {
                setActiveModal('registered');
                setModalSearchQuery('');
              }}
              sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 25px rgba(37, 130, 246, 0.15)'
                }
              }}
            >
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

            <Card 
              onClick={() => {
                setActiveModal('today');
                setModalSearchQuery('');
              }}
              sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 25px rgba(16, 185, 129, 0.15)'
                }
              }}
            >
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

            <Card 
              onClick={() => {
                setActiveModal('logs');
                setModalSearchQuery('');
              }}
              sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 25px rgba(2, 136, 209, 0.15)'
                }
              }}
            >
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

                {registeredStudents.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">No students registered yet.</Typography>
                    <Button variant="text" size="small" onClick={() => setTabValue(2)} sx={{ mt: 1 }}>
                      Register student
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
                    <List disablePadding>
                      {registeredStudents.map((student, idx) => (
                        <ListItem 
                          key={idx} 
                          onClick={() => setSelectedStudent(student.name)}
                          sx={{ 
                            px: 1, 
                            py: 1, 
                            borderRadius: 1.5,
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            '&:hover': {
                              bgcolor: 'action.hover'
                            }
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.85rem', bgcolor: 'primary.light' }}>
                              {student.name.charAt(0).toUpperCase()}
                            </Avatar>
                          </ListItemIcon>
                          <ListItemText 
                            primary={student.name} 
                            secondary={`Class: ${student.class_name || 'N/A'}`}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                            secondaryTypographyProps={{ variant: 'caption' }}
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

          {/* Class Management Card */}
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 3, mt: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              🏫 Dynamic Class Management Center
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create new class codes or decommission existing ones. Student registration and reports will sync automatically.
            </Typography>
            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 4, mt: 2 }}>
              {/* Create Class Form */}
              <Box component="form" onSubmit={handleCreateClass} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" color="text.primary">
                  Create New Class Room
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <TextField
                    size="small"
                    placeholder="e.g., Class 10-C, Physics-B"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    disabled={classActionLoading}
                    fullWidth
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={classActionLoading || !newClassName.trim()}
                    startIcon={classActionLoading ? <CircularProgress size={16} color="inherit" /> : <Add />}
                    sx={{ borderRadius: 2, fontWeight: 'bold', minWidth: '120px', textTransform: 'none' }}
                  >
                    Add Class
                  </Button>
                </Box>
              </Box>

              {/* Class List */}
              <Box>
                <Typography variant="subtitle2" fontWeight="bold" color="text.primary" sx={{ mb: 1.5 }}>
                  Existing Live Classes ({classes.length})
                </Typography>
                {classesLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : classes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No classes found. Set up classes to start enrolling.
                  </Typography>
                ) : (
                  <Box sx={{ maxHeight: 200, overflowY: 'auto', pr: 0.5 }}>
                    <Stack spacing={1}>
                      {classes.map((cls) => (
                        <Paper
                          key={cls}
                          variant="outlined"
                          sx={{
                            p: 1,
                            px: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderRadius: 2,
                            transition: 'all 0.2s',
                            '&:hover': {
                              bgcolor: 'action.hover',
                              borderColor: 'primary.light',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                            }
                          }}
                        >
                          <Typography variant="body2" fontWeight="600" color="text.primary">
                            {cls}
                          </Typography>
                          <Tooltip title={`Delete ${cls}`}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteClass(cls)}
                                disabled={classActionLoading}
                                sx={{
                                  transition: 'transform 0.15s',
                                  '&:hover': { transform: 'scale(1.15)' }
                                }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            </Box>
          </Card>

          {/* Class Distribution Section */}
          {Object.keys(classCounts).length > 0 && (
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 3, mt: 3 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                🏫 Class Roster Distribution
              </Typography>
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ gap: 1.5 }}>
                {Object.entries(classCounts).map(([cls, count]) => (
                  <Chip
                    key={cls}
                    label={`${cls}: ${count} ${count === 1 ? 'student' : 'students'}`}
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 'bold', py: 2, px: 1, borderRadius: 2 }}
                  />
                ))}
              </Stack>
            </Card>
          )}
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
          </Card>          {/* Right Column: Attendance Progress & Stats */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Circular Progress per class */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 3 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Class-Wise Attendance Progress
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Percentage calculated on 20 typical school sessions per class.
              </Typography>

              {Object.keys(studentClassStats).length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No class attendance logs recorded yet.</Typography>
                </Box>
              ) : (
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, 
                  gap: 3 
                }}>
                  {Object.entries(studentClassStats).map(([cls, stats]) => (
                    <Paper 
                      key={cls}
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 2, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        bgcolor: 'background.paper',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                        {cls}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                        {stats.presentDays} of 20 sessions attended
                      </Typography>

                      <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                        <CircularProgress 
                          variant="determinate" 
                          value={stats.percentage} 
                          size={85} 
                          thickness={5} 
                          color={stats.percentage >= 75 ? 'success' : 'warning'}
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
                          <Typography variant="body2" fontWeight="bold" color="text.primary">
                            {stats.percentage}%
                          </Typography>
                        </Box>
                      </Box>

                      <Chip 
                        label={stats.percentage >= 75 ? 'Good Standing' : 'Below Target'} 
                        color={stats.percentage >= 75 ? 'success' : 'warning'}
                        size="small"
                        sx={{ fontSize: '0.65rem' }}
                      />
                    </Paper>
                  ))}
                </Box>
              )}
            </Card>

            {/* Period-Wise Attendance Progress */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 3 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTime color="primary" /> Period-Wise Attendance Distribution
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Roster attendance breakdown by school periods (target of 10 sessions per period).
              </Typography>

              <Stack spacing={2.5}>
                {Object.entries(studentPeriodStats).map(([period, stats]) => (
                  <Box key={period} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2" fontWeight="bold" sx={{ width: 80, color: 'text.primary' }}>
                      {period}
                    </Typography>
                    
                    <Box sx={{ flexGrow: 1, height: 12, bgcolor: 'grey.100', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                      <Tooltip title={`${stats.count} sessions attended (${stats.percentage}%)`}>
                        <Box sx={{
                          height: '100%',
                          width: `${stats.percentage}%`,
                          background: stats.percentage >= 75
                            ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' // Emerald
                            : stats.percentage >= 40
                            ? 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)' // Blue
                            : 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)', // Amber
                          borderRadius: 6,
                          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                        }} />
                      </Tooltip>
                    </Box>

                    <Typography variant="body2" fontWeight="bold" sx={{ width: 60, textAlign: 'right', color: 'text.secondary' }}>
                      {stats.count} / 10
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Card>

            {/* Recent 14-Day Attendance Tracker */}
            <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)', p: 3 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle color="success" /> Recent 14-Day Attendance Tracker
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Daily attendance check-ins. Green blocks indicate marked attendance.
              </Typography>

              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 1.5,
                overflowX: 'auto',
                pb: 1.5,
                pt: 0.5,
                '&::-webkit-scrollbar': { height: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 3 }
              }}>
                {studentDayStats.map((day) => {
                  const dayNum = day.date.split('-')[2];
                  const dayName = day.label.split(',')[0];
                  const tooltipTitle = day.isPresent
                    ? `Present on ${day.label} (${day.records.length} scan${day.records.length > 1 ? 's' : ''}): ${day.records.map((r: any) => r.period || 'N/A').join(', ')}`
                    : `No Record on ${day.label}`;

                  return (
                    <Tooltip key={day.date} title={tooltipTitle} arrow>
                      <Stack spacing={1} alignItems="center" sx={{ minWidth: 42, cursor: 'pointer' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}>
                          {dayName}
                        </Typography>

                        <Box sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          transform: 'scale(1)',
                          background: day.isPresent
                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                            : '#f3f4f6',
                          border: day.isPresent ? 'none' : '1px solid #e5e7eb',
                          boxShadow: day.isPresent ? '0 4px 10px rgba(16, 185, 129, 0.25)' : 'none',
                          '&:hover': {
                            transform: 'scale(1.08)',
                            boxShadow: day.isPresent 
                              ? '0 6px 12px rgba(16, 185, 129, 0.35)' 
                              : '0 4px 8px rgba(0,0,0,0.05)'
                          }
                        }}>
                          {day.isPresent ? (
                            <CheckCircle sx={{ color: 'white', fontSize: '1.2rem' }} />
                          ) : (
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'grey.300' }} />
                          )}
                        </Box>

                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.primary', fontSize: '0.75rem' }}>
                          {dayNum}
                        </Typography>
                      </Stack>
                    </Tooltip>
                  );
                })}
              </Box>
            </Card>

            {/* General Personal metrics */}
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, 
              gap: 2 
            }}>
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
                    <Typography variant="subtitle2" fontWeight="800" sx={{ wordBreak: 'break-all' }}>
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
                      Angles status
                    </Typography>
                  </Box>
                </Stack>
              </Card>
            </Box>
          </Box>
        </Box>
      )}

      {/* Statistics Detail Dialog */}
      <Dialog
        open={Boolean(activeModal)}
        onClose={() => {
          setActiveModal(null);
          setModalSearchQuery('');
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, p: 1 }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              {activeModal === 'registered' && 'Registered Students'}
              {activeModal === 'today' && "Today's Attendance Logs"}
              {activeModal === 'logs' && 'All-Time Attendance Logs'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeModal === 'registered' && `Showing ${filteredModalData.length} of ${registeredStudents.length} enrolled student profiles`}
              {activeModal === 'today' && `Showing ${filteredModalData.length} of ${studentRecords.filter((r: any) => r.date === getTodayDateString()).length} logs recorded today`}
              {activeModal === 'logs' && `Showing ${filteredModalData.length} of ${studentRecords.length} total logs streamed`}
            </Typography>
          </Box>
          <Button onClick={() => { setActiveModal(null); setModalSearchQuery(''); }} size="small" color="secondary">
            Close
          </Button>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 2 }}>
          {/* Search bar */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name, class, period, date..."
            value={modalSearchQuery}
            onChange={(e) => setModalSearchQuery(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <IconButton size="small" disabled sx={{ p: 0, mr: 1 }}>
                  <Search sx={{ fontSize: 20 }} />
                </IconButton>
              )
            }}
          />

          {filteredModalData.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <Typography variant="body1" color="text.secondary">No matching records found.</Typography>
              <Typography variant="caption" color="text.secondary">Try adjusting your search query.</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, borderRadius: 2 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {activeModal === 'registered' && (
                      <>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Avatar</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Class</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50', textAlign: 'right' }}>Actions</TableCell>
                      </>
                    )}
                    {activeModal === 'today' && (
                      <>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Class</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Period</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Confidence</TableCell>
                      </>
                    )}
                    {activeModal === 'logs' && (
                      <>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Class</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Period</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50' }}>Confidence</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeModal === 'registered' && (filteredModalData as any[]).map((student, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>
                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: 'primary.light' }}>
                          {student.name.charAt(0).toUpperCase()}
                        </Avatar>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{student.name}</TableCell>
                      <TableCell>{student.class_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip size="small" label="Trained" color="success" variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right' }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={() => {
                            setSelectedStudent(student.name);
                            setActiveModal(null);
                          }}
                          sx={{ textTransform: 'none', borderRadius: 1.5 }}
                        >
                          View Face Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {activeModal === 'today' && (filteredModalData as any[]).map((log, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{log.name}</TableCell>
                      <TableCell>{log.class_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={log.period || 'N/A'} 
                          color={log.period && log.period !== 'N/A' ? 'primary' : 'default'} 
                          variant="outlined" 
                        />
                      </TableCell>
                      <TableCell>{log.time}</TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={log.confidence ? `${(log.confidence * 100).toFixed(0)}%` : '0%'} 
                          color={log.confidence && log.confidence >= 0.7 ? 'success' : 'warning'} 
                        />
                      </TableCell>
                    </TableRow>
                  ))}

                  {activeModal === 'logs' && (filteredModalData as any[]).map((log, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{log.name}</TableCell>
                      <TableCell>{log.class_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={log.period || 'N/A'} 
                          color={log.period && log.period !== 'N/A' ? 'primary' : 'default'} 
                          variant="outlined" 
                        />
                      </TableCell>
                      <TableCell>{log.date}</TableCell>
                      <TableCell>{log.time}</TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={log.confidence ? `${(log.confidence * 100).toFixed(0)}%` : '0%'} 
                          color={log.confidence && log.confidence >= 0.7 ? 'success' : 'warning'} 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      {/* Student Details Dialog */}
      <Dialog
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" fontWeight="bold">Student Profile Details</Typography>
          <Button onClick={() => setSelectedStudent(null)} size="small" color="secondary">
            Close
          </Button>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {selectedStudent && (
            <Stack spacing={3} alignItems="center">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Avatar sx={{ width: 56, height: 56, fontSize: '1.5rem', bgcolor: 'primary.main' }}>
                  {selectedStudent.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h5" fontWeight="bold">{selectedStudent}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    Class: {selectedStudentDetails?.class_name || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Registered Profile • LBPH Face Recognition Model Active
                  </Typography>
                </Box>
                <Chip label="Trained" color="success" variant="filled" />
              </Box>

              <Divider sx={{ width: '100%' }} />

              <Box sx={{ width: '100%' }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Registered Multi-Angle Face Print:
                </Typography>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    p: 1.5, 
                    bgcolor: 'grey.50', 
                    borderRadius: 2, 
                    textAlign: 'center',
                    minHeight: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <img
                    src={`${API_BASE_URL}/images/${selectedStudent}.jpg`}
                    alt={`${selectedStudent} Face Print`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '240px',
                      borderRadius: '6px',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `${API_BASE_URL}/images/${selectedStudent}_front.jpg`;
                    }}
                  />
                </Paper>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Dashboard;