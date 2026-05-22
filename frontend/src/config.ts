// API Configuration
// In development, CRA proxy (package.json) forwards /api/* to http://127.0.0.1:5002
// In production, use the deployed backend URL
export const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://attendance-backend-y0rt.onrender.com'
    : '');

export const AUDIO_BASE_URL = `${API_BASE_URL}/audio`;
export const IMAGES_BASE_URL = `${API_BASE_URL}/images`;
