import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  Avatar,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Divider,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { People, Delete, Refresh, Edit, Save } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface KnownPerson {
  name: string;
  image_path: string;
  date_added: string;
  class_name?: string;
  email?: string;
  parent_email?: string;
}

function KnownFaces() {
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadStates, setImageLoadStates] = useState<{[key: string]: boolean}>({});
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; person: KnownPerson | null }>({
    open: false,
    person: null
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Edit Profile States
  const [classes, setClasses] = useState<string[]>([]);
  const [editDialog, setEditDialog] = useState<{ open: boolean; person: KnownPerson | null }>({
    open: false,
    person: null
  });
  const [editEmail, setEditEmail] = useState('');
  const [editParentEmail, setEditParentEmail] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Class roster distribution counts
  const classCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    people.forEach((person) => {
      const cls = person.class_name || 'N/A';
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return counts;
  }, [people]);

  useEffect(() => {
    fetchKnownFaces();
    fetchClasses();
  }, []);

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

  const handleOpenEditDialog = (person: KnownPerson) => {
    setEditDialog({ open: true, person });
    setEditEmail(person.email || '');
    setEditParentEmail(person.parent_email || '');
    setEditClass(person.class_name || '');
  };

  const handleUpdatePerson = async () => {
    if (!editDialog.person) return;
    try {
      setEditLoading(true);
      setError(null);
      await axios.post(`${API_BASE_URL}/api/update-person`, {
        name: editDialog.person.name,
        class_name: editClass,
        email: editEmail.trim(),
        parent_email: editParentEmail.trim()
      });
      await fetchKnownFaces();
      setEditDialog({ open: false, person: null });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update person details');
    } finally {
      setEditLoading(false);
    }
  };

  const fetchKnownFaces = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.get(`${API_BASE_URL}/known-faces`);
      setPeople(response.data.people || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch known faces');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePerson = async (person: KnownPerson) => {
    try {
      await axios.delete(`${API_BASE_URL}/delete-person`, {
        data: { name: person.name }
      });
      
      await fetchKnownFaces(); // Refresh the list
      setDeleteDialog({ open: false, person: null });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete person');
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ 
        maxWidth: { xs: '100%', md: 800 }, 
        mx: 'auto', 
        textAlign: 'center', 
        py: { xs: 3, sm: 4 } 
      }}>
        <CircularProgress size={40} />
        <Typography 
          variant="body1" 
          sx={{ 
            mt: 2,
            fontSize: { xs: '0.875rem', sm: '1rem' }
          }}
        >
          Loading known faces...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: { xs: '100%', md: 800 }, mx: 'auto' }}>
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
         Manage People
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: { xs: 2, sm: 3 } }} onClose={() => setError(null)}>
          <Typography sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            {error}
          </Typography>
        </Alert>
      )}

      <Card sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between', 
          alignItems: { xs: 'stretch', sm: 'center' }, 
          mb: { xs: 2, sm: 3 },
          gap: { xs: 2, sm: 0 }
        }}>
          <Typography 
            variant="h6"
            sx={{ fontSize: { xs: '1.125rem', sm: '1.25rem' } }}
          >
            Registered People ({people.length})
          </Typography>
          <Button
            startIcon={<Refresh />}
            onClick={fetchKnownFaces}
            variant="outlined"
            size={window.innerWidth < 600 ? 'medium' : 'small'}
            fullWidth={window.innerWidth < 600}
          >
            Refresh
          </Button>
        </Box>

        {/* Class Distribution Section */}
        {people.length > 0 && Object.keys(classCounts).length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
              🏫 Class Roster Distribution
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1, mt: 1 }}>
              {Object.entries(classCounts).map(([cls, count]) => (
                <Chip
                  key={cls}
                  label={`${cls}: ${count}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ fontWeight: 'bold', py: 1.5 }}
                />
              ))}
            </Stack>
            <Divider sx={{ mt: 2.5 }} />
          </Box>
        )}

        {people.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: { xs: 3, sm: 4 } }}>
            <Typography 
              variant="body1" 
              color="text.secondary"
              sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
            >
              No people registered yet
            </Typography>
            <Typography 
              variant="body2" 
              color="text.secondary" 
              sx={{ 
                mt: 1,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Add people using the "Add Person" tab
            </Typography>
          </Box>
        ) : (
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { 
              xs: '1fr', 
              sm: 'repeat(auto-fit, minmax(280px, 1fr))',
              md: 'repeat(auto-fit, minmax(300px, 1fr))'
            }, 
            gap: { xs: 2, sm: 3 }
          }}>
            {people.map((person, index) => (
              <Card 
                key={index}
                variant="outlined" 
                sx={{ 
                  p: { xs: 2, sm: 3 }, 
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                  border: '1px solid #e3f2fd',
                  '&:hover': { 
                    boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                    transform: 'translateY(-4px)',
                    transition: 'all 0.3s ease',
                    borderColor: '#1976d2'
                  }
                }}
              >
                  <Avatar
                    src={`${API_BASE_URL}/images/${person.image_path}`}
                    onClick={() => setPreviewImage(person.image_path)}
                    sx={{ 
                      width: { xs: 80, sm: 100 }, 
                      height: { xs: 80, sm: 100 }, 
                      mx: 'auto', 
                      mb: 2,
                      border: '3px solid #e3f2fd',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease-in-out',
                      '&:hover': {
                        transform: 'scale(1.08)',
                        boxShadow: '0 6px 12px rgba(25, 118, 210, 0.25)'
                      },
                      '& img': {
                        objectFit: 'cover'
                      }
                    }}
                    onLoad={() => {
                      setImageLoadStates(prev => ({ ...prev, [person.name]: true }));
                    }}
                    onError={(e) => {
                      console.log(`Failed to load image for ${person.name}:`, `${API_BASE_URL}/images/${person.image_path}`);
                      setImageLoadStates(prev => ({ ...prev, [person.name]: false }));
                    }}
                  >
                    <People sx={{ fontSize: { xs: 40, sm: 50 }, color: '#1976d2' }} />
                  </Avatar>
                  
                  <Typography 
                    variant="h6" 
                    gutterBottom 
                    sx={{ 
                      fontWeight: 600,
                      fontSize: { xs: '1rem', sm: '1.25rem' }
                    }}
                  >
                    {person.name}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 600,
                      color: 'primary.main',
                      mb: 0.5,
                      fontSize: { xs: '0.8rem', sm: '0.875rem' }
                    }}
                  >
                    Class: {person.class_name || 'N/A'}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: 'text.secondary',
                      mb: 0.5,
                      fontSize: { xs: '0.75rem', sm: '0.8rem' },
                      wordBreak: 'break-all'
                    }}
                  >
                    {person.email ? `Email: ${person.email}` : 'No email registered'}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: 'text.secondary',
                      mb: 0.5,
                      fontSize: { xs: '0.75rem', sm: '0.8rem' },
                      wordBreak: 'break-all'
                    }}
                  >
                    {person.parent_email ? `Parent: ${person.parent_email}` : 'No parent email'}
                  </Typography>
                  
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ 
                      mb: 2,
                      fontSize: { xs: '0.75rem', sm: '0.875rem' }
                    }}
                  >
                    Added: {new Date(person.date_added).toLocaleDateString()}
                    {imageLoadStates[person.name] === true && (
                      <Box component="span" sx={{ color: 'success.main', ml: 1, fontSize: '0.75rem' }}>
                        ✓ Image loaded
                      </Box>
                    )}
                    {imageLoadStates[person.name] === false && (
                      <Box component="span" sx={{ color: 'warning.main', ml: 1, fontSize: '0.75rem' }}>
                        ⚠ Using default avatar
                      </Box>
                    )}
                  </Typography>
                  
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      startIcon={<Edit />}
                      onClick={() => handleOpenEditDialog(person)}
                      fullWidth
                      sx={{ fontSize: '0.75rem' }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<Delete />}
                      onClick={() => setDeleteDialog({ open: true, person })}
                      fullWidth
                      sx={{ fontSize: '0.75rem' }}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Card>
            ))}
          </Box>
        )}
      </Card>

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
           <strong>Management:</strong> Here you can view all registered people and remove them if needed. 
          Removing a person will delete their face data from the system.
        </Typography>
      </Card>

      {/* Edit Profile Dialog */}
      <Dialog
        open={editDialog.open}
        onClose={() => !editLoading && setEditDialog({ open: false, person: null })}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Edit Student Profile
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Student Name"
              value={editDialog.person?.name || ''}
              disabled
              fullWidth
              variant="outlined"
              helperText="Student name is unique and cannot be changed."
            />
            
            <FormControl fullWidth>
              <InputLabel id="edit-class-label">Class Name</InputLabel>
              <Select
                labelId="edit-class-label"
                value={editClass}
                label="Class Name"
                onChange={(e) => setEditClass(e.target.value)}
                disabled={editLoading}
              >
                <MenuItem value="">None / General</MenuItem>
                {classes.map((cls) => (
                  <MenuItem key={cls} value={cls}>
                    {cls}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Email Address"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              disabled={editLoading}
              fullWidth
              placeholder="e.g. student@school.com"
              variant="outlined"
            />

            <TextField
              label="Parent Email Address"
              type="email"
              value={editParentEmail}
              onChange={(e) => setEditParentEmail(e.target.value)}
              disabled={editLoading}
              fullWidth
              placeholder="e.g. parent@school.com"
              variant="outlined"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setEditDialog({ open: false, person: null })}
            disabled={editLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUpdatePerson}
            color="primary"
            variant="contained"
            disabled={editLoading}
            startIcon={editLoading ? <CircularProgress size={20} color="inherit" /> : <Save />}
          >
            {editLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, person: null })}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontSize: { xs: '1.125rem', sm: '1.25rem' } }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
            Are you sure you want to remove {deleteDialog.person?.name} from the system? 
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
          <Button 
            onClick={() => setDeleteDialog({ open: false, person: null })}
            fullWidth={window.innerWidth < 600}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => deleteDialog.person && handleDeletePerson(deleteDialog.person)}
            color="error"
            variant="contained"
            fullWidth={window.innerWidth < 600}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Image Preview Dialog */}
      <Dialog
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Registered Face Image Preview
          <Button onClick={() => setPreviewImage(null)} color="secondary">
            Close
          </Button>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', p: 2 }}>
          {previewImage && (
            <img
              src={`${API_BASE_URL}/images/${previewImage}`}
              alt="Full face registration"
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                objectFit: 'contain'
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default KnownFaces;
