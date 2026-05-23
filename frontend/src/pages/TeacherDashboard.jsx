import React from 'react';
import { useNavigate } from 'react-router-dom';
import AttendanceTable from '../components/AttendanceTable';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  if (!user || user.role !== 'teacher') {
    return (
      <div style={{ textAlign: 'center', marginTop: '3rem' }}>
        <h2>Unauthorized Access</h2>
        <button onClick={() => navigate('/')} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Return to Login</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Welcome, {user.name}</h2>
        <button onClick={() => { localStorage.removeItem('user'); navigate('/'); }} style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem' }}>Class Roll Call (Today)</h2>
          </div>
          <AttendanceTable />
        </section>
      </div>
    </div>
  );
};

export default TeacherDashboard;
