import React, { useState, useEffect } from 'react';
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
  DialogActions
} from '@mui/material';
import { People, Delete, Refresh } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface KnownPerson {
  name: string;
  image_path: string;
  date_added: string;
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

  useEffect(() => {
    fetchKnownFaces();
  }, []);

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
                    sx={{ 
                      width: { xs: 80, sm: 100 }, 
                      height: { xs: 80, sm: 100 }, 
                      mx: 'auto', 
                      mb: 2,
                      border: '3px solid #e3f2fd',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
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
                  
                  <Button
                    variant="outlined"
                    color="error"
                    size={window.innerWidth < 600 ? 'medium' : 'small'}
                    startIcon={<Delete />}
                    onClick={() => setDeleteDialog({ open: true, person })}
                    fullWidth
                    sx={{ fontSize: { xs: '0.875rem', sm: '0.75rem' } }}
                  >
                    Remove
                  </Button>
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
    </Box>
  );
}

export default KnownFaces;
