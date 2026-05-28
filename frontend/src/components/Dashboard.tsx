import React from 'react';

interface DashboardProps {
  // Add any props you need here
}

const Dashboard: React.FC<DashboardProps> = () => {
  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p>Welcome to the Face Recognition Attendance System Dashboard</p>
      {/* Add your dashboard content here */}
    </div>
  );
};

export default Dashboard;