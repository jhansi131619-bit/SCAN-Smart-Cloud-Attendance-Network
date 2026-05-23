import React, { useState } from 'react';

const CameraFeed = () => {
  const [imageError, setImageError] = useState(false);
  const [isActive, setIsActive] = useState(false); // Default to off for power efficiency
  
  // The backend streams MJPEG on this endpoint
  const streamUrl = '/video_feed';

  return (
    <div className="camera-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem' }}>
         <span style={{color: 'var(--text-muted)'}}>Camera Power Switch</span>
         <button 
           onClick={() => {
             setIsActive(!isActive);
             setImageError(false); // Reset error state on toggle
           }} 
           style={{ 
             padding: '0.5rem 1rem', 
             borderRadius: '8px', 
             cursor: 'pointer', 
             background: isActive ? '#dc2626' : '#16a34a', 
             color: 'white', 
             border: 'none',
             fontWeight: 'bold'
           }}>
           {isActive ? 'Turn Off Camera' : 'Turn On Camera'}
         </button>
      </div>
      <div className="camera-frame">
        {!isActive ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: '#1e293b' }}>
            Camera is powered off. Click "Turn On Camera" to start.
          </div>
        ) : imageError ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#ef4444', background: '#1e293b' }}>
            Cannot connect to camera. Please check backend.
          </div>
        ) : (
          <>
            <img 
              src={streamUrl} 
              alt="Live Camera Feed" 
              onError={() => setImageError(true)}
            />
            <div className="live-indicator">LIVE</div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;
