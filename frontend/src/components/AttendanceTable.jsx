import React, { useEffect, useState } from 'react';

const AttendanceTable = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Poll the backend API every 2 seconds for new attendance records
  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const response = await fetch('/api/attendance');
        const data = await response.json();
        if (data.status === 'success') {
          setRecords(data.data);
        }
      } catch (error) {
        console.error("Error fetching attendance:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
    const intervalId = setInterval(fetchAttendance, 2000);

    return () => clearInterval(intervalId);
  }, []);

  if (loading) {
    return <div className="empty-state">Loading records...</div>;
  }

  return (
    <div className="table-container">
      {records.length === 0 ? (
        <div className="empty-state">
          No attendance marked for today yet.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Time</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={`${record.name}-${record.time}`} className={index === 0 ? "new-row" : ""}>
                <td style={{ fontWeight: 500, color: 'white' }}>{record.name}</td>
                <td>{record.time}</td>
                <td>{record.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AttendanceTable;
