#!/usr/bin/env python3
"""
Flask API Backend for Face Recognition Attendance System
"""

import os
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'

from flask import Flask, request, jsonify, send_file, Response, send_from_directory
from flask_cors import CORS
import cv2
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import pytz
import os
import base64
import io
from PIL import Image
import json
from imagekitio import ImageKit
from database import db


# Load environment variables from .env file if available
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("Environment variables loaded from .env file")
except ImportError:
    print("python-dotenv not installed. Using system environment variables only.")
    print("Run 'pip install python-dotenv' to use .env file configuration.")

print("Starting Face Attendance Backend Server...")
print("Loading dependencies...done")

# Configuration
if os.path.exists('/app/known_faces'):
    # Running in Docker container
    frontend_dir = '/app/frontend/dist'
else:
    # Running locally
    local_build = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'build'))
    local_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
    frontend_dir = local_build if os.path.exists(local_build) else local_dist

app = Flask(__name__, static_folder=frontend_dir)

# Configure CORS for production
CORS(app, resources={r"/*": {"origins": "*"}})  # Allow all origins for debugging

print("CORS configured to allow all origins")

print("Flask app initialized")

# ImageKit Configuration - Use environment variables for security
imagekit = None
try:
    imagekit_private_key = os.getenv('IMAGEKIT_PRIVATE_KEY')
    imagekit_public_key = os.getenv('IMAGEKIT_PUBLIC_KEY')
    imagekit_url_endpoint = os.getenv('IMAGEKIT_URL_ENDPOINT')
    
    if imagekit_private_key and imagekit_public_key and imagekit_url_endpoint:
        imagekit = ImageKit(
            private_key=imagekit_private_key,
            public_key=imagekit_public_key,
            url_endpoint=imagekit_url_endpoint
        )
        print("ImageKit initialized successfully")
    else:
        print("ImageKit credentials not found in environment variables. Image upload will use local storage only.")
except Exception as e:
    print(f"ImageKit initialization failed: {e}. Continuing with local storage only.")
    imagekit = None

print("ImageKit initialized")

# Configuration
# Check if running in Docker container or locally
if os.path.exists('/app/known_faces'):
    # Running in Docker container
    KNOWN_FACES_DIR = '/app/known_faces'
    ATTENDANCE_FILE = '/app/attendance.xlsx'
    VOICE_DIR = '/app/voice'
else:
    # Running locally
    KNOWN_FACES_DIR = os.path.join(os.path.dirname(__file__), '..', 'projects', 'known_faces')
    ATTENDANCE_FILE = os.path.join(os.path.dirname(__file__), '..', 'attendance.xlsx')
    VOICE_DIR = os.path.join(os.path.dirname(__file__), '..', 'voice')

# Get port from environment variable or use default
PORT = int(os.getenv('PORT', 5000))

print("Configuration loaded")

# Initialize face detector
print("Loading face cascade...")
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
print("Face cascade loaded successfully")

# Initialize OpenCV DNN face detector
print("Loading OpenCV DNN face detector...")
try:
    dnn_net = cv2.dnn.readNetFromCaffe(
        os.path.join(os.path.dirname(__file__), 'models', 'deploy.prototxt'),
        os.path.join(os.path.dirname(__file__), 'models', 'res10_300x300_ssd_iter_140000.caffemodel')
    )
    print("OpenCV DNN loaded successfully")
except Exception as e:
    print(f"Error loading OpenCV DNN: {e}")
    dnn_net = None

# Alternative face recognition using template matching and feature extraction
# This approach works with standard OpenCV without the opencv-contrib extras
print("Initializing face recognition system...")
print("Face recognition modules loaded")

# Global variables for face recognition
known_faces = []
known_names = []
face_labels = []
face_descriptors = []  # Store face feature descriptors
is_trained = False
last_active_frame = None
active_camera_capture = None  # To hold the active VideoCapture object for force-release

# Real-time scan feedback status
last_scanned_status = {
    "name": None,
    "confidence": 0.0,
    "timestamp": None,
    "status": "idle",
    "message": None,
    "audio": None
}

# Try to initialize LBPH Face Recognizer
recognizer = None
use_lbph = False
try:
    print("Loading LBPH face recognizer...", flush=True)
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    use_lbph = True
    print("LBPH Face Recognizer loaded successfully! Using original face recognition.", flush=True)
except AttributeError:
    print("[WARNING] cv2.face is not available. Falling back to custom template/histogram face recognition system.", flush=True)

# Store last attendance time for cooldown
last_attendance = {}

def extract_face_features(face_region):
    """Extract features from a face region using ORB detector"""
    orb = cv2.ORB_create(nfeatures=500)
    keypoints, descriptors = orb.detectAndCompute(face_region, None)
    return keypoints, descriptors

def compute_face_histogram(face_region):
    """Compute histogram features for face comparison"""
    # Convert to different color spaces and compute histograms
    hist_gray = cv2.calcHist([face_region], [0], None, [256], [0, 256])
    
    # Normalize histogram
    hist_gray = cv2.normalize(hist_gray, hist_gray).flatten()
    
    return hist_gray

def compare_faces(face1, face2):
    """Compare two faces using multiple similarity metrics"""
    # Method 1: Template matching
    result = cv2.matchTemplate(face1, face2, cv2.TM_CCOEFF_NORMED)
    template_score = np.max(result)
    
    # Method 2: Histogram comparison
    hist1 = compute_face_histogram(face1)
    hist2 = compute_face_histogram(face2)
    hist_score = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    
    # Method 3: Simple pixel difference (alternative to SSIM)
    # Normalize images to same size if needed
    if face1.shape != face2.shape:
        face2 = cv2.resize(face2, (face1.shape[1], face1.shape[0]))
    
    # Calculate mean squared error
    mse = np.mean((face1.astype(np.float32) - face2.astype(np.float32)) ** 2)
    # Convert MSE to similarity score (lower MSE = higher similarity)
    mse_score = max(0, 1 - (mse / 10000))  # Normalize MSE to 0-1 range
    
    # Combine scores (weighted average)
    combined_score = (template_score * 0.5 + hist_score * 0.3 + mse_score * 0.2)
    
    return combined_score

def find_best_match(face_region, threshold=0.45):
    """Find the best matching face from known faces with dynamic threshold"""
    if len(known_faces) == 0 or not is_trained:
        return None, 0.0
        
    if use_lbph and recognizer is not None:
        try:
            label, distance = recognizer.predict(face_region)
            print(f"[LBPH] Predicted label: {label}, distance: {distance}", flush=True)
            
            # Map distance to 0-1 similarity score
            # A distance of 0 is 100% similarity. Let's use 190.0 as standard cutoff for high accuracy.
            similarity = max(0.0, min(1.0, 1.0 - (distance / 190.0)))
            
            if label in face_labels:
                idx = face_labels.index(label)
                if similarity >= threshold:
                    return idx, similarity
                else:
                    print(f"[LBPH] Face recognized as {known_names[idx]} but similarity {similarity:.2f} below threshold {threshold:.2f}", flush=True)
                    return None, similarity
        except Exception as e:
            print(f"Error predicting with LBPH recognizer: {e}. Falling back to custom matcher.", flush=True)

    # Fallback to custom template/histogram matcher
    best_score = 0.0
    best_match_idx = -1
    
    for i, known_face in enumerate(known_faces):
        try:
            score = compare_faces(face_region, known_face)
            if score > best_score:
                best_score = score
                best_match_idx = i
        except Exception as e:
            print(f"Error comparing with face {i}: {e}")
            continue
    
    if best_match_idx >= 0 and best_score >= threshold:  # Dynamic threshold
        return best_match_idx, best_score
    
    return None, best_score

def get_indian_time():
    """Get current time in Indian Standard Time (IST)"""
    ist = pytz.timezone('Asia/Kolkata')
    return datetime.now(ist)

def load_known_faces():
    """Load and train the face recognizer with known faces"""
    global known_faces, known_names, face_labels, is_trained
    
    known_faces = []
    known_names = []
    face_labels = []
    
    if not os.path.exists(KNOWN_FACES_DIR):
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        return False
    
    label_counter = 0
    for filename in os.listdir(KNOWN_FACES_DIR):
        if filename.endswith('.jpg') or filename.endswith('.png'):
            image_path = os.path.join(KNOWN_FACES_DIR, filename)
            image = cv2.imread(image_path)
            
            if image is not None:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                # Improved face detection parameters
                faces = face_cascade.detectMultiScale(
                    gray, 
                    scaleFactor=1.1, 
                    minNeighbors=5, 
                    minSize=(30, 30),
                    maxSize=(300, 300)
                )
                
                if len(faces) > 0:
                    # Take the largest face (most likely the main subject)
                    largest_face = max(faces, key=lambda face: face[2] * face[3])
                    x, y, w, h = largest_face
                    
                    # Add some padding around the face
                    padding = 10
                    x = max(0, x - padding)
                    y = max(0, y - padding)
                    w = min(gray.shape[1] - x, w + 2 * padding)
                    h = min(gray.shape[0] - y, h + 2 * padding)
                    
                    face_region = gray[y:y+h, x:x+w]
                    # Standardize face size for better recognition
                    face_region = cv2.resize(face_region, (150, 150))
                    
                    # Apply histogram equalization for better lighting normalization
                    face_region = cv2.equalizeHist(face_region)
                    # Apply Gaussian blur to reduce noise
                    face_region = cv2.GaussianBlur(face_region, (3, 3), 0)
                    
                    known_faces.append(face_region)
                    name = filename.split('.')[0]
                    # Strip any angle suffixes (e.g. _front, _left, _right, _up, _down) for training mapping
                    for suffix in ['_front', '_left', '_right', '_up', '_down', '_smile', '_tilt']:
                        if name.endswith(suffix):
                            name = name[:-len(suffix)]
                            break
                    known_names.append(name)
                    face_labels.append(label_counter)
                    
                    print(f"Loaded face for: {name} (Label: {label_counter})")
                    label_counter += 1
                else:
                    print(f"No face detected in {filename}. Trying with different parameters...")
                    # Try with more relaxed parameters for difficult images
                    faces_relaxed = face_cascade.detectMultiScale(
                        gray, 
                        scaleFactor=1.05, 
                        minNeighbors=3, 
                        minSize=(20, 20),
                        maxSize=(400, 400)
                    )
                    
                    if len(faces_relaxed) > 0:
                        print(f"Face detected with relaxed parameters for {filename}")
                        largest_face = max(faces_relaxed, key=lambda face: face[2] * face[3])
                        x, y, w, h = largest_face
                        
                        # Add some padding around the face
                        padding = 10
                        x = max(0, x - padding)
                        y = max(0, y - padding)
                        w = min(gray.shape[1] - x, w + 2 * padding)
                        h = min(gray.shape[0] - y, h + 2 * padding)
                        
                        face_region = gray[y:y+h, x:x+w]
                        face_region = cv2.resize(face_region, (150, 150))
                        face_region = cv2.equalizeHist(face_region)
                        face_region = cv2.GaussianBlur(face_region, (3, 3), 0)
                        
                        known_faces.append(face_region)
                        name = filename.split('.')[0]
                        # Strip any angle suffixes (e.g. _front, _left, _right, _up, _down) for training mapping
                        for suffix in ['_front', '_left', '_right', '_up', '_down', '_smile', '_tilt']:
                            if name.endswith(suffix):
                                name = name[:-len(suffix)]
                                break
                        known_names.append(name)
                        parent_label = label_counter
                        face_labels.append(label_counter)
                        
                        print(f"Loaded face for: {name} (Label: {label_counter}) with relaxed detection")
                        label_counter += 1
                    else:
                        print(f"Still no face detected in {filename}. Skipping...")
    
    if len(known_faces) > 0:
        if use_lbph and recognizer is not None:
            print(f"Training LBPH recognizer with {len(known_faces)} faces...", flush=True)
            recognizer.train(known_faces, np.array(face_labels))
        else:
            print(f"Face database loaded with {len(known_faces)} faces (custom matcher mode)...", flush=True)
        is_trained = True
        print(f"Training completed. Names: {known_names}")
        print(f"Labels: {face_labels}")
        return True
    
    print("No faces found for training")
    return False

def detect_liveness(face_region_bgr, threshold=60.0):
    """
    Computes texture Laplacian variance to identify flat printed paper or screens.
    Also analyzes standard deviation of color to prevent spoofing.
    Returns (is_real, score)
    """
    if face_region_bgr is None or face_region_bgr.size == 0:
        return False, 0.0
    
    try:
        # Convert to gray for texture sharpness check
        gray = cv2.cvtColor(face_region_bgr, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        # Color standard deviation analysis
        _, stddev = cv2.meanStdDev(face_region_bgr)
        avg_stddev = np.mean(stddev)
        
        # Real human faces show sharp facial lines/features and rich color variances
        # threshold defaults to 60.0. Higher means stricter checking.
        is_real = (laplacian_var >= threshold) and (avg_stddev > 10.0)
        
        print(f"[LIVENESS] Score: {laplacian_var:.2f}, Color StdDev: {avg_stddev:.2f}, Threshold: {threshold}, IsReal: {is_real}")
        return is_real, float(laplacian_var)
    except Exception as e:
        print(f"[LIVENESS] Error running liveness: {e}")
        return True, 100.0  # Fallback to true if calculations fail

def base64_to_cv2(base64_str):
    """Convert base64 string to OpenCV image"""
    try:
        # Remove data URL prefix if present
        if 'data:image' in base64_str:
            base64_str = base64_str.split(',')[1]
        
        # Decode base64
        img_data = base64.b64decode(base64_str)
        img_array = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error converting base64 to CV2: {e}")
        return None

def upload_image_to_imagekit(image, filename):
    """Upload image to ImageKit and return the CDN URL"""
    if not imagekit:
        print("ImageKit not configured, using local storage only")
        return "local_storage_fallback"
    
    try:
        # Convert OpenCV image to bytes
        _, buffer = cv2.imencode('.jpg', image)
        image_bytes = buffer.tobytes()
        
        print(f"Uploading {filename} to ImageKit...")
        
        # Try upload without options first
        try:
            upload_result = imagekit.upload(
                file=image_bytes,
                file_name=filename
            )
        except Exception as e1:
            print(f"Simple upload failed: {e1}")
            # Try with options as kwargs instead of dict
            try:
                upload_result = imagekit.upload(
                    file=image_bytes,
                    file_name=filename,
                    is_private_file=False,
                    folder="known_faces"
                )
            except Exception as e2:
                print(f"Upload with kwargs failed: {e2}")
                return "local_storage_fallback"
        
        print(f"Upload result type: {type(upload_result)}")
        print(f"Upload result: {upload_result}")
        
        # Extract URL from the response
        if hasattr(upload_result, 'url'):
            url = upload_result.url
            print(f"Upload successful: {url}")
            return url
        elif hasattr(upload_result, 'response_metadata'):
            response_data = upload_result.response_metadata
            if hasattr(response_data, 'url'):
                url = response_data.url
                print(f"Upload successful: {url}")
                return url
        
        print(f"Could not extract URL from upload result: {upload_result}")
        return "local_storage_fallback"
        
    except Exception as e:
        print(f"Error uploading to ImageKit: {e}")
        import traceback
        traceback.print_exc()
        
        # For now, let's skip ImageKit upload and just save locally
        print("Falling back to local storage only...")
        return "local_storage_fallback"

def save_attendance(name, confidence):
    """Save attendance record to MongoDB Atlas"""
    try:
        success, msg = db.mark_attendance(name, confidence)
        return success
    except Exception as e:
        print(f"Error saving attendance: {e}")
        return False


# Routes
@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "message": "Face Recognition API is running"})

@app.route('/api/login', methods=['POST'])
def api_login():
    """Login endpoint for SCAN frontend"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username:
            return jsonify({"status": "error", "message": "Username is required"}), 400
        if not password:
            return jsonify({"status": "error", "message": "Password is required"}), 400
            
        if username.lower() == 'teacher':
            if password == 'teacher123':
                return jsonify({
                    "status": "success",
                    "role": "teacher",
                    "name": "Teacher"
                })
            else:
                return jsonify({"status": "error", "message": "Invalid password for teacher account"}), 401
        else:
            # Student password must be exactly username + 123
            expected_student_password = f"{username}123"
            if password == expected_student_password:
                return jsonify({
                    "status": "success",
                    "role": "student",
                    "name": username
                })
            else:
                return jsonify({"status": "error", "message": f"Invalid password. For student login, please use your name + '123' (e.g. {username}123)"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/debug', methods=['GET'])
def debug_info():
    """Debug endpoint to check face data status"""
    try:
        mongo_connected = db.attendance_collection is not None
        return jsonify({
            "known_faces_dir": KNOWN_FACES_DIR,
            "dir_exists": os.path.exists(KNOWN_FACES_DIR),
            "files_in_dir": os.listdir(KNOWN_FACES_DIR) if os.path.exists(KNOWN_FACES_DIR) else [],
            "known_faces_count": len(known_faces),
            "known_names": known_names,
            "face_labels": face_labels,
            "mongo_atlas_connected": mongo_connected,
            "mongo_uri_configured": bool(os.getenv("MONGO_URI"))
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files"""
    try:
        audio_path = os.path.join(VOICE_DIR, filename)
        if os.path.exists(audio_path):
            return send_file(audio_path, mimetype='audio/wav')
        else:
            return jsonify({"error": "Audio file not found"}), 404
    except Exception as e:
        return jsonify({"error": f"Error serving audio: {str(e)}"}), 500

@app.route('/images/<filename>')
def serve_image(filename):
    """Serve face images"""
    try:
        image_path = os.path.join(KNOWN_FACES_DIR, filename)
        if os.path.exists(image_path):
            # Determine MIME type based on file extension
            if filename.lower().endswith('.png'):
                mimetype = 'image/png'
            elif filename.lower().endswith(('.jpg', '.jpeg')):
                mimetype = 'image/jpeg'
            else:
                mimetype = 'image/jpeg'  # Default to JPEG
            
            return send_file(image_path, mimetype=mimetype)
        else:
            return jsonify({"error": "Image file not found"}), 404
    except Exception as e:
        return jsonify({"error": f"Error serving image: {str(e)}"}), 500

@app.route('/add-person', methods=['POST'])
def add_person():
    """Add a new person to the system"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        image_data = data.get('image')
        angle = data.get('angle', '').strip()
        
        print(f"Add person request received - Name: {name}, Angle: {angle}")
        print(f"Known faces directory: {KNOWN_FACES_DIR}")
        print(f"Directory exists: {os.path.exists(KNOWN_FACES_DIR)}")
        
        if not name or not image_data:
            return jsonify({"success": False, "message": "Name and image are required"}), 400
        
        # Convert base64 to OpenCV image
        image = base64_to_cv2(image_data)
        if image is None:
            return jsonify({"success": False, "message": "Invalid image data"}), 400
        
        print(f"Image converted successfully, size: {image.shape}")
        
        # Detect faces in the image
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Use same detection parameters as training and recognition
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30),
            maxSize=(300, 300)
        )
        
        print(f"Faces detected: {len(faces)}")
        
        if len(faces) == 0:
            print("[VISION] Strict detection failed in add_person. Retrying with relaxed parameters...")
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.05, 
                minNeighbors=3, 
                minSize=(20, 20),
                maxSize=(400, 400)
            )
            print(f"Faces detected after relaxation: {len(faces)}")
            
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected in the image. Please make sure your face is clearly visible."}), 400
        
        # Upload image to ImageKit instead of saving locally
        filename = f"{name}_{angle}.jpg" if angle else f"{name}.jpg"
        imagekit_url = upload_image_to_imagekit(image, filename)
        
        if not imagekit_url or imagekit_url == "local_storage_fallback":
            print("ImageKit upload failed or not available, continuing with local storage...")
            imagekit_url = "Local storage only"
        else:
            print(f"Image uploaded to ImageKit: {imagekit_url}")
        
        # Also save locally for face recognition training (always required)
        filepath = os.path.join(KNOWN_FACES_DIR, filename)
        print(f"Saving local copy for training: {filepath}")
        
        # Ensure directory exists
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        
        success = cv2.imwrite(filepath, image)
        print(f"Local save successful: {success}")
        
        if not success:
            return jsonify({"success": False, "message": "Failed to save local training copy"}), 500
        
        # Reload faces to include the new person
        load_success = load_known_faces()
        print(f"Model retraining successful: {load_success}")
        
        # Auto-mark attendance for the newly registered person
        attendance_success, msg = db.mark_attendance(name, 1.0)
        print(f"Auto-marked attendance for new person: {attendance_success} ({msg})")
        
        return jsonify({
            "success": True,
            "message": f"Person '{name}' added successfully and attendance marked",
            "filename": filename,
            "imagekit_url": imagekit_url,
            "local_filepath": filepath
        })
        
    except Exception as e:
        print(f"Error in add_person: {str(e)}")
        return jsonify({"success": False, "message": f"Error adding person: {str(e)}"}), 500

@app.route('/add-person-backend', methods=['POST'])
def add_person_backend():
    """Add a new person using the backend camera (either current live frame or grab a new one)"""
    global last_active_frame
    try:
        data = request.json
        name = data.get('name', '').strip()
        angle = data.get('angle', '').strip()
        
        print(f"Add person backend request received - Name: {name}, Angle: {angle}")
        
        if not name:
            return jsonify({"success": False, "message": "Name is required"}), 400
        
        image = None
        # 1. Try to use the last active frame from the stream
        if last_active_frame is not None:
            image = last_active_frame.copy()
            print("[VISION] Using last active frame from streaming camera")
        else:
            # 2. If stream is not active, open camera temporarily to grab a frame
            print("[VISION] Stream not active. Opening camera temporarily...")
            temp_cap = cv2.VideoCapture(0)
            if not temp_cap.isOpened():
                temp_cap = cv2.VideoCapture(1)
            
            if temp_cap.isOpened():
                # Grab a few frames to let the auto-exposure adjust
                for _ in range(5):
                    success, temp_frame = temp_cap.read()
                if success:
                    image = temp_frame
                temp_cap.release()
        
        if image is None:
            return jsonify({"success": False, "message": "Camera is not active and failed to initialize"}), 500
        
        # Convert OpenCV image to gray for face detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces with strict parameters
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30),
            maxSize=(300, 300)
        )
        
        if len(faces) == 0:
            print("[VISION] Strict detection failed in backend add. Retrying with relaxed parameters...")
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.05, 
                minNeighbors=3, 
                minSize=(20, 20),
                maxSize=(400, 400)
            )
        
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected in backend camera view. Please make sure you are in front of the camera and looking directly at it."}), 400
        
        # Upload image to ImageKit instead of saving locally (optional, fallback to local)
        filename = f"{name}_{angle}.jpg" if angle else f"{name}.jpg"
        imagekit_url = upload_image_to_imagekit(image, filename)
        
        if not imagekit_url or imagekit_url == "local_storage_fallback":
            print("ImageKit upload failed or not available, continuing with local storage...")
            imagekit_url = "Local storage only"
        else:
            print(f"Image uploaded to ImageKit: {imagekit_url}")
        
        # Also save locally for face recognition training (always required)
        filepath = os.path.join(KNOWN_FACES_DIR, filename)
        print(f"Saving local copy for training: {filepath}")
        
        # Ensure directory exists
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        
        success = cv2.imwrite(filepath, image)
        print(f"Local save successful: {success}")
        
        if not success:
            return jsonify({"success": False, "message": "Failed to save local training copy"}), 500
        
        # Reload faces to include the new person
        load_success = load_known_faces()
        print(f"Model retraining successful: {load_success}")
        
        # Auto-mark attendance for the newly registered person
        attendance_success, msg = db.mark_attendance(name, 1.0)
        print(f"Auto-marked attendance for new person: {attendance_success} ({msg})")
        
        return jsonify({
            "success": True,
            "message": f"Person '{name}' added successfully and attendance marked",
            "filename": filename,
            "imagekit_url": imagekit_url,
            "local_filepath": filepath
        })
        
    except Exception as e:
        print(f"Error in add_person_backend: {str(e)}")
        return jsonify({"success": False, "message": f"Error adding person via backend camera: {str(e)}"}), 500

@app.route('/api/camera-control/stop', methods=['POST', 'GET'])
def stop_camera():
    global active_camera_capture, last_scanned_status
    try:
        # Reset scanned status when camera stops
        last_scanned_status.update({
            "name": None,
            "confidence": 0.0,
            "timestamp": None,
            "status": "idle",
            "message": None,
            "audio": None
        })
        if active_camera_capture is not None:
            print("[VISION] Force-releasing camera by admin/system trigger...", flush=True)
            active_camera_capture.release()
            active_camera_capture = None
            return jsonify({"success": True, "message": "Camera released successfully"})
        else:
            return jsonify({"success": True, "message": "Camera was not active"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Error releasing camera: {str(e)}"}), 500

@app.route('/model-status', methods=['GET'])
def get_model_status():
    """Get the current status of the face recognition model"""
    try:
        return jsonify({
            "is_trained": is_trained,
            "known_faces_count": len(known_faces),
            "known_names": list(set(known_names)),
            "labels": face_labels,
            "known_faces_dir": KNOWN_FACES_DIR,
            "files_in_dir": os.listdir(KNOWN_FACES_DIR) if os.path.exists(KNOWN_FACES_DIR) else []
        })
    except Exception as e:
        return jsonify({"error": f"Error getting model status: {str(e)}"}), 500

@app.route('/api/debug-model', methods=['GET'])
def debug_model():
    """Debug endpoint to check model status"""
    try:
        return jsonify({
            "is_trained": is_trained,
            "num_known_faces": len(known_faces),
            "known_names": known_names,
            "face_labels": face_labels,
            "known_faces_dir": KNOWN_FACES_DIR,
            "files_in_dir": os.listdir(KNOWN_FACES_DIR) if os.path.exists(KNOWN_FACES_DIR) else []
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/retrain-model', methods=['POST'])
def retrain_model():
    """Manually retrain the face recognition model"""
    try:
        success = load_known_faces()
        if success:
            return jsonify({
                "success": True,
                "message": f"Model retrained successfully with {len(known_faces)} faces",
                "known_names": known_names
            })
        else:
            return jsonify({
                "success": False,
                "message": "No faces found for training"
            }), 400
    except Exception as e:
        return jsonify({"success": False, "message": f"Error retraining model: {str(e)}"}), 500

@app.route('/mark-attendance', methods=['POST'])
@app.route('/api/mark-attendance', methods=['POST'])
def mark_attendance():
    """Mark attendance from webcam image"""
    try:
        print("=== Mark Attendance Request ===")
        data = request.json
        image_data = data.get('image')
        
        if not image_data:
            print("Error: No image data provided")
            return jsonify({"success": False, "message": "Image data is required"}), 400
        
        if not is_trained:
            print("Error: No faces trained")
            return jsonify({"success": False, "message": "No known faces available for recognition"}), 400
        
        print(f"Processing image data (length: {len(image_data) if image_data else 0})")
        print(f"Known faces: {len(known_faces)}, Names: {known_names}")
        
        # Convert base64 to OpenCV image
        image = base64_to_cv2(image_data)
        if image is None:
            print("Error: Failed to decode image")
            return jsonify({"success": False, "message": "Invalid image data"}), 400
        
        # Convert to grayscale and detect faces
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Improved face detection parameters
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30),
            maxSize=(300, 300)
        )
        
        if len(faces) == 0:
            return jsonify({
                "success": False, 
                "message": "No face detected",
                "audio": "person_not_detected"
            })
        
        # Process the largest face (most likely the main subject)
        largest_face = max(faces, key=lambda face: face[2] * face[3])
        x, y, w, h = largest_face
        
        # Add some padding around the face
        padding = 10
        x = max(0, x - padding)
        y = max(0, y - padding)
        w = min(gray.shape[1] - x, w + 2 * padding)
        h = min(gray.shape[0] - y, h + 2 * padding)
        
        face_region = gray[y:y+h, x:x+w]
        face_region = cv2.resize(face_region, (150, 150))
        # Apply histogram equalization for consistency with training
        face_region = cv2.equalizeHist(face_region)
        # Apply Gaussian blur to reduce noise
        face_region = cv2.GaussianBlur(face_region, (3, 3), 0)
        
        # Get threshold dynamically from request data, default to 0.45 (45%)
        threshold = data.get('threshold', 0.45)
        
        # Find best match using our custom face recognition with dynamic threshold
        match_idx, confidence_score = find_best_match(face_region, threshold)
        
        print(f"Recognition result - Match Index: {match_idx}, Confidence: {confidence_score}, Threshold: {threshold}")
        print(f"Available faces: {len(known_faces)}")
        print(f"Available names: {known_names}")
        
        if match_idx is not None and confidence_score >= threshold:
            recognized_name = known_names[match_idx]
            print(f"Person recognized: {recognized_name} with confidence: {confidence_score}")
            
            # Check local memory cooldown first
            current_time = get_indian_time()
            last_time = last_attendance.get(recognized_name)
            
            allow_multiple = os.getenv("ALLOW_MULTIPLE_ATTENDANCE", "true").lower() == "true"
            if not allow_multiple and last_time and (current_time - last_time).total_seconds() < 60:
                remaining_seconds = 60 - int((current_time - last_time).total_seconds())
                return jsonify({
                    "success": False,
                    "name": recognized_name,
                    "confidence": confidence_score,
                    "message": f"Attendance already marked. Please wait {remaining_seconds} seconds.",
                    "cooldown": True,
                    "remaining_seconds": remaining_seconds,
                    "audio": "attendance_is_already_marked",
                    "face_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                })
            
            # Save attendance to DB and get detailed response
            success, db_msg = db.mark_attendance(recognized_name, confidence_score)
            
            if success:
                last_attendance[recognized_name] = current_time
                return jsonify({
                    "success": True,
                    "name": recognized_name,
                    "confidence": confidence_score,
                    "message": f"Attendance marked for {recognized_name}",
                    "audio": "attendance_marked",
                    "face_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                })
            else:
                if "already marked" in db_msg.lower() or "duplicate" in db_msg.lower():
                    # Cooldown state from DB check
                    remaining_seconds = 60
                    if last_time:
                        remaining_seconds = max(0, 60 - int((current_time - last_time).total_seconds()))
                    return jsonify({
                        "success": False,
                        "name": recognized_name,
                        "confidence": confidence_score,
                        "message": f"Attendance already marked for {recognized_name}",
                        "cooldown": True,
                        "remaining_seconds": remaining_seconds,
                        "audio": "attendance_is_already_marked",
                        "face_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                    })
                else:
                    return jsonify({
                        "success": False, 
                        "message": db_msg,
                        "face_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                    }), 500
        else:
            print(f"Face not recognized - Confidence: {confidence_score}, Threshold: {threshold}")
            return jsonify({
                "success": False, 
                "message": "Face not recognized",
                "audio": "person_not_detected",
                "face_rect": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
            })
        
    except Exception as e:
        print(f"Error in mark_attendance: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error marking attendance: {str(e)}"}), 500

@app.route('/attendance-records', methods=['GET'])
@app.route('/api/attendance', methods=['GET'])
def get_attendance_records():
    """Get attendance records from MongoDB"""
    try:
        records = db.get_attendance_records()
        return jsonify({
            "status": "success",
            "records": records, 
            "data": records,
            "count": len(records)
        })
    except Exception as e:
        return jsonify({"success": False, "status": "error", "message": f"Error getting attendance: {str(e)}"}), 500

@app.route('/api/attendance/<student_name>', methods=['GET'])
def get_student_attendance(student_name):
    """Get attendance records for a specific student"""
    try:
        records = db.get_attendance_records()
        student_records = [r for r in records if r.get('name', '').lower() == student_name.lower()]
        return jsonify({
            "status": "success",
            "data": student_records,
            "count": len(student_records)
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/download-attendance', methods=['GET'])
def download_attendance():
    """Download attendance records as Excel file built dynamically from MongoDB"""
    try:
        records = db.get_attendance_records()
        if not records:
            return jsonify({"success": False, "message": "No attendance records found"}), 404
        
        # Build pandas DataFrame
        df = pd.DataFrame(records)
        # Capitalize columns to match original Name, Date, Time, Confidence
        df.columns = [col.capitalize() for col in df.columns]
        
        # Save to buffer
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Attendance')
        output.seek(0)
        
        # Send the Excel file
        return send_file(
            output,
            as_attachment=True,
            download_name=f"attendance_records_{get_indian_time().strftime('%Y%m%d_%H%M%S')}.xlsx",
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({"success": False, "message": f"Error downloading file: {str(e)}"}), 500


@app.route('/known-faces', methods=['GET'])
def get_known_faces_list():
    """Get list of known faces"""
    try:
        people = []
        if os.path.exists(KNOWN_FACES_DIR):
            for filename in os.listdir(KNOWN_FACES_DIR):
                if filename.endswith('.jpg') or filename.endswith('.png'):
                    filepath = os.path.join(KNOWN_FACES_DIR, filename)
                    stat = os.stat(filepath)
                    people.append({
                        "name": filename.split('.')[0],
                        "image_path": filename,
                        "date_added": datetime.fromtimestamp(stat.st_ctime).isoformat()
                    })
        
        return jsonify({"people": people, "count": len(people)})
        
    except Exception as e:
        return jsonify({"success": False, "message": f"Error getting known faces: {str(e)}"}), 500

@app.route('/delete-person', methods=['DELETE'])
def delete_person():
    """Delete a person from the system"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({"success": False, "message": "Name is required"}), 400
        
        # Find and delete the image file
        deleted = False
        for filename in os.listdir(KNOWN_FACES_DIR):
            if filename.startswith(name + '.') and (filename.endswith('.jpg') or filename.endswith('.png')):
                filepath = os.path.join(KNOWN_FACES_DIR, filename)
                os.remove(filepath)
                deleted = True
                break
        
        if not deleted:
            return jsonify({"success": False, "message": f"Person '{name}' not found"}), 404
        
        # Reload faces
        load_known_faces()
        
        return jsonify({
            "success": True,
            "message": f"Person '{name}' deleted successfully"
        })
        
    except Exception as e:
        return jsonify({"success": False, "message": f"Error deleting person: {str(e)}"}), 500

@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    """Get attendance statistics from MongoDB Atlas"""
    try:
        stats = db.get_statistics()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"success": False, "message": f"Error getting statistics: {str(e)}"}), 500

@app.route('/api/backup', methods=['POST'])
def backup_data():
    """Create a backup of MongoDB Atlas attendance data to a local JSON file"""
    try:
        backup_dir = os.path.join(os.path.dirname(__file__), '..', 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = get_indian_time().strftime('%Y%m%d_%H%M%S')
        backup_file = os.path.join(backup_dir, f'attendance_backup_{timestamp}.json')
        
        records = db.get_attendance_records()
        with open(backup_file, 'w') as f:
            json.dump(records, f, indent=4)
            
        return jsonify({
            "success": True,
            "message": "MongoDB backup created successfully",
            "backup_file": backup_file,
            "timestamp": timestamp
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"Error creating backup: {str(e)}"}), 500

def generate_frames(threshold=0.45):
    """Yields MJPEG frames with real-time OpenCV detection and face recognition overlay."""
    global last_active_frame, active_camera_capture
    
    # Prevent concurrent camera streams from creating hardware lock contentions and C++ level crashes
    if active_camera_capture is not None:
        print("[VISION] WARNING: Camera is already actively captured. Aborting second stream request to prevent contention.", flush=True)
        return

    print(f"[VISION] Client connected with threshold={threshold}. Powering ON camera...", flush=True)
    
    try:
        video_capture = cv2.VideoCapture(0)
    except Exception as e:
        print(f"[VISION] ERROR: Failed to instantiate primary video capture: {e}", flush=True)
        return
    video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    video_capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))

    if not video_capture.isOpened():
        print("[VISION] Fallback: Trying secondary camera...", flush=True)
        video_capture = cv2.VideoCapture(1)
        video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        video_capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))

    if not video_capture.isOpened():
        print("[VISION] ERROR: No camera devices could be opened! Terminating stream.", flush=True)
        return

    active_camera_capture = video_capture
    frame_count = 0
    
    try:
        while True:
            # Check if camera has been released externally
            if active_camera_capture is None:
                print("[VISION] Camera released externally. Terminating stream.")
                break
                
            if not video_capture.isOpened():
                print("[VISION] ERROR: Camera was closed. Terminating stream.")
                break

            success, frame = video_capture.read()
            if not success or frame is None:
                print("[VISION] ERROR: Failed to grab frame from camera!")
                break

            # Cache the latest frame copy for the backend registration endpoint
            last_active_frame = frame.copy()

            # Convert to grayscale for Haar Cascade face detection
            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect faces
            faces = face_cascade.detectMultiScale(
                gray_frame,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            frame_count += 1

            for (x, y, w, h) in faces:
                # Add some padding around the face
                padding = 10
                fx = max(0, x - padding)
                fy = max(0, y - padding)
                fw = min(gray_frame.shape[1] - fx, w + 2 * padding)
                fh = min(gray_frame.shape[0] - fy, h + 2 * padding)
                
                face_region = gray_frame[fy:fy+fh, fx:fx+fw]
                if face_region.size > 0:
                    face_region = cv2.resize(face_region, (150, 150))
                    face_region = cv2.equalizeHist(face_region)
                    face_region = cv2.GaussianBlur(face_region, (3, 3), 0)

                    # Check if we have trained faces loaded
                    name = "Unknown"
                    confidence = 0
                    
                    # Extract BGR face region for liveness checking
                    face_region_bgr = frame[fy:fy+fh, fx:fx+fw]
                    is_liveness_real, liveness_score = detect_liveness(face_region_bgr, threshold=60.0)
                    
                    if is_trained and len(known_faces) > 0:
                        match_idx, confidence_score = find_best_match(face_region, threshold)
                        if match_idx is not None and confidence_score >= threshold:
                            name = known_names[match_idx]
                            # The face_recognition.face_distance() returns a distance metric
                            face_distance = 1.0 - confidence_score
                            confidence = round((1 - face_distance) * 100)

                    # Update real-time scan feedback status and db log on a fixed cadence
                    if frame_count % 15 == 0:
                        now_iso = datetime.now().isoformat()
                        if name != "Unknown":
                            if is_liveness_real:
                                # Log to DB (optimistic duplicate check is inside db.mark_attendance)
                                success, db_msg = db.mark_attendance(name, confidence / 100.0)
                                
                                if success:
                                    last_scanned_status.update({
                                        "name": name,
                                        "confidence": float(confidence) / 100.0,
                                        "timestamp": now_iso,
                                        "status": "success",
                                        "message": f"Attendance marked for {name}",
                                        "audio": "attendance_marked"
                                    })
                                    print(f"[VISION] Attendance marked: {name} ({confidence}%)", flush=True)
                                else:
                                    if "already marked" in db_msg.lower() or "duplicate" in db_msg.lower():
                                        last_scanned_status.update({
                                            "name": name,
                                            "confidence": float(confidence) / 100.0,
                                            "timestamp": now_iso,
                                            "status": "cooldown",
                                            "message": f"Attendance already marked for {name}",
                                            "audio": "attendance_is_already_marked"
                                        })
                                        print(f"[VISION] Attendance already marked: {name}", flush=True)
                                    else:
                                        last_scanned_status.update({
                                            "name": name,
                                            "confidence": float(confidence) / 100.0,
                                            "timestamp": now_iso,
                                            "status": "error",
                                            "message": db_msg,
                                            "audio": "person_not_detected"
                                        })
                            else:
                                last_scanned_status.update({
                                    "name": name,
                                    "confidence": float(confidence) / 100.0,
                                    "timestamp": now_iso,
                                    "status": "spoof_detected",
                                    "message": "Spoof Attempt Blocked: Printed photo/screen detected",
                                    "audio": "person_not_detected"
                                })
                                print(f"[VISION] Spoof detected in backend stream for {name}! Blocked.", flush=True)
                        else:
                            # Face detected but not recognized
                            last_scanned_status.update({
                                "name": "Unknown",
                                "confidence": 0.0,
                                "timestamp": now_iso,
                                "status": "unknown",
                                "message": "Face not recognized",
                                "audio": "person_not_detected"
                            })
                            print("[VISION] Unknown face detected", flush=True)

                    # Draw a box around the face
                    cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

                    # Draw label
                    label_text = f"{name} ({confidence}%)"
                    cv2.rectangle(frame, (x, y + h - 35), (x + w, y + h), (0, 255, 0), cv2.FILLED)
                    font = cv2.FONT_HERSHEY_DUPLEX
                    cv2.putText(frame, label_text, (x + 6, y + h - 6), font, 0.6, (255, 255, 255), 1)

            # Encode frame to JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()

            # Yield frame for MJPEG stream
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                   
    finally:
        print("[VISION] Client disconnected. Powering OFF camera.")
        if active_camera_capture is not None:
            try:
                active_camera_capture.release()
            except Exception:
                pass
            active_camera_capture = None
        last_active_frame = None

@app.route('/api/last-scanned', methods=['GET'])
def get_last_scanned():
    """Endpoint for frontend to poll real-time face scan updates."""
    return jsonify(last_scanned_status)

@app.route('/video_feed')
def video_feed():
    """Route for the MJPEG live video stream."""
    threshold = request.args.get('threshold', default=0.45, type=float)
    return Response(generate_frames(threshold),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/recognize', methods=['POST'])
def api_recognize():
    """Endpoint for Client-Side Capture, Server-Side Processing Architecture"""
    try:
        data = request.json
        image_data = data.get('image')
        threshold = data.get('threshold', 0.45)
        
        print("[VISION] Received /api/recognize request", flush=True)
        
        if not image_data:
            return jsonify({"success": False, "message": "Image data is required"}), 400
            
        image = base64_to_cv2(image_data)
        if image is None:
            return jsonify({"success": False, "message": "Invalid image data"}), 400
            
        (h, w) = image.shape[:2]
        faces_detected = []
        
        if dnn_net is not None:
            # OpenCV DNN Face Detection
            blob = cv2.dnn.blobFromImage(cv2.resize(image, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
            dnn_net.setInput(blob)
            detections = dnn_net.forward()
            
            for i in range(0, detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence > 0.5:  # DNN detection threshold
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    (startX, startY, endX, endY) = box.astype("int")
                    
                    
                    if startX < endX and startY < endY:
                        # Extract BGR face region for liveness checking
                        face_region_bgr = image[startY:endY, startX:endX]
                        liveness_threshold = data.get('liveness_threshold', 60.0)
                        
                        # Run liveness detection!
                        is_liveness_real, liveness_score = detect_liveness(face_region_bgr, liveness_threshold)
                        
                        # Extract face for recognition
                        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                        face_region = gray[startY:endY, startX:endX]
                        
                        print(f"[VISION] DNN detected face at {startX},{startY} - {endX},{endY}. Laplacian Score: {liveness_score:.2f}", flush=True)
                        
                        if face_region.size > 0:
                            # Preprocess
                            face_region = cv2.resize(face_region, (150, 150))
                            face_region = cv2.equalizeHist(face_region)
                            face_region = cv2.GaussianBlur(face_region, (3, 3), 0)
                            
                            # Recognize
                            # Initialize attendance status variables
                            name = "Unknown"
                            rec_conf = 0
                            success = False
                            db_msg = "Unknown person"
                            
                            if is_trained and len(known_faces) > 0:
                                match_idx, conf_score = find_best_match(face_region, threshold)
                                print(f"[VISION] find_best_match result: idx={match_idx}, score={conf_score}", flush=True)
                                
                                if match_idx is not None and conf_score >= threshold:
                                    name = known_names[match_idx]
                                    face_distance = 1.0 - conf_score
                                    rec_conf = round((1 - face_distance) * 100)
                                    
                                    # Save attendance only if liveness is real
                                    if is_liveness_real:
                                        print(f"[VISION] Ready to mark attendance for {name}. No cooldown.", flush=True)
                                        success, db_msg = db.mark_attendance(name, rec_conf / 100.0)
                                        print(f"[VISION] DB mark_attendance result: {success} - {db_msg}", flush=True)
                                        if success:
                                            last_attendance[name] = get_indian_time()
                                    else:
                                        success = False
                                        db_msg = "Spoof Attempt Blocked: Printed photo/screen detected"
                                        print(f"[VISION] Spoof detected for {name}! Marking blocked.", flush=True)
                                else:
                                    db_msg = "Face not recognized above confidence threshold"
                            
                            faces_detected.append({
                                "name": name,
                                "confidence": rec_conf,
                                "box": {"x": int(startX), "y": int(startY), "w": int(endX - startX), "h": int(endY - startY)},
                                "liveness": "passed" if is_liveness_real else "spoof_detected",
                                "liveness_score": liveness_score,
                                "attendance_marked": success,
                                "attendance_message": db_msg
                            })
        else:
            return jsonify({"success": False, "message": "DNN model not loaded on server."}), 500
            
        return jsonify({
            "success": True,
            "faces": faces_detected
        })
        
    except Exception as e:
        print(f"Error in /api/recognize: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error recognizing: {str(e)}"}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                return f.read()
        return "Frontend not built yet", 404

if __name__ == '__main__':
    print("Face Recognition API starting...")
    print(f"Known faces directory: {KNOWN_FACES_DIR}")
    print(f"Directory exists: {os.path.exists(KNOWN_FACES_DIR)}")
    print("Database connection ready: MongoDB Atlas")
    print(f"Starting server on port {PORT}")
    
    # Debug: List files in known faces directory
    if os.path.exists(KNOWN_FACES_DIR):
        files = os.listdir(KNOWN_FACES_DIR)
        print(f"Files in known_faces directory: {files}")
    else:
        print("Known faces directory does not exist!")
    
    # Load known faces on startup
    load_known_faces()
    
    # Print loaded face data
    print(f"Loaded faces: {len(known_faces)} faces")
    print(f"Known names: {known_names}")
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=PORT, debug=False)

