import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Card,
  Alert,
  CircularProgress,
  InputAdornment,
  TableSortLabel,
  TablePagination
} from '@mui/material';
import { 
  CheckCircle, 
  AccessTime, 
  Download, 
  Search, 
  FilterList, 
  Refresh,
  Person,
  Today,
  BarChart,
  Clear,
  GetApp
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

interface AttendanceFilters {
  search: string;
  person: string;
  dateFrom: string;
  dateTo: string;
  minConfidence: number;
  class_name: string;
  period: string;
}

type SortOrder = 'asc' | 'desc';
type SortBy = 'name' | 'date' | 'time' | 'confidence';

interface AttendanceStats {
  totalRecords: number;
  uniquePeople: number;
  todayRecords: number;
  averageConfidence: number;
  mostActiveDay: string;
  mostActivePerson: string;
}

interface AttendanceViewProps {
  studentName?: string;
}

function AttendanceView({ studentName }: AttendanceViewProps = {}) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [knownPeople, setKnownPeople] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Sorting
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Filters
  const [filters, setFilters] = useState<AttendanceFilters>({
    search: '',
    person: 'all',
    dateFrom: '',
    dateTo: '',
    minConfidence: 0,
    class_name: 'all',
    period: 'all'
  });
  
  // Statistics
  const [showStats, setShowStats] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchClasses = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/classes`);
      if (res.data && res.data.status === 'success') {
        setClasses(res.data.classes || []);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    }
  };

  useEffect(() => {
    fetchAttendanceRecords();
    fetchKnownPeople();
    fetchClasses();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [records, filters, sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        refreshAttendanceRecords();
      }, 2000); // Refresh every 2 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchAttendanceRecords = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_BASE_URL}/api/attendance`);
      setRecords(response.data.records || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch attendance records');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchKnownPeople = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/known-faces`);
      setKnownPeople(response.data.people?.map((p: any) => p.name) || []);
    } catch (err) {
      console.error('Failed to fetch known people:', err);
    }
  };

  const refreshAttendanceRecords = async () => {
    try {
      setRefreshing(true);
      const response = await axios.get(`${API_BASE_URL}/api/attendance`);
      setRecords(response.data.records || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to refresh attendance records');
    } finally {
      setRefreshing(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = records.filter(record => {
      // Student-specific scope filter
      if (studentName && record.name.toLowerCase() !== studentName.toLowerCase()) {
        return false;
      }

      // Search filter
      if (filters.search && !record.name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      
      // Person filter
      if (filters.person !== 'all' && record.name !== filters.person) {
        return false;
      }
      
      // Date range filter
      if (filters.dateFrom && record.date < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && record.date > filters.dateTo) {
        return false;
      }
      
      // Confidence filter
      if (record.confidence < filters.minConfidence / 100) {
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
      
      return true;
    });

    // Sort records
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];
      
      if (sortBy === 'confidence') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      } else if (sortBy === 'date') {
        aValue = new Date(aValue + ' ' + a.time);
        bValue = new Date(bValue + ' ' + b.time);
      } else if (sortBy === 'time') {
        aValue = new Date('1970-01-01 ' + aValue);
        bValue = new Date('1970-01-01 ' + bValue);
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredRecords(filtered);
    setPage(0); // Reset to first page when filters change
  };

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      person: 'all',
      dateFrom: '',
      dateTo: '',
      minConfidence: 0,
      class_name: 'all',
      period: 'all'
    });
  };

  const downloadExcel = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/download-attendance`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'attendance_records.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download attendance records');
    }
  };

  const exportFilteredCSV = () => {
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
    a.download = `filtered_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const generateStats = useMemo((): AttendanceStats => {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = filteredRecords.filter(r => r.date === today);
    
    const peopleCount = new Map<string, number>();
    const dayCount = new Map<string, number>();
    let totalConfidence = 0;
    
    filteredRecords.forEach(record => {
      peopleCount.set(record.name, (peopleCount.get(record.name) || 0) + 1);
      dayCount.set(record.date, (dayCount.get(record.date) || 0) + 1);
      totalConfidence += record.confidence;
    });
    
    const mostActivePerson = peopleCount.size > 0 
      ? Array.from(peopleCount.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0]
      : 'N/A';
    
    const mostActiveDay = dayCount.size > 0
      ? Array.from(dayCount.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0]
      : 'N/A';
    
    return {
      totalRecords: filteredRecords.length,
      uniquePeople: peopleCount.size,
      todayRecords: todayRecords.length,
      averageConfidence: filteredRecords.length > 0 ? totalConfidence / filteredRecords.length : 0,
      mostActiveDay,
      mostActivePerson
    };
  }, [filteredRecords]);

  const paginatedRecords = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRecords, page, rowsPerPage]);

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', textAlign: 'center', py: 4 }}>
        <CircularProgress size={40} />
        <Typography variant="body1" sx={{ mt: 2 }}>Loading attendance records...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          📊 Attendance Records
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="Toggle auto-refresh (30s)">
            <IconButton
              onClick={() => setAutoRefresh(!autoRefresh)}
              color={autoRefresh ? 'primary' : 'default'}
              size="small"
            >
              <Refresh />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Refresh now">
            <IconButton
              onClick={refreshAttendanceRecords}
              disabled={refreshing}
              size="small"
            >
              <Refresh className={refreshing ? 'animate-spin' : ''} />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Show statistics">
            <IconButton
              onClick={() => setShowStats(true)}
              size="small"
            >
              <BarChart />
            </IconButton>
          </Tooltip>
          
          {records.length > 0 && (
            <>
              <Button
                variant="outlined"
                startIcon={<GetApp />}
                onClick={downloadExcel}
                size="small"
              >
                Excel
              </Button>
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={exportFilteredCSV}
                size="small"
              >
                CSV
              </Button>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }} 
          onClose={() => setError(null)}
          action={
            <Button color="inherit" size="small" onClick={fetchAttendanceRecords}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Filters */}
      {!studentName && (
        <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterList />
          Filters & Search
          {(filters.search || filters.person !== 'all' || filters.dateFrom || filters.dateTo || filters.minConfidence > 0) && (
            <Chip 
              label="Active" 
              size="small" 
              color="primary" 
              onDelete={clearFilters}
              deleteIcon={<Clear />}
            />
          )}
        </Typography>
        
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <TextField
            label="Search by name"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            size="small"
            sx={{ minWidth: 200, flex: 1 }}
          />
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
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

          <FormControl size="small" sx={{ minWidth: 150 }}>
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

          <FormControl size="small" sx={{ minWidth: 150 }}>
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
            label="From Date"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 150 }}
          />

          <TextField
            label="To Date"
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 150 }}
          />

          <TextField
            label="Min Confidence %"
            type="number"
            value={filters.minConfidence}
            onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: Number(e.target.value) }))}
            inputProps={{ min: 0, max: 100, step: 5 }}
            size="small"
            sx={{ minWidth: 120 }}
          />
        </Box>
      </Card>
      )}

      {/* Summary Cards */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: studentName ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)' },
        gap: 2,
        mb: 3 
      }}>
        <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.50' }}>
          <Typography variant="h4" color="primary" sx={{ fontWeight: 600 }}>
            {filteredRecords.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total Records
          </Typography>
        </Card>
        {!studentName && (
          <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'success.50' }}>
            <Typography variant="h4" color="success.main" sx={{ fontWeight: 600 }}>
              {generateStats.uniquePeople}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Unique People
            </Typography>
          </Card>
        )}
        <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.50' }}>
          <Typography variant="h4" color="warning.main" sx={{ fontWeight: 600 }}>
            {generateStats.todayRecords}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Today
          </Typography>
        </Card>
        <Card sx={{ p: 2, textAlign: 'center', bgcolor: 'info.50' }}>
          <Typography variant="h4" color="info.main" sx={{ fontWeight: 600 }}>
            {(generateStats.averageConfidence * 100).toFixed(0)}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Avg Confidence
          </Typography>
        </Card>
      </Box>

      {/* Records Table */}
      <Card>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Records ({filteredRecords.length})
          </Typography>
          
          {filteredRecords.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary">
                {records.length === 0 ? 'No attendance records found' : 'No records match the current filters'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {records.length === 0 
                  ? 'Start marking attendance to see records here' 
                  : 'Try adjusting your filters or clearing them'
                }
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={sortBy === 'name'}
                          direction={sortBy === 'name' ? sortOrder : 'asc'}
                          onClick={() => handleSort('name')}
                        >
                          Name
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Class</TableCell>
                      <TableCell>Period</TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortBy === 'date'}
                          direction={sortBy === 'date' ? sortOrder : 'asc'}
                          onClick={() => handleSort('date')}
                        >
                          Date
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortBy === 'time'}
                          direction={sortBy === 'time' ? sortOrder : 'asc'}
                          onClick={() => handleSort('time')}
                        >
                          Time
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={sortBy === 'confidence'}
                          direction={sortBy === 'confidence' ? sortOrder : 'asc'}
                          onClick={() => handleSort('confidence')}
                        >
                          Confidence
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRecords.map((record, index) => (
                      <TableRow key={index} hover>
                        <TableCell sx={{ fontWeight: 500 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person fontSize="small" color="primary" />
                            {record.name}
                          </Box>
                        </TableCell>
                         <TableCell>{record.class_name || 'N/A'}</TableCell>
                         <TableCell>{record.period || 'N/A'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Today fontSize="small" color="action" />
                            {record.date}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccessTime fontSize="small" color="primary" />
                            {record.time}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={`${(record.confidence * 100).toFixed(1)}%`}
                            color={
                              record.confidence > 0.8 ? "success" : 
                              record.confidence > 0.6 ? "warning" : "error"
                            }
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            icon={<CheckCircle />}
                            label="Present" 
                            color="success" 
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <TablePagination
                rowsPerPageOptions={[5, 10, 25, 50]}
                component="div"
                count={filteredRecords.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
              />
            </>
          )}
        </Box>
      </Card>

      {/* Statistics Dialog */}
      <Dialog
        open={showStats}
        onClose={() => setShowStats(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          📈 Attendance Statistics
        </DialogTitle>
        <DialogContent>
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: 3 
          }}>
            <Box>
              <Typography variant="body2" color="text.secondary">Total Records</Typography>
              <Typography variant="h5">{generateStats.totalRecords}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Unique People</Typography>
              <Typography variant="h5">{generateStats.uniquePeople}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Today's Records</Typography>
              <Typography variant="h5">{generateStats.todayRecords}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Average Confidence</Typography>
              <Typography variant="h5">{(generateStats.averageConfidence * 100).toFixed(1)}%</Typography>
            </Box>
            <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
              <Typography variant="body2" color="text.secondary">Most Active Person</Typography>
              <Typography variant="h6">{generateStats.mostActivePerson}</Typography>
            </Box>
            <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
              <Typography variant="body2" color="text.secondary">Most Active Day</Typography>
              <Typography variant="h6">{generateStats.mostActiveDay}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowStats(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Summary */}
      <Card sx={{ p: 2, bgcolor: 'grey.50', mt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          <strong>Enhanced View:</strong> Advanced filtering, sorting, pagination, and real-time updates. 
          {autoRefresh && <span> Auto-refresh is enabled (30s interval).</span>}
        </Typography>
      </Card>
    </Box>
  );
}

export default AttendanceView;
