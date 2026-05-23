import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';

function App() {
  return (
    <Router>
      <div className="app-container">
        <header className="header">
          <h1>SCAN Dashboard</h1>
          <p>Smart Cloud Attendance Network</p>
        </header>

        <main style={{ padding: '0 2rem 2rem 2rem' }}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
