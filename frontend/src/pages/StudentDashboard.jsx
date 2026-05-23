import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!user || user.role !== 'student') {
      navigate('/');
      return;
    }

    const fetchAttendance = async () => {
      try {
        const response = await fetch(`/api/attendance/${encodeURIComponent(user.name)}`);
        const data = await response.json();
        if (data.status === 'success') {
          // Transform data for the chart: count attendance per day
          const dates = {};
          data.data.forEach(record => {
            dates[record.date] = (dates[record.date] || 0) + 1;
          });
          
          const chartData = Object.keys(dates).map(date => ({
            date: date,
            sessions: dates[date]
          }));
          
          setAttendanceData(chartData);
        }
      } catch (error) {
        console.error("Error fetching attendance:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [user, navigate]);

  if (!user || user.role !== 'student') return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--accent-color)' }}>Student Portal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Welcome back, {user.name}</p>
        </div>
        <button onClick={() => { localStorage.removeItem('user'); navigate('/'); }} style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: '4px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
        <section className="glass-panel" style={{ height: '400px' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Your Attendance History</h2>
          
          {loading ? (
            <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : attendanceData.length === 0 ? (
            <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>No attendance records found.</div>
          ) : (
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={attendanceData}>
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="sessions" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  );
};

export default StudentDashboard;
