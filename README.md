# Face Recognition Attendance System 🎯

### 🔗 Live Production Web Application: [https://scan-smart-cloud-attendance-network-1.onrender.com](https://scan-smart-cloud-attendance-network-1.onrender.com)
*(Backend API Service: [https://scan-smart-cloud-attendance-network.onrender.com](https://scan-smart-cloud-attendance-network.onrender.com))*

A production-ready web-based face recognition attendance system with React frontend and Flask backend.

## 🚀 Features

- **Modern Web Interface**: React TypeScript with Material-UI components
- **Real-time Face Recognition**: Live camera feed for attendance marking
- **Advanced Person Management**: Add, manage, and view people in the system
- **Comprehensive Attendance Tracking**: Filter, search, and download attendance records
- **Statistics Dashboard**: Real-time analytics and reporting
- **Settings Panel**: Live system monitoring and configuration
- **Production Ready**: Docker support and deployment configurations

## 📁 Project Structure

```
face-attendance-web/
├── frontend/          # React TypeScript application
│   ├── src/
│   │   ├── components/
│   │   │   ├── AttendanceCapture.tsx   # Camera attendance marking
│   │   │   ├── AddPerson.tsx          # Add new people
│   │   │   ├── AttendanceView.tsx     # Advanced attendance viewing
│   │   │   ├── Settings.tsx           # System configuration
│   │   │   └── Reports.tsx            # Analytics and reporting
│   │   └── App.tsx
│   ├── Dockerfile                     # Frontend container
│   └── package.json
├── backend/           # Flask Python API
│   ├── app.py                        # Main application
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Backend container
│   └── .env.production              # Production config
├── docker-compose.yml               # Full stack deployment
├── DEPLOYMENT.md                    # Deployment guide
└── build-production.sh             # Build script
```

## 🛠️ Quick Start

### Option 1: Docker (Recommended)
```bash
# Clone and run with Docker
git clone <your-repo-url>
cd face-attendance-web
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:5002
```

### Option 2: Manual Setup

#### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

#### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## 🎯 How to Use

### 1. **Mark Attendance**
- Access the main attendance capture interface
- Position face in camera view
- System automatically recognizes and marks attendance
- Real-time feedback and confirmation

### 2. **Add New Person**
- Navigate to "Add Person" section
- Enter person details
- Capture multiple photos for better recognition
- System trains model automatically

### 3. **View Records & Analytics**
- Advanced filtering by person, date, confidence
- Real-time statistics dashboard
- Export to Excel with custom date ranges
- Visual analytics and trends

### 4. **System Management**
- Live system status monitoring
- Configuration management
- Face database statistics
- Backup and restore functionality

## 🔧 API Endpoints

Complete REST API with the following endpoints:

### Core Operations
- `GET /api/health` - System health check
- `POST /api/load-faces` - Load and train face recognizer
- `GET /api/known-faces` - Get registered people
- `POST /api/add-face` - Register new person
- `POST /api/recognize-face` - Face recognition
- `POST /api/mark-attendance` - Mark attendance

### Data Management
- `GET /api/attendance` - Retrieve attendance records
- `GET /api/attendance/download` - Export to Excel
- `GET /api/stats` - System statistics
- `POST /api/backup` - Create data backup

### Configuration
- `GET /api/settings` - Get system settings
- `POST /api/settings` - Update configuration
- `GET /api/system-status` - Real-time system status

## 🎨 Technologies Used

### Frontend
- **React 18** with TypeScript
- **Material-UI v5** for modern components
- **React Router** for navigation
- **Axios** for API communication
- **React Webcam** for camera integration

### Backend
- **Flask 3.0** Python web framework
- **OpenCV 4.12** for computer vision
- **pandas** for data processing
- **python-dotenv** for configuration
- **ImageKit** for cloud storage (optional)

### DevOps
- **Docker & Docker Compose** for containerization
- **Production-ready configurations**
- **Environment-based configs**
- **Health checks and monitoring**

## 🚀 Deployment

### Production Deployment
1. **Update environment variables** in `.env.production` files
2. **Build for production**:
   ```bash
   ./build-production.sh
   ```
3. **Deploy using Docker**:
   ```bash
   docker-compose up -d --build
   ```

### Platform-Specific Deployment
- **Heroku**: Deploy backend and frontend separately
- **Railway/Render**: Use provided Dockerfiles
- **AWS/GCP/Azure**: Container deployment
- **Netlify/Vercel**: Frontend static deployment

See `DEPLOYMENT.md` for detailed instructions.

## 📊 System Status

- ✅ Production-ready Flask API backend
- ✅ Modern React frontend with TypeScript
- ✅ Face recognition with OpenCV
- ✅ Real-time attendance marking
- ✅ Advanced filtering and analytics
- ✅ Export and reporting functionality
- ✅ Docker containerization
- ✅ Production deployment configs
- ✅ Comprehensive error handling
- ✅ CORS and security configurations

## 🔒 Security & Privacy

- **Environment-based configuration**
- **CORS protection**
- **Local face data storage**
- **Optional cloud storage integration**
- **Production security settings**

## 🔍 Troubleshooting

### Common Issues
- **Camera permissions**: Grant browser camera access
- **Port conflicts**: Ensure ports 3000 and 5002 are free
- **Docker issues**: Check Docker daemon is running
- **Face recognition**: Ensure good lighting conditions

### Development
```bash
# Check backend logs
docker-compose logs backend

# Check frontend logs
docker-compose logs frontend

# Restart services
docker-compose restart
```

**Your enterprise-ready face recognition system is live! 🎉**

- Frontend: http://localhost:3000
- Backend API: http://localhost:5002
- Documentation: See DEPLOYMENT.md
# attendance
