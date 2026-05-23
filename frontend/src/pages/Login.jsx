import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        // Store user info in localStorage for persistence
        localStorage.setItem('user', JSON.stringify(data));
        
        if (data.role === 'teacher') {
          navigate('/teacher');
        } else {
          navigate('/student');
        }
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Could not connect to backend.');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>SCAN Portal</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-muted)' }}>
          Enter 'teacher' for Teacher Dashboard.<br/>Enter your name for Student Dashboard.
        </p>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              placeholder="e.g. John Doe"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>
          
          {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</div>}
          
          <button type="submit" style={{
            padding: '0.75rem',
            marginTop: '1rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-color)',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'opacity 0.2s'
          }}>
            Log In
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
