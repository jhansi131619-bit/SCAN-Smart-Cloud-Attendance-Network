import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tabs,
  Tab
} from '@mui/material';
import {
  Assessment,
  GetApp,
  Person,
  FilterList,
  Print,
  Email
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface AttendanceRecord {
  name: string;
  date: string;
  time: string;
  confidence: number;
  class_name?: string;
  period?: string;
}

interface ReportFilters {
  startDate: string;
  endDate: string;
  person: string;
  minConfidence: number;
  class_name: string;
  period: string;
}

interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  attendanceRate: number;
  averageTime: string;
  firstAttendance: string;
  lastAttendance: string;
}

function Reports() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [knownPeople, setKnownPeople] = useState<string[]>([]);
  const [peopleDetails, setPeopleDetails] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'present' | 'absent'>('present');
  const [notifyingParents, setNotifyingParents] = useState(false);
  const [notifySuccessMsg, setNotifySuccessMsg] = useState<string | null>(null);
  const [notifyErrorMsg, setNotifyErrorMsg] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
    person: 'all',
    minConfidence: 0.5,
    class_name: 'all',
    period: 'all'
  });

  // Email Report Dialog States
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const applyFilters = useCallback(() => {
    let filtered = records.filter(record => {
      // Date filter
      const recordDate = new Date(record.date);
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      
      if (recordDate < startDate || recordDate > endDate) {
        return false;
      }

      // Person filter
      if (filters.person !== 'all' && record.name !== filters.person) {
        return false;
      }

      // Class filter
      if (filters.class_name !== 'all' && (record.class_name || 'N/A') !== filters.class_name) {
        return false;
      }

      // Period filter
      if (filters.period !== 'all' && (record.period || 'N/A') !== filters.period) {
        return false;
      }

      // Confidence filter
      if (record.confidence < filters.minConfidence) {
        return false;
      }

      return true;
    });

    setFilteredRecords(filtered);
  }, [records, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const absentStudents = React.useMemo(() => {
    if (filters.class_name === 'all' || filters.period === 'all') {
      return [];
    }
    const classStudents = peopleDetails.filter(
      p => (p.class_name || '').toLowerCase() === filters.class_name.toLowerCase()
    );
    const presentNames = new Set(
      records
        .filter(r => 
          r.date === filters.endDate && 
          (r.class_name || '').toLowerCase() === filters.class_name.toLowerCase() &&
          (r.period || '').toLowerCase() === filters.period.toLowerCase()
        )
        .map(r => r.name.toLowerCase())
    );
    return classStudents.filter(s => !presentNames.has(s.name.toLowerCase()));
  }, [peopleDetails, records, filters.class_name, filters.period, filters.endDate]);

  const handleNotifyParents = async () => {
    try {
      setNotifyingParents(true);
      setNotifySuccessMsg(null);
      setNotifyErrorMsg(null);
      const res = await axios.post(`${API_BASE_URL}/api/email/absentees`, {
        class_name: filters.class_name,
        period: filters.period,
        date: filters.endDate
      });
      if (res.data && res.data.status === 'success') {
        setNotifySuccessMsg(res.data.message || 'Notifications sent successfully!');
      } else {
        setNotifyErrorMsg(res.data.message || 'Failed to send notifications');
      }
    } catch (err: any) {
      setNotifyErrorMsg(err.response?.data?.message || 'Error communicating with notification server');
    } finally {
      setNotifyingParents(false);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [attendanceResponse, facesResponse, classesResponse, emailSettingsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/attendance-records`),
        axios.get(`${API_BASE_URL}/known-faces`),
        axios.get(`${API_BASE_URL}/api/classes`),
        axios.get(`${API_BASE_URL}/api/email/settings`).catch(() => null)
      ]);

      const attendanceData = attendanceResponse.data.records || [];
      const facesData = facesResponse.data.people || [];
      const classesData = classesResponse.data.classes || [];
      
      setRecords(attendanceData);
      setKnownPeople(facesData.map((face: any) => face.name));
      setPeopleDetails(facesData);
      setClasses(classesData);

      if (emailSettingsResponse && emailSettingsResponse.data && emailSettingsResponse.data.status === 'success') {
        setEmailRecipient(emailSettingsResponse.data.settings.admin_email || '');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const generatePersonStats = (personName: string): AttendanceStats => {
    const personRecords = filteredRecords.filter(r => r.name === personName);
    
    if (personRecords.length === 0) {
      return {
        totalDays: 0,
        presentDays: 0,
        attendanceRate: 0,
        averageTime: 'N/A',
        firstAttendance: 'N/A',
        lastAttendance: 'N/A'
      };
    }

    const uniqueDates = Array.from(new Set(personRecords.map(r => r.date)));
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;

    // Calculate average time
    const timeMinutes = personRecords.map(r => {
      const [hours, minutes] = r.time.split(':').map(Number);
      return hours * 60 + minutes;
    });
    const avgMinutes = timeMinutes.reduce((a, b) => a + b, 0) / timeMinutes.length;
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = Math.floor(avgMinutes % 60);

    // Sort records by date and time
    const sortedRecords = personRecords.sort((a, b) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    return {
      totalDays,
      presentDays: uniqueDates.length,
      attendanceRate: (uniqueDates.length / totalDays) * 100,
      averageTime: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
      firstAttendance: sortedRecords[0] ? `${sortedRecords[0].date} ${sortedRecords[0].time}` : 'N/A',
      lastAttendance: sortedRecords[sortedRecords.length - 1] ? 
        `${sortedRecords[sortedRecords.length - 1].date} ${sortedRecords[sortedRecords.length - 1].time}` : 'N/A'
    };
  };

  const handleEmailReport = async () => {
    try {
      setEmailSending(true);
      setEmailSuccessMsg(null);
      setEmailErrorMsg(null);
      const res = await axios.post(`${API_BASE_URL}/api/email/report`, {
        recipient: emailRecipient.trim(),
        start_date: filters.startDate,
        end_date: filters.endDate,
        class_name: filters.class_name,
        period: filters.period,
        min_confidence: filters.minConfidence
      });
      
      if (res.data && res.data.status === 'success') {
        setEmailSuccessMsg(res.data.message || 'Report email has been successfully queued for delivery!');
        setTimeout(() => {
          setShowEmailDialog(false);
          setEmailSuccessMsg(null);
        }, 3000);
      } else {
        setEmailErrorMsg(res.data.message || 'Failed to dispatch email');
      }
    } catch (err: any) {
      setEmailErrorMsg(err.response?.data?.message || 'SMTP server error occurred');
    } finally {
      setEmailSending(false);
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Class', 'Period', 'Date', 'Time', 'Confidence'],
      ...filteredRecords.map(record => [
        record.name,
        record.class_name || 'N/A',
        record.period || 'N/A',
        record.date,
        record.time,
        (record.confidence * 100).toFixed(1) + '%'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${filters.startDate}_${filters.endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/download-attendance`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_records_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download Excel file');
    }
  };

  const printReport = () => {
    const printContent = `
      <h1>Attendance Report</h1>
      <p><strong>Period:</strong> ${filters.startDate} to ${filters.endDate}</p>
      <p><strong>Person:</strong> ${filters.person === 'all' ? 'All People' : filters.person}</p>
      <p><strong>Class:</strong> ${filters.class_name === 'all' ? 'All Classes' : filters.class_name}</p>
      <p><strong>Period:</strong> ${filters.period === 'all' ? 'All Periods' : filters.period}</p>
      <p><strong>Total Records:</strong> ${filteredRecords.length}</p>
      <table border="1" style="border-collapse: collapse; width: 100%; text-align: left; padding: 8px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px;">Name</th>
            <th style="padding: 8px;">Class</th>
            <th style="padding: 8px;">Period</th>
            <th style="padding: 8px;">Date</th>
            <th style="padding: 8px;">Time</th>
            <th style="padding: 8px;">Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRecords.map(record => `
            <tr>
              <td style="padding: 8px;">${record.name}</td>
              <td style="padding: 8px;">${record.class_name || 'N/A'}</td>
              <td style="padding: 8px;">${record.period || 'N/A'}</td>
              <td style="padding: 8px;">${record.date}</td>
              <td style="padding: 8px;">${record.time}</td>
              <td style="padding: 8px;">${(record.confidence * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3, textAlign: 'center' }}>
        <CircularProgress size={40} />
        <Typography variant="body1" sx={{ mt: 2 }}>Loading reports...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Assessment />
        Attendance Reports
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterList />
            Filters
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr', lg: '1fr 1fr 1fr 1fr 1fr 1fr' }, gap: 2 }}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Person</InputLabel>
              <Select
                value={filters.person}
                label="Person"
                onChange={(e) => setFilters(prev => ({ ...prev, person: e.target.value }))}
              >
                <MenuItem value="all">All People</MenuItem>
                {knownPeople.map(person => (
                  <MenuItem key={person} value={person}>{person}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Class</InputLabel>
              <Select
                value={filters.class_name}
                label="Class"
                onChange={(e) => setFilters(prev => ({ ...prev, class_name: e.target.value }))}
              >
                <MenuItem value="all">All Classes</MenuItem>
                {classes.map((cls) => (
                  <MenuItem key={cls} value={cls}>
                    {cls}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Period</InputLabel>
              <Select
                value={filters.period}
                label="Period"
                onChange={(e) => setFilters(prev => ({ ...prev, period: e.target.value }))}
              >
                <MenuItem value="all">All Periods</MenuItem>
                <MenuItem value="Period 1">Period 1</MenuItem>
                <MenuItem value="Period 2">Period 2</MenuItem>
                <MenuItem value="Period 3">Period 3</MenuItem>
                <MenuItem value="Period 4">Period 4</MenuItem>
                <MenuItem value="Period 5">Period 5</MenuItem>
                <MenuItem value="Period 6">Period 6</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Min Confidence (%)"
              type="number"
              value={filters.minConfidence * 100}
              onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: Number(e.target.value) / 100 }))}
              inputProps={{ min: 0, max: 100, step: 5 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3, mb: 3 }}>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="h3" color="primary" sx={{ fontWeight: 600 }}>
              {filteredRecords.length}
            </Typography>
            <Typography variant="h6">Total Records</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="h3" color="success.main" sx={{ fontWeight: 600 }}>
              {Array.from(new Set(filteredRecords.map(r => r.name))).length}
            </Typography>
            <Typography variant="h6">Unique People</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="h3" color="warning.main" sx={{ fontWeight: 600 }}>
              {Array.from(new Set(filteredRecords.map(r => r.date))).length}
            </Typography>
            <Typography variant="h6">Active Days</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Person Statistics */}
      {filters.person !== 'all' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Person />
              Statistics for {filters.person}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {(() => {
              const stats = generatePersonStats(filters.person);
              return (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr', md: '1fr 1fr 1fr 1fr 1fr' }, gap: 3 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Present Days</Typography>
                    <Typography variant="h6">{stats.presentDays}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Attendance Rate</Typography>
                    <Typography variant="h6">{stats.attendanceRate.toFixed(1)}%</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Average Time</Typography>
                    <Typography variant="h6">{stats.averageTime}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">First Attendance</Typography>
                    <Typography variant="body1">{stats.firstAttendance}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Last Attendance</Typography>
                    <Typography variant="body1">{stats.lastAttendance}</Typography>
                  </Box>
                </Box>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Export Actions */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<GetApp />}
          onClick={downloadExcel}
        >
          Download Excel
        </Button>
        <Button
          variant="outlined"
          startIcon={<GetApp />}
          onClick={exportToCSV}
        >
          Export CSV
        </Button>
        <Button
          variant="outlined"
          startIcon={<Print />}
          onClick={printReport}
        >
          Print Report
        </Button>
        <Button
          variant="outlined"
          startIcon={<Email />}
          onClick={() => {
            setEmailSuccessMsg(null);
            setEmailErrorMsg(null);
            setShowEmailDialog(true);
          }}
        >
          Email Report
        </Button>
      </Box>

      {/* Records Table */}
      <Card>
        <CardContent>
          <Tabs
            value={activeTab}
            onChange={(e, val) => {
              setActiveTab(val);
              setNotifySuccessMsg(null);
              setNotifyErrorMsg(null);
            }}
            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label={`Present (${filteredRecords.length})`} value="present" />
            <Tab label={`Absent (${filters.class_name === 'all' || filters.period === 'all' ? 'Select Class & Period' : absentStudents.length})`} value="absent" />
          </Tabs>

          {activeTab === 'present' ? (
            <>
              <Typography variant="h6" gutterBottom>
                Filtered Records ({filteredRecords.length})
              </Typography>
              {filteredRecords.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    No records found for the selected filters
                  </Typography>
                </Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Class</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Period</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredRecords.map((record, index) => (
                        <TableRow key={index} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{record.name}</TableCell>
                          <TableCell>{record.class_name || 'N/A'}</TableCell>
                          <TableCell>{record.period || 'N/A'}</TableCell>
                          <TableCell>{record.date}</TableCell>
                          <TableCell>{record.time}</TableCell>
                          <TableCell>
                            <Chip
                              label={`${(record.confidence * 100).toFixed(1)}%`}
                              color={record.confidence > 0.8 ? "success" : record.confidence > 0.6 ? "warning" : "error"}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          ) : (
            <>
              <Box sx={{ mb: 3, p: 2.5, bgcolor: '#fef2f2', borderRadius: 3, border: '1px solid', borderColor: '#fee2e2' }}>
                <Typography variant="subtitle1" color="error.main" sx={{ fontWeight: 'bold', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>📢</span> Absentee Parent Notification
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Verify the list of absent students below. Clicking the button below will dispatch an automated email notification alert to each student's registered parent email for <strong>{filters.class_name === 'all' ? 'All Classes' : filters.class_name}</strong> on <strong>{filters.endDate}</strong> (Period: <strong>{filters.period}</strong>).
                </Typography>

                {filters.class_name === 'all' || filters.period === 'all' ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    Please select a specific <strong>Class</strong> and <strong>Period</strong> in the filters above to load absentees and enable parent email notifications.
                  </Alert>
                ) : (
                  <>
                    {notifySuccessMsg && (
                      <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                        {notifySuccessMsg}
                      </Alert>
                    )}
                    {notifyErrorMsg && (
                      <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                        {notifyErrorMsg}
                      </Alert>
                    )}

                    <Button
                      variant="contained"
                      color="error"
                      onClick={handleNotifyParents}
                      disabled={notifyingParents || absentStudents.length === 0}
                      startIcon={notifyingParents ? <CircularProgress size={20} color="inherit" /> : <Email />}
                      sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none', py: 1 }}
                    >
                      {notifyingParents ? 'Sending Emails...' : `Notify Parents of Absence (${absentStudents.length} Students)`}
                    </Button>
                  </>
                )}
              </Box>

              {filters.class_name !== 'all' && filters.period !== 'all' && (
                <>
                  <Typography variant="h6" gutterBottom>
                    Absent Students ({absentStudents.length})
                  </Typography>
                  {absentStudents.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px dashed', borderColor: 'success.200' }}>
                      <Typography variant="body1" color="success.main" sx={{ fontWeight: 600 }}>
                        🎉 All students are marked present!
                      </Typography>
                    </Box>
                  ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
                      <Table stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Class</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Student Email</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Parent Email</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Notification Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {absentStudents.map((student, index) => (
                            <TableRow key={index} hover>
                              <TableCell sx={{ fontWeight: 500 }}>{student.name}</TableCell>
                              <TableCell>{student.class_name || 'N/A'}</TableCell>
                              <TableCell>{student.email || 'N/A'}</TableCell>
                              <TableCell>{student.parent_email || 'N/A'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={student.parent_email ? "Email Configured" : "No Parent Email"}
                                  color={student.parent_email ? "success" : "warning"}
                                  size="small"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Email Report Dialog */}
      <Dialog
        open={showEmailDialog}
        onClose={() => !emailSending && setShowEmailDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>Email Filtered Report</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The report will be filtered to match your current display filters and emailed as an Excel sheet (.xlsx).
            </Typography>
            
            {emailSuccessMsg && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {emailSuccessMsg}
              </Alert>
            )}
            
            {emailErrorMsg && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {emailErrorMsg}
              </Alert>
            )}

            <TextField
              label="Recipient Email Address"
              type="email"
              fullWidth
              placeholder="e.g. admin@school.com"
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
              disabled={emailSending}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setShowEmailDialog(false)} 
            disabled={emailSending}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleEmailReport} 
            variant="contained"
            disabled={emailSending || !emailRecipient.trim()}
            startIcon={emailSending ? <CircularProgress size={20} color="inherit" /> : <Email />}
            sx={{ borderRadius: 2, fontWeight: 'bold' }}
          >
            {emailSending ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Reports;
