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
import threading

# Global lock for OpenCV DNN model to ensure thread-safety
dnn_lock = threading.Lock()


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

# Email Settings Configuration
EMAIL_SETTINGS_FILE = '/app/email_settings.json' if os.path.exists('/app/known_faces') else os.path.join(os.path.dirname(__file__), 'email_settings.json')
email_settings = {
    "smtp_server": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "sender_name": "SCAN Attendance System",
    "email_on_attendance": True,
    "admin_email": "",
    "use_resend": False,
    "resend_api_key": "",
    "resend_sender": "onboarding@resend.dev"
}

# Priority 1: Load from environment variables (best for Render / cloud deployments)
env_resend_api_key = os.getenv("RESEND_API_KEY", "")
env_resend_sender = os.getenv("RESEND_SENDER", "onboarding@resend.dev")
env_smtp_server = os.getenv("SMTP_SERVER", "")
env_smtp_user = os.getenv("SMTP_USER", "")
env_smtp_password = os.getenv("SMTP_PASSWORD", "")

if env_resend_api_key:
    email_settings.update({
        "use_resend": True,
        "resend_api_key": env_resend_api_key,
        "resend_sender": env_resend_sender,
        "sender_name": os.getenv("SMTP_SENDER_NAME", "SCAN Attendance System"),
        "email_on_attendance": os.getenv("EMAIL_ON_ATTENDANCE", "true").lower() == "true",
        "admin_email": os.getenv("ADMIN_EMAIL", "")
    })
    print("[EMAIL] Resend settings loaded from environment variables")
elif env_smtp_server and env_smtp_user and env_smtp_password:
    email_settings.update({
        "use_resend": False,
        "smtp_server": env_smtp_server,
        "smtp_port": int(os.getenv("SMTP_PORT", "587")),
        "smtp_user": env_smtp_user,
        "smtp_password": env_smtp_password,
        "sender_name": os.getenv("SMTP_SENDER_NAME", "SCAN Attendance System"),
        "email_on_attendance": os.getenv("EMAIL_ON_ATTENDANCE", "true").lower() == "true",
        "admin_email": os.getenv("ADMIN_EMAIL", "")
    })
    print("[EMAIL] SMTP settings loaded from environment variables")
# Priority 2: Load from JSON file (local development)
elif os.path.exists(EMAIL_SETTINGS_FILE):
    try:
        with open(EMAIL_SETTINGS_FILE, 'r') as f:
            email_settings.update(json.load(f))
        print("[EMAIL] settings loaded from email_settings.json")
    except Exception as e:
        print(f"[EMAIL] Error loading email settings file: {e}")
else:
    print("[EMAIL] WARNING: No SMTP or Resend settings configured. Set RESEND_API_KEY / SMTP_SERVER environment variables or configure via Settings page.")

def send_background_email(subject, recipient, body, attachment=None, attachment_name=None):
    """Send an email in a background thread"""
    import threading
    
    def run():
        # 1. Try sending via Resend if configured
        use_resend = email_settings.get("use_resend", False)
        resend_api_key = email_settings.get("resend_api_key", "").strip()
        resend_sender = email_settings.get("resend_sender", "onboarding@resend.dev").strip()
        sender_name = email_settings.get("sender_name", "SCAN Attendance System").strip()
        
        if use_resend and resend_api_key:
            import urllib.request
            import urllib.error
            import json
            import base64
            
            try:
                from_email = f"{sender_name} <{resend_sender}>" if "<" not in resend_sender else resend_sender
                payload = {
                    "from": from_email,
                    "to": [recipient],
                    "subject": subject,
                    "html": body
                }
                
                if attachment is not None:
                    b64_content = base64.b64encode(attachment).decode('utf-8')
                    payload["attachments"] = [{
                        "content": b64_content,
                        "filename": attachment_name or "attachment.xlsx"
                    }]
                
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0"
                    },
                    method="POST"
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_body = response.read().decode('utf-8')
                    print(f"[EMAIL] Successfully sent email via Resend to {recipient}: {res_body}")
                return
            except Exception as e:
                err_msg = str(e)
                if hasattr(e, 'read'):
                    try:
                        err_msg += f" - Response: {e.read().decode('utf-8')}"
                    except:
                        pass
                print(f"[EMAIL] Error sending email via Resend to {recipient}: {err_msg}")
                print("[EMAIL] Falling back to SMTP configuration...")

        # 2. SMTP Flow (used if Resend is not selected or fails)
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.mime.base import MIMEBase
        from email import encoders
        
        server_host = email_settings.get("smtp_server")
        server_port = email_settings.get("smtp_port")
        user = email_settings.get("smtp_user")
        password = email_settings.get("smtp_password")
        
        if not server_host or not user or not password:
            print("[EMAIL] SMTP settings not fully configured. Skipping mail send.")
            return
            
        try:
            msg = MIMEMultipart()
            msg['From'] = f"{sender_name} <{user}>"
            msg['To'] = recipient
            msg['Subject'] = subject
            
            msg.attach(MIMEText(body, 'html'))
            
            if attachment is not None:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment)
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{attachment_name}"',
                )
                msg.attach(part)
                
            if int(server_port) == 465:
                server = smtplib.SMTP_SSL(server_host, int(server_port), timeout=10)
            else:
                server = smtplib.SMTP(server_host, int(server_port), timeout=10)
                server.starttls()
                
            server.login(user, password)
            server.sendmail(user, recipient, msg.as_string())
            server.quit()
            print(f"[EMAIL] Successfully sent email to {recipient}")
        except Exception as e:
            print(f"[EMAIL] Error sending email to {recipient}: {e}")
            
    threading.Thread(target=run).start()

def send_attendance_notification_email(student_name, class_name, period, time_val, date_val, confidence):
    """Sends an attendance confirmation email if enabled and email exists"""
    if not email_settings.get("email_on_attendance"):
        return
        
    student_email = db.get_student_email(student_name)
    
    # Also fetch parent_email
    parent_email = ""
    if db.people_collection is not None:
        try:
            person = db.people_collection.find_one({"name": {"$regex": f"^{student_name}$", "$options": "i"}})
            if person:
                parent_email = person.get("parent_email", "")
        except:
            pass
    else:
        try:
            import sqlite3
            conn = sqlite3.connect(db.sqlite_db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT parent_email FROM registered_people WHERE name = ? COLLATE NOCASE", (student_name,))
            row = cursor.fetchone()
            conn.close()
            if row:
                parent_email = row[0] or ""
        except:
            pass

    if not student_email and not parent_email:
        print(f"[EMAIL] No email registered for student '{student_name}' or parent. Skipping notification.")
        return
        
    # Auto-resolve class_name if not provided
    resolved_class = class_name
    if not resolved_class:
        if db.people_collection is not None:
            try:
                person = db.people_collection.find_one({"name": {"$regex": f"^{student_name}$", "$options": "i"}})
                if person:
                    resolved_class = person.get("class_name", "")
            except:
                pass
        else:
            try:
                import sqlite3
                conn = sqlite3.connect(db.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT class_name FROM registered_people WHERE name = ? COLLATE NOCASE", (student_name,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    resolved_class = row[0] or ""
            except:
                pass

    conf_pct = round(confidence * 100) if confidence <= 1.0 else round(confidence)

    # 1. Send present email to student if registered
    if student_email:
        subject = f"SCAN Attendance Marked - {student_name}"
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #2563EB; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 24px;">SCAN Attendance Alert</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Smart Cloud Attendance Network</p>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p>Hello <strong>{student_name}</strong>,</p>
                <p>Your attendance has been successfully marked today.</p>
                <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 120px;">Class:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{resolved_class or 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Period:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{period or 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Date & Time:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{date_val} at {time_val}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Confidence:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{conf_pct}%</td>
                        </tr>
                    </table>
                </div>
                <p>If you did not mark your attendance, please contact your administrator immediately.</p>
            </div>
            <div style="background-color: #f1f5f9; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px;">
                This is an automated notification from the SCAN Platform.
            </div>
        </div>
        """
        send_background_email(subject, student_email, body)

    # 2. Send present email to parent if registered
    if parent_email:
        parent_subject = f"SCAN Attendance Marked Alert (Present) - {student_name}"
        parent_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #10B981; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 24px;">SCAN Attendance Alert</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Smart Cloud Attendance Network</p>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p>Dear Parent / Guardian,</p>
                <p>This is to inform you that your ward, <strong>{student_name}</strong>, has been successfully marked <strong>PRESENT</strong> today.</p>
                <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 120px;">Class:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{resolved_class or 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Period:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{period or 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Date & Time:</td>
                            <td style="padding: 6px 0; color: #0f172a;">{date_val} at {time_val}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Status:</td>
                            <td style="padding: 6px 0; color: #10B981; font-weight: bold;">PRESENT</td>
                        </tr>
                    </table>
                </div>
                <p>If you did not expect your ward to be present or have any questions, please contact the school administration.</p>
            </div>
            <div style="background-color: #f1f5f9; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px;">
                This is an automated notification from the SCAN Platform.
            </div>
        </div>
        """
        send_background_email(parent_subject, parent_email, parent_body)

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
temp_registration_images = {}  # Buffer for multi-angle face registration


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
    
    # Sync and restore missing faces from persistent database
    db.sync_local_faces(KNOWN_FACES_DIR)
    
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
                
                # If strict failed, try relaxed parameters
                if len(faces) == 0:
                    print(f"No face detected in {filename} with strict parameters. Trying with relaxed parameters...")
                    faces = face_cascade.detectMultiScale(
                        gray, 
                        scaleFactor=1.05, 
                        minNeighbors=3, 
                        minSize=(20, 20),
                        maxSize=(400, 400)
                    )
                
                if len(faces) > 0:
                    name = filename.split('.')[0]
                    # Strip any angle suffixes (e.g. _front, _left, etc.) for legacy training mapping
                    for suffix in ['_front', '_left', '_right', '_up', '_down', '_smile', '_tilt']:
                        if name.endswith(suffix):
                            name = name[:-len(suffix)]
                            break
                            
                    faces_loaded_for_person = 0
                    for face_rect in faces:
                        x, y, w, h = face_rect
                        
                        # Add some padding around the face
                        padding = 10
                        x = max(0, x - padding)
                        y = max(0, y - padding)
                        w = min(gray.shape[1] - x, w + 2 * padding)
                        h = min(gray.shape[0] - y, h + 2 * padding)
                        
                        face_region = gray[y:y+h, x:x+w]
                        if face_region.size == 0:
                            continue
                            
                        # Standardize face size for better recognition
                        face_region = cv2.resize(face_region, (150, 150))
                        # Apply histogram equalization
                        face_region = cv2.equalizeHist(face_region)
                        # Apply Gaussian blur
                        face_region = cv2.GaussianBlur(face_region, (3, 3), 0)
                        
                        known_faces.append(face_region)
                        known_names.append(name)
                        face_labels.append(label_counter)
                        faces_loaded_for_person += 1
                        
                    print(f"Loaded {faces_loaded_for_person} face(s) for: {name} (Label: {label_counter})")
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


@app.route('/api/classes', methods=['GET', 'POST', 'DELETE'])
def manage_classes():
    """Retrieve, create, or delete classes"""
    if request.method == 'GET':
        try:
            classes_list = db.get_all_classes()
            return jsonify({"status": "success", "classes": classes_list})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
            
    elif request.method == 'POST':
        try:
            data = request.get_json() or {}
            class_name = data.get('class_name', '').strip()
            if not class_name:
                return jsonify({"status": "error", "message": "Class name is required"}), 400
            
            success, message = db.create_class(class_name)
            if success:
                return jsonify({"status": "success", "message": message}), 201
            else:
                return jsonify({"status": "error", "message": message}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
            
    elif request.method == 'DELETE':
        try:
            data = request.get_json() or {}
            class_name = data.get('class_name', '').strip()
            if not class_name:
                # Fallback to query parameters
                class_name = request.args.get('class_name', '').strip()
                
            if not class_name:
                return jsonify({"status": "error", "message": "Class name is required"}), 400
                
            success, message = db.delete_class_db(class_name)
            if success:
                return jsonify({"status": "success", "message": message})
            else:
                return jsonify({"status": "error", "message": message}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500


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

def save_and_process_registration(name, image, angle, class_name=None, email=None, parent_email=None):
    """
    Handles saving the registered face image. If an angle is provided for multi-angle registration,
    buffers the images in memory and stitches them into a single horizontal strip on the 5th capture step.
    """
    global temp_registration_images
    
    # If single photo registration (no angle)
    if not angle:
        filename = f"{name}.jpg"
        imagekit_url = upload_image_to_imagekit(image, filename)
        if not imagekit_url or imagekit_url == "local_storage_fallback":
            imagekit_url = "Local storage only"
        
        filepath = os.path.join(KNOWN_FACES_DIR, filename)
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        
        success = cv2.imwrite(filepath, image)
        if not success:
            return {"success": False, "message": "Failed to save training copy"}, 500
            
        # Convert image to base64 and save to DB for persistent cloud restore
        try:
            _, img_buffer = cv2.imencode('.jpg', image)
            img_b64 = base64.b64encode(img_buffer).decode('utf-8')
            db.save_person(name, img_b64, class_name, email, parent_email)
        except Exception as db_err:
            print(f"[DB] Error saving person to database during registration: {db_err}")
            
        load_known_faces()
        db.mark_attendance(name, 1.0, class_name)
        return {
            "success": True,
            "message": f"Person '{name}' added successfully and attendance marked",
            "filename": filename,
            "imagekit_url": imagekit_url,
            "local_filepath": filepath
        }, 200

    # Multi-angle registration mode
    if angle == 'front':
        temp_registration_images[name] = [image]
    else:
        if name not in temp_registration_images:
            temp_registration_images[name] = []
        temp_registration_images[name].append(image)
        
    num_buffered = len(temp_registration_images[name])
    print(f"[REGISTRATION] Buffered angle '{angle}' for {name}. Total: {num_buffered}/5")
    
    # If we have all 5 angles or it's the final angle, stitch them and save/retrain
    if num_buffered >= 5 or angle == 'down':
        frames = temp_registration_images.pop(name, [])
        if not frames:
            frames = [image]
            
        # Stitch frames horizontally
        target_height = 480
        target_width = 640
        resized_frames = []
        for f in frames:
            if f.shape[0] != target_height or f.shape[1] != target_width:
                f = cv2.resize(f, (target_width, target_height))
            resized_frames.append(f)
            
        combined_image = cv2.hconcat(resized_frames)
        
        filename = f"{name}.jpg"
        imagekit_url = upload_image_to_imagekit(combined_image, filename)
        if not imagekit_url or imagekit_url == "local_storage_fallback":
            imagekit_url = "Local storage only"
            
        filepath = os.path.join(KNOWN_FACES_DIR, filename)
        os.makedirs(KNOWN_FACES_DIR, exist_ok=True)
        
        success = cv2.imwrite(filepath, combined_image)
        if not success:
            return {"success": False, "message": "Failed to save combined training copy"}, 500
            
        # Convert stitched image to base64 and save to DB for persistent cloud restore
        try:
            _, img_buffer = cv2.imencode('.jpg', combined_image)
            img_b64 = base64.b64encode(img_buffer).decode('utf-8')
            db.save_person(name, img_b64, class_name, email, parent_email)
        except Exception as db_err:
            print(f"[DB] Error saving stitched person to database during registration: {db_err}")
            
        # Retrain face recognition system
        load_success = load_known_faces()
        print(f"Model retraining after combined save: {load_success}")
        
        # Auto-mark attendance
        db.mark_attendance(name, 1.0, class_name)
        
        return {
            "success": True,
            "message": f"Congratulations! Successfully registered '{name}' in High-Accuracy mode (5 angles) and marked attendance.",
            "filename": filename,
            "imagekit_url": imagekit_url,
            "local_filepath": filepath
        }, 200
    else:
        # Intermediate steps: return success but don't save file/train yet
        return {
            "success": True,
            "message": f"Successfully captured {angle}! Proceed to next angle.",
            "angle": angle,
            "buffered": num_buffered
        }, 200

@app.route('/add-person', methods=['POST'])
def add_person():
    """Add a new person to the system"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        image_data = data.get('image')
        angle = data.get('angle', '').strip()
        class_name = data.get('class_name', '').strip()
        email = data.get('email', '').strip()
        parent_email = data.get('parent_email', '').strip()
        
        print(f"Add person request received - Name: {name}, Angle: {angle}, Class: {class_name}, Email: {email}, Parent Email: {parent_email}")
        
        if not name or not image_data:
            return jsonify({"success": False, "message": "Name and image are required"}), 400
        
        image = base64_to_cv2(image_data)
        if image is None:
            return jsonify({"success": False, "message": "Invalid image data"}), 400
        
        # Validate that a face is detected in the current image
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30),
            maxSize=(300, 300)
        )
        
        if len(faces) == 0:
            print("[VISION] Strict detection failed. Retrying with relaxed parameters...")
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.05, 
                minNeighbors=3, 
                minSize=(20, 20),
                maxSize=(400, 400)
            )
            
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected in the image. Please make sure your face is clearly visible."}), 400
        
        # Process and save via helper function
        resp, status_code = save_and_process_registration(name, image, angle, class_name, email, parent_email)
        return jsonify(resp), status_code
        
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
        class_name = data.get('class_name', '').strip()
        email = data.get('email', '').strip()
        parent_email = data.get('parent_email', '').strip()
        
        print(f"Add person backend request received - Name: {name}, Angle: {angle}, Class: {class_name}, Email: {email}, Parent Email: {parent_email}")
        
        if not name:
            return jsonify({"success": False, "message": "Name is required"}), 400
        
        image = None
        if last_active_frame is not None:
            image = last_active_frame.copy()
            print("[VISION] Using last active frame from streaming camera")
        else:
            print("[VISION] Stream not active. Opening camera temporarily...")
            temp_cap = cv2.VideoCapture(0)
            if not temp_cap.isOpened():
                temp_cap = cv2.VideoCapture(1)
            
            if temp_cap.isOpened():
                for _ in range(5):
                    success, temp_frame = temp_cap.read()
                if success:
                    image = temp_frame
                temp_cap.release()
        
        if image is None:
            return jsonify({"success": False, "message": "Camera is not active and failed to initialize"}), 500
        
        # Validate that a face is detected in the current image
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30),
            maxSize=(300, 300)
        )
        
        if len(faces) == 0:
            print("[VISION] Strict detection failed. Retrying with relaxed parameters...")
            faces = face_cascade.detectMultiScale(
                gray, 
                scaleFactor=1.05, 
                minNeighbors=3, 
                minSize=(20, 20),
                maxSize=(400, 400)
            )
        
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected in backend camera view. Please make sure you are in front of the camera and looking directly at it."}), 400
        
        # Process and save via helper function
        resp, status_code = save_and_process_registration(name, image, angle, class_name, email, parent_email)
        return jsonify(resp), status_code
        
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
        class_name = data.get('class_name', '').strip()
        period = data.get('period', '').strip()
        
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
            
            # Retrieve the student's registered class (case-insensitive lookup)
            registered_class = None
            if db.people_collection is not None:
                try:
                    person = db.people_collection.find_one({"name": {"$regex": f"^{recognized_name}$", "$options": "i"}})
                    if person:
                        registered_class = person.get("class_name")
                except:
                    pass
            else:
                try:
                    import sqlite3
                    conn = sqlite3.connect(db.sqlite_db_path)
                    cursor = conn.cursor()
                    cursor.execute("SELECT class_name FROM registered_people WHERE name = ? COLLATE NOCASE", (recognized_name,))
                    row = cursor.fetchone()
                    conn.close()
                    if row:
                        registered_class = row[0]
                except:
                    pass

            logged_class = registered_class if registered_class else (class_name or "")

            # Check local memory cooldown first, using the resolved logged_class
            current_time = get_indian_time()
            cooldown_key = (recognized_name, logged_class, period)
            last_time = last_attendance.get(cooldown_key)
            
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
            
            # Save attendance to DB and get detailed response using logged_class
            success, db_msg = db.mark_attendance(recognized_name, confidence_score, class_name=logged_class, period=period)
            
            if success:
                last_attendance[cooldown_key] = current_time
                # Send email notification in background thread if configured
                try:
                    send_attendance_notification_email(
                        recognized_name,
                        logged_class,
                        period,
                        current_time.strftime("%H:%M:%S"),
                        current_time.strftime("%Y-%m-%d"),
                        confidence_score
                    )
                except Exception as mail_err:
                    print(f"[EMAIL] Failed to queue attendance email: {mail_err}")
                return jsonify({
                    "success": True,
                    "name": recognized_name,
                    "confidence": confidence_score,
                    "message": f"Attendance marked for {recognized_name} in class {logged_class} for {period}",
                    "audio": "attendance_marked",
                    "class_name": logged_class,
                    "period": period,
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
        def format_period_time(period, time_val):
            period = (period or "").strip()
            time_val = (time_val or "").strip()
            if period and period != "N/A" and time_val:
                return f"{period} ({time_val})"
            elif period and period != "N/A":
                return period
            elif time_val:
                return time_val
            return "N/A"

        # Get all registered people first to include them (even with 0 attendance)
        people = db.get_all_people()
        student_data = {}
        for p in people:
            name = p.get("name", "").strip()
            if name:
                # Keep proper case but use uppercase for dictionary key to handle case-insensitivity
                student_data[name.upper()] = {
                    "Name": name,
                    "Class": p.get("class_name", "") or "N/A",
                    "Total Attendance": 0,
                    "Dates Attended": [],
                    "Periods & Times": []
                }

        # Now process all attendance logs to aggregate counts
        records = db.get_attendance_records()
        
        # We will also keep raw records for Sheet 2
        raw_list = []

        for r in records:
            name = r.get("name", "").strip()
            if not name:
                continue
            
            log_class = r.get("class_name", "") or "N/A"
            log_period = r.get("period", "") or "N/A"
            log_date = r.get("date", "")
            log_time = r.get("time", "")
            log_conf = r.get("confidence", 0.0)

            combined_pt = format_period_time(log_period, log_time)

            # Raw record for Sheet 2
            raw_list.append({
                "Name": name,
                "Class": log_class,
                "Period & Time": combined_pt,
                "Date": log_date,
                "Confidence": f"{round(log_conf * 100)}%" if log_conf else "0%"
            })
            
            name_key = name.upper()
            if name_key not in student_data:
                # Fallback for name not in registered list
                student_data[name_key] = {
                    "Name": name,
                    "Class": log_class,
                    "Total Attendance": 0,
                    "Dates Attended": [],
                    "Periods & Times": []
                }
            
            student_data[name_key]["Total Attendance"] += 1
            
            # Collect unique dates, periods, and times
            if log_date and log_date not in student_data[name_key]["Dates Attended"]:
                student_data[name_key]["Dates Attended"].append(log_date)
            if combined_pt and combined_pt != "N/A" and combined_pt not in student_data[name_key]["Periods & Times"]:
                student_data[name_key]["Periods & Times"].append(combined_pt)

            # If the log class is set and more specific, update it
            if log_class and log_class != "N/A" and student_data[name_key]["Class"] == "N/A":
                student_data[name_key]["Class"] = log_class

        # Format list outputs to comma-separated strings for Sheet 1
        summary_list = []
        for name_key, data in student_data.items():
            summary_list.append({
                "Name": data["Name"],
                "Class": data["Class"],
                "Total Attendance": data["Total Attendance"],
                "Dates Attended": ", ".join(data["Dates Attended"]) if data["Dates Attended"] else "None",
                "Periods & Times": ", ".join(data["Periods & Times"]) if data["Periods & Times"] else "None"
            })

        summary_list.sort(key=lambda x: x["Name"])

        if not summary_list:
            return jsonify({"success": False, "message": "No attendance records found"}), 404
        
        # Build pandas DataFrames
        df_summary = pd.DataFrame(summary_list)
        df_raw = pd.DataFrame(raw_list) if raw_list else pd.DataFrame(columns=["Name", "Class", "Period & Time", "Date", "Confidence"])
        
        # Save to buffer
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_summary.to_excel(writer, index=False, sheet_name='Attendance Summary')
            df_raw.to_excel(writer, index=False, sheet_name='Detailed Logs')
        output.seek(0)
        
        # Send the Excel file
        return send_file(
            output,
            as_attachment=True,
            download_name=f"attendance_summary_{get_indian_time().strftime('%Y%m%d_%H%M%S')}.xlsx",
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        return jsonify({"success": False, "message": f"Error downloading file: {str(e)}"}), 500


@app.route('/known-faces', methods=['GET'])
def get_known_faces_list():
    """Get list of known faces"""
    try:
        # Fetch registered people to get class name mapping
        people_db = db.get_all_people()
        name_to_class = {p["name"].lower(): p.get("class_name", "") for p in people_db}
        name_to_email = {p["name"].lower(): p.get("email", "") for p in people_db}
        name_to_parent_email = {p["name"].lower(): p.get("parent_email", "") for p in people_db}
        
        people = []
        if os.path.exists(KNOWN_FACES_DIR):
            for filename in os.listdir(KNOWN_FACES_DIR):
                if filename.endswith('.jpg') or filename.endswith('.png'):
                    filepath = os.path.join(KNOWN_FACES_DIR, filename)
                    stat = os.stat(filepath)
                    name = filename.split('.')[0]
                    people.append({
                        "name": name,
                        "image_path": filename,
                        "date_added": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        "class_name": name_to_class.get(name.lower(), ""),
                        "email": name_to_email.get(name.lower(), ""),
                        "parent_email": name_to_parent_email.get(name.lower(), "")
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
        
        # Find and delete all matching image files (combined and legacy)
        deleted = False
        for filename in os.listdir(KNOWN_FACES_DIR):
            if (filename.startswith(name + '.') or filename.startswith(name + '_')) and (filename.endswith('.jpg') or filename.endswith('.png')):
                filepath = os.path.join(KNOWN_FACES_DIR, filename)
                try:
                    os.remove(filepath)
                    deleted = True
                except Exception as e:
                    print(f"Error removing file {filepath}: {e}")
        
        if not deleted:
            # Check if name exists in database even if local file was missing, to clean up dangling entries
            db.delete_person_db(name)
            return jsonify({"success": True, "message": f"Dangling database record for '{name}' deleted successfully"})
            
        # Delete from persistent DB
        db.delete_person_db(name)
        
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
                                    # Send email notification in background thread if configured
                                    try:
                                        now_time = get_indian_time()
                                        send_attendance_notification_email(
                                            name,
                                            None,
                                            None,
                                            now_time.strftime("%H:%M:%S"),
                                            now_time.strftime("%Y-%m-%d"),
                                            float(confidence) / 100.0
                                        )
                                    except Exception as mail_err:
                                        print(f"[EMAIL] Failed to queue stream attendance email: {mail_err}")
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
        class_name = data.get('class_name', '').strip()
        period = data.get('period', '').strip()
        
        print(f"[VISION] Received /api/recognize request for Class: {class_name}, Period: {period}", flush=True)
        
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
            with dnn_lock:
                dnn_net.setInput(blob)
                detections = dnn_net.forward().copy()
            
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
                                    
                                    # Retrieve the student's registered class (case-insensitive lookup)
                                    registered_class = None
                                    if db.people_collection is not None:
                                        try:
                                            person = db.people_collection.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
                                            if person:
                                                registered_class = person.get("class_name")
                                        except:
                                            pass
                                    else:
                                        try:
                                            import sqlite3
                                            conn = sqlite3.connect(db.sqlite_db_path)
                                            cursor = conn.cursor()
                                            cursor.execute("SELECT class_name FROM registered_people WHERE name = ? COLLATE NOCASE", (name,))
                                            row = cursor.fetchone()
                                            conn.close()
                                            if row:
                                                registered_class = row[0]
                                        except:
                                            pass
                                    
                                    logged_class = registered_class if registered_class else (class_name or "")
                                    
                                    # Save attendance only if liveness is real
                                    if is_liveness_real:
                                        print(f"[VISION] Ready to mark attendance for {name}. Class: {logged_class}, Period: {period}", flush=True)
                                        success, db_msg = db.mark_attendance(name, rec_conf / 100.0, class_name=logged_class, period=period)
                                        print(f"[VISION] DB mark_attendance result: {success} - {db_msg}", flush=True)
                                        
                                        if success:
                                            cooldown_key = (name, logged_class, period)
                                            now_time = get_indian_time()
                                            last_attendance[cooldown_key] = now_time
                                            db_msg = f"Attendance marked successfully for {name} in class {logged_class} for {period}"
                                            # Send email notification in background thread if configured
                                            try:
                                                send_attendance_notification_email(
                                                    name,
                                                    logged_class,
                                                    period,
                                                    now_time.strftime("%H:%M:%S"),
                                                    now_time.strftime("%Y-%m-%d"),
                                                    rec_conf / 100.0
                                                )
                                            except Exception as mail_err:
                                                print(f"[EMAIL] Failed to queue attendance email: {mail_err}")
                                        elif "already marked" in db_msg.lower() or "duplicate" in db_msg.lower():
                                            db_msg = f"Attendance already marked for {name} in class {logged_class} for {period}"
                                    else:
                                        success = False
                                        db_msg = "Spoof Attempt Blocked: Printed photo/screen detected"
                                        print(f"[VISION] Spoof detected for {name}! Marking blocked.", flush=True)
                                else:
                                    db_msg = "Face not recognized above confidence threshold"
                                    logged_class = class_name
                            
                            faces_detected.append({
                                "name": name,
                                "confidence": rec_conf,
                                "box": {"x": int(startX), "y": int(startY), "w": int(endX - startX), "h": int(endY - startY)},
                                "liveness": "passed" if is_liveness_real else "spoof_detected",
                                "liveness_score": liveness_score,
                                "attendance_marked": success,
                                "attendance_message": db_msg,
                                "class_name": logged_class,
                                "period": period
                            })
        else:
            return jsonify({"success": False, "message": "DNN model not loaded on server."}), 500
            
        return jsonify({
            "success": True,
            "faces": faces_detected
        })
        
    except Exception as e:
        print(f"Error in /api/recognize: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        # Also print to stdout for PowerShell capture
        print(traceback.format_exc(), flush=True)
        return jsonify({"success": False, "message": f"Error recognizing: {str(e)}"}), 500

@app.route('/api/update-person', methods=['POST'])
def update_person_api():
    """Update a registered person's profile details (class, email)"""
    try:
        data = request.json or {}
        name = data.get('name', '').strip()
        class_name = data.get('class_name', '').strip()
        email = data.get('email', '').strip()
        parent_email = data.get('parent_email', '').strip()
        
        if not name:
            return jsonify({"status": "error", "message": "Name is required"}), 400
            
        success = db.update_person(name, class_name, email, parent_email)
        if success:
            return jsonify({"status": "success", "message": f"Successfully updated details for {name}"})
        else:
            return jsonify({"status": "error", "message": "Failed to update details in database"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/email/settings', methods=['GET', 'POST'])
def manage_email_settings():
    """Retrieve or update email server configuration settings"""
    if request.method == 'GET':
        try:
            # Hide password and api keys for security
            settings_copy = email_settings.copy()
            if settings_copy.get("smtp_password"):
                settings_copy["smtp_password"] = "********"
            if settings_copy.get("resend_api_key"):
                settings_copy["resend_api_key"] = "********"
            return jsonify({"status": "success", "settings": settings_copy})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
            
    elif request.method == 'POST':
        try:
            data = request.json or {}
            smtp_password = data.get("smtp_password", "")
            resend_api_key = data.get("resend_api_key", "")
            
            # Retain existing credentials if redacted placeholders are provided
            if smtp_password == "********" or not smtp_password:
                password_to_save = email_settings.get("smtp_password", "")
            else:
                password_to_save = smtp_password
                
            if resend_api_key == "********" or not resend_api_key:
                resend_api_key_to_save = email_settings.get("resend_api_key", "")
            else:
                resend_api_key_to_save = resend_api_key
                
            smtp_server = data.get("smtp_server", "").strip()
            if smtp_server and "@" in smtp_server:
                return jsonify({"status": "error", "message": "SMTP Host / Server should be a domain name (like 'smtp.gmail.com'), not an email address."}), 400
                
            email_settings.update({
                "smtp_server": smtp_server,
                "smtp_port": int(data.get("smtp_port", 587)),
                "smtp_user": data.get("smtp_user", "").strip(),
                "smtp_password": password_to_save,
                "sender_name": data.get("sender_name", "").strip() or "SCAN Attendance System",
                "email_on_attendance": bool(data.get("email_on_attendance", True)),
                "admin_email": data.get("admin_email", "").strip(),
                "use_resend": bool(data.get("use_resend", False)),
                "resend_api_key": resend_api_key_to_save.strip(),
                "resend_sender": data.get("resend_sender", "").strip() or "onboarding@resend.dev"
            })
            
            # Save settings persistently on disk
            with open(EMAIL_SETTINGS_FILE, 'w') as f:
                json.dump(email_settings, f, indent=4)
                
            return jsonify({"status": "success", "message": "Email settings saved successfully"})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/email/test', methods=['POST'])
def send_test_email():
    """Verify email configuration by sending a test email synchronously"""
    try:
        data = request.json or {}
        recipient = data.get("recipient", "").strip()
        if not recipient:
            recipient = email_settings.get("admin_email", "")
        if not recipient:
            return jsonify({"status": "error", "message": "Recipient email is required"}), 400
            
        subject = "SCAN Email Connection Test"
        body = """
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 24px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #2563EB; color: white; padding: 15px; border-radius: 6px 6px 0 0;">
                <h2 style="margin: 0; font-size: 20px;">Connection Test</h2>
            </div>
            <div style="padding: 20px; color: #334155; line-height: 1.6;">
                <h3 style="color: #16A34A; margin-top: 0;">Email Test Successful! 🎉</h3>
                <p>Your SCAN Face Recognition Attendance System has successfully connected and dispatched this email.</p>
                <p>All automated notifications and reports are ready to be sent.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
                Sent from SCAN: Smart Cloud Attendance Network
            </p>
        </div>
        """
        
        use_resend = email_settings.get("use_resend", False)
        resend_api_key = email_settings.get("resend_api_key", "").strip()
        resend_sender = email_settings.get("resend_sender", "onboarding@resend.dev").strip()
        sender_name = email_settings.get("sender_name", "SCAN Attendance System").strip()
        
        if use_resend:
            if not resend_api_key:
                return jsonify({"status": "error", "message": "Resend API Key is missing"}), 400
                
            import urllib.request
            import urllib.error
            import json
            
            try:
                from_email = f"{sender_name} <{resend_sender}>" if "<" not in resend_sender else resend_sender
                payload = {
                    "from": from_email,
                    "to": [recipient],
                    "subject": subject,
                    "html": body
                }
                
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0"
                    },
                    method="POST"
                )
                
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_body = json.loads(response.read().decode('utf-8'))
                return jsonify({"status": "success", "message": f"Test email sent successfully via Resend to {recipient}", "data": res_body})
            except Exception as e:
                err_msg = str(e)
                if hasattr(e, 'read'):
                    try:
                        err_msg += f" - Response: {e.read().decode('utf-8')}"
                    except:
                        pass
                return jsonify({"status": "error", "message": f"Resend API connection failed: {err_msg}"}), 500
        
        # SMTP configuration
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        server_host = email_settings.get("smtp_server")
        server_port = email_settings.get("smtp_port")
        user = email_settings.get("smtp_user")
        password = email_settings.get("smtp_password")
        
        if not server_host or not user or not password:
            return jsonify({"status": "error", "message": "SMTP settings are incomplete"}), 400
            
        msg = MIMEMultipart()
        msg['From'] = f"{sender_name} <{user}>"
        msg['To'] = recipient
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        if int(server_port) == 465:
            server = smtplib.SMTP_SSL(server_host, int(server_port), timeout=10)
        else:
            server = smtplib.SMTP(server_host, int(server_port), timeout=10)
            server.starttls()
            
        server.login(user, password)
        server.sendmail(user, recipient, msg.as_string())
        server.quit()
        
        return jsonify({"status": "success", "message": f"Test email successfully sent via SMTP to {recipient}"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"SMTP connection failed: {str(e)}"}), 500


@app.route('/api/email/absentees', methods=['POST'])
def email_absentees():
    """Emails parent of absent students of a class and period for a given date"""
    try:
        data = request.json or {}
        class_name = data.get("class_name", "").strip()
        period = data.get("period", "").strip()
        date_str = data.get("date", "").strip()
        
        if not class_name or not period or not date_str:
            return jsonify({"status": "error", "message": "Class, Period, and Date are required"}), 400
            
        # 1. Fetch all registered people in this class
        people = db.get_all_people()
        class_students = [p for p in people if p.get("class_name", "").lower() == class_name.lower()]
        
        if not class_students:
            return jsonify({"status": "success", "message": f"No registered students found for class {class_name}", "sent_count": 0})
            
        # 2. Fetch attendance records for this date, class, and period
        records = db.get_attendance_records()
        
        # Filter records for the specified date, class_name (case insensitive), and period
        marked_names = set()
        for r in records:
            r_date = r.get("date", "")
            r_class = r.get("class_name", "")
            r_period = r.get("period", "")
            if r_date == date_str and r_class.lower() == class_name.lower() and r_period.lower() == period.lower():
                if r.get("name"):
                    marked_names.add(r["name"].strip().lower())
                    
        # 3. Identify absent students (registered students who are not in marked_names)
        absent_students = []
        for student in class_students:
            s_name = student.get("name", "").strip()
            if s_name.lower() not in marked_names:
                absent_students.append(student)
                
        if not absent_students:
            return jsonify({"status": "success", "message": "All students are present. No absentee emails to send.", "sent_count": 0})
            
        # 4. Email each absent student's parent (if they have a parent_email)
        sent_count = 0
        skipped_count = 0
        for student in absent_students:
            s_name = student.get("name")
            p_email = student.get("parent_email", "").strip()
            if not p_email:
                skipped_count += 1
                continue
                
            subject = f"SCAN Absentee Notification Alert - {s_name}"
            body = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background-color: #EF4444; color: white; padding: 20px; text-align: center;">
                    <h2 style="margin: 0; font-size: 24px;">SCAN Attendance Alert</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Smart Cloud Attendance Network</p>
                </div>
                <div style="padding: 24px; color: #334155; line-height: 1.6;">
                    <p>Dear Parent / Guardian,</p>
                    <p>This is to inform you that your ward, <strong>{s_name}</strong>, was marked <strong>ABSENT</strong> today.</p>
                    <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 120px;">Class:</td>
                                <td style="padding: 6px 0; color: #0f172a;">{class_name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Period:</td>
                                <td style="padding: 6px 0; color: #0f172a;">{period}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Date:</td>
                                <td style="padding: 6px 0; color: #0f172a;">{date_str}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Status:</td>
                                <td style="padding: 6px 0; color: #EF4444; font-weight: bold;">ABSENT</td>
                            </tr>
                        </table>
                    </div>
                    <p>If you believe this is an error or if your ward was on authorized leave, please contact the school administration to rectify the records.</p>
                </div>
                <div style="background-color: #f1f5f9; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px;">
                    This is an automated notification from the SCAN Platform.
                </div>
            </div>
            """
            send_background_email(subject, p_email, body)
            sent_count += 1
            
        message = f"Absence notification emails sent to {sent_count} parents."
        if skipped_count > 0:
            message += f" (Skipped {skipped_count} students without parent email registered)."
            
        return jsonify({"status": "success", "message": message, "sent_count": sent_count, "skipped_count": skipped_count})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error emailing absentees: {str(e)}"}), 500


@app.route('/api/email/report', methods=['POST'])
def email_report():
    """Generates a filtered attendance Excel report and emails it to the recipient"""
    try:
        data = request.json or {}
        recipient = data.get("recipient", "").strip()
        if not recipient:
            recipient = email_settings.get("admin_email", "")
        if not recipient:
            return jsonify({"status": "error", "message": "Recipient email is required"}), 400
            
        # Extract report filters
        start_date = data.get("start_date", "").strip()
        end_date = data.get("end_date", "").strip()
        class_filter = data.get("class_name", "").strip()
        period_filter = data.get("period", "").strip()
        min_confidence = data.get("min_confidence")
        
        def format_period_time(period, time_val):
            period = (period or "").strip()
            time_val = (time_val or "").strip()
            if period and period != "N/A" and time_val:
                return f"{period} ({time_val})"
            elif period and period != "N/A":
                return period
            elif time_val:
                return time_val
            return "N/A"
            
        # Fetch registered people
        people = db.get_all_people()
        student_data = {}
        for p in people:
            name = p.get("name", "").strip()
            if name:
                student_data[name.upper()] = {
                    "Name": name,
                    "Class": p.get("class_name", "") or "N/A",
                    "Total Attendance": 0,
                    "Dates Attended": [],
                    "Periods & Times": []
                }
                
        # Fetch and filter records
        records = db.get_attendance_records()
        raw_list = []
        
        for r in records:
            name = r.get("name", "").strip()
            if not name:
                continue
                
            log_class = r.get("class_name", "") or "N/A"
            log_period = r.get("period", "") or "N/A"
            log_date = r.get("date", "")
            log_time = r.get("time", "")
            log_conf = r.get("confidence", 0.0)
            
            # Apply filters dynamically
            if start_date and log_date < start_date:
                continue
            if end_date and log_date > end_date:
                continue
            if class_filter and class_filter != "all" and log_class != class_filter:
                continue
            if period_filter and period_filter != "all" and log_period != period_filter:
                continue
            if min_confidence is not None:
                mc = float(min_confidence)
                if mc > 1.0:
                    mc = mc / 100.0
                if log_conf < mc:
                    continue
                    
            combined_pt = format_period_time(log_period, log_time)
            
            raw_list.append({
                "Name": name,
                "Class": log_class,
                "Period & Time": combined_pt,
                "Date": log_date,
                "Confidence": f"{round(log_conf * 100)}%" if log_conf else "0%"
            })
            
            name_key = name.upper()
            if name_key not in student_data:
                student_data[name_key] = {
                    "Name": name,
                    "Class": log_class,
                    "Total Attendance": 0,
                    "Dates Attended": [],
                    "Periods & Times": []
                }
                
            student_data[name_key]["Total Attendance"] += 1
            if log_date and log_date not in student_data[name_key]["Dates Attended"]:
                student_data[name_key]["Dates Attended"].append(log_date)
            if combined_pt and combined_pt != "N/A" and combined_pt not in student_data[name_key]["Periods & Times"]:
                student_data[name_key]["Periods & Times"].append(combined_pt)
            if log_class and log_class != "N/A" and student_data[name_key]["Class"] == "N/A":
                student_data[name_key]["Class"] = log_class
                
        # Format results for summary sheet
        summary_list = []
        for name_key, sdata in student_data.items():
            # If class filter is applied, only show summary for students matching that class
            if class_filter and class_filter != "all" and sdata["Class"] != class_filter:
                continue
            # If summary list has 0 attendance but we filtered by date range or period, we can optionally hide or show them
            # Let's show registered students matching class filters
            summary_list.append({
                "Name": sdata["Name"],
                "Class": sdata["Class"],
                "Total Attendance": sdata["Total Attendance"],
                "Dates Attended": ", ".join(sdata["Dates Attended"]) if sdata["Dates Attended"] else "None",
                "Periods & Times": ", ".join(sdata["Periods & Times"]) if sdata["Periods & Times"] else "None"
            })
        summary_list.sort(key=lambda x: x["Name"])
        
        df_summary = pd.DataFrame(summary_list)
        df_raw = pd.DataFrame(raw_list) if raw_list else pd.DataFrame(columns=["Name", "Class", "Period & Time", "Date", "Confidence"])
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_summary.to_excel(writer, index=False, sheet_name='Attendance Summary')
            df_raw.to_excel(writer, index=False, sheet_name='Detailed Logs')
        output.seek(0)
        
        # Build filter description for email body
        filter_desc = "<ul>"
        if start_date or end_date:
            filter_desc += f"<li><strong>Date Range:</strong> {start_date or 'Beginning'} to {end_date or 'Present'}</li>"
        if class_filter and class_filter != "all":
            filter_desc += f"<li><strong>Class:</strong> {class_filter}</li>"
        if period_filter and period_filter != "all":
            filter_desc += f"<li><strong>Period:</strong> {period_filter}</li>"
        if min_confidence is not None:
            filter_desc += f"<li><strong>Min Confidence:</strong> {min_confidence}%</li>"
        filter_desc += "</ul>"
        if filter_desc == "<ul></ul>":
            filter_desc = "<p>All records exported.</p>"
            
        subject = f"SCAN Filtered Attendance Report - {get_indian_time().strftime('%Y-%m-%d')}"
        body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #2563EB; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">SCAN Attendance Report</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Exported on {get_indian_time().strftime('%Y-%m-%d %H:%M:%S')} IST</p>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p>Hello,</p>
                <p>Please find attached the requested attendance report.</p>
                <h4 style="color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 20px;">Applied Filters:</h4>
                {filter_desc}
                <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 12px; margin: 20px 0; font-size: 14px;">
                    <strong>Total Summary Rows:</strong> {len(summary_list)}<br/>
                    <strong>Total Detailed Log Entries:</strong> {len(raw_list)}
                </div>
                <p>Best regards,<br/>SCAN Admin Team</p>
            </div>
            <div style="background-color: #f1f5f9; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px;">
                This report was generated dynamically by SCAN: Smart Cloud Attendance Network.
            </div>
        </div>
        """
        
        attachment_data = output.getvalue()
        filename = f"attendance_report_{get_indian_time().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        send_background_email(subject, recipient, body, attachment=attachment_data, attachment_name=filename)
        
        return jsonify({"status": "success", "message": f"Attendance report is being emailed to {recipient}"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

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
    app.run(host='0.0.0.0', port=PORT, debug=True)

