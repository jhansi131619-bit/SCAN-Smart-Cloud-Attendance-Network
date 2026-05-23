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
  Divider
} from '@mui/material';
import {
  Assessment,
  GetApp,
  Person,
  FilterList,
  Print
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface AttendanceRecord {
  name: string;
  date: string;
  time: string;
  confidence: number;
}

interface ReportFilters {
  startDate: string;
  endDate: string;
  person: string;
  minConfidence: number;
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
    person: 'all',
    minConfidence: 0.5
  });

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

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [attendanceResponse, facesResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/attendance-records`),
        axios.get(`${API_BASE_URL}/known-faces`),
      ]);

      const attendanceData = attendanceResponse.data.records || [];
      const facesData = facesResponse.data.people || [];
      
      setRecords(attendanceData);
      setKnownPeople(facesData.map((face: any) => face.name));
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

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Date', 'Time', 'Confidence'],
      ...filteredRecords.map(record => [
        record.name,
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
      <p><strong>Total Records:</strong> ${filteredRecords.length}</p>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <tr>
          <th>Name</th>
          <th>Date</th>
          <th>Time</th>
          <th>Confidence</th>
        </tr>
        ${filteredRecords.map(record => `
          <tr>
            <td>${record.name}</td>
            <td>${record.date}</td>
            <td>${record.time}</td>
            <td>${(record.confidence * 100).toFixed(1)}%</td>
          </tr>
        `).join('')}
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
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
      </Box>

      {/* Records Table */}
      <Card>
        <CardContent>
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
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Confidence</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRecords.map((record, index) => (
                    <TableRow key={index} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{record.name}</TableCell>
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
        </CardContent>
      </Card>
    </Box>
  );
}

export default Reports;
