from pymongo import MongoClient
from datetime import datetime, timedelta
import os
import pytz
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

# Get MongoDB URI from .env, or use a default local instance if not found
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")

def get_indian_time():
    """Get current time in Indian Standard Time (IST)"""
    ist = pytz.timezone('Asia/Kolkata')
    return datetime.now(ist)

class Database:
    def __init__(self):
        self.attendance_collection = None
        self.client = None
        self.sqlite_db_path = os.path.join(os.path.dirname(__file__), "scan_attendance.db")
        try:
            # Connect to MongoDB client
            self.client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
            self.client.server_info() # Test connection first
            self.db = self.client['scan_attendance']
            self.attendance_collection = self.db['daily_logs']
            print("[DB] Successfully connected to MongoDB Atlas")
        except Exception as e:
            print(f"[DB] Error connecting to MongoDB: {e}")
            print("[DB] Falling back to local SQLite database...")
            self.attendance_collection = None
            self.init_sqlite()

    def init_sqlite(self):
        """Initializes SQLite database and tables if MongoDB is not available."""
        try:
            import sqlite3
            conn = sqlite3.connect(self.sqlite_db_path)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS daily_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    date TEXT NOT NULL,
                    time TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)
            conn.commit()
            conn.close()
            print(f"[DB SQLite] Initialized local database at {self.sqlite_db_path}")
        except Exception as e:
            print(f"[DB SQLite] Error initializing local database: {e}")

    def mark_attendance(self, name, confidence=0.9):
        """Marks attendance if not already marked for today. (Optimistic Duplicate Check)"""
        now = get_indian_time()
        today_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        if self.attendance_collection is not None:
            try:
                # Strictly enforce one attendance record per person per day (session) unless multiple attendance is allowed for testing
                allow_multiple = os.getenv("ALLOW_MULTIPLE_ATTENDANCE", "true").lower() == "true"
                if not allow_multiple:
                    existing = self.attendance_collection.find_one({"name": name, "date": today_str})
                    if existing:
                        print(f"[DB] Attendance already marked for {name} today")
                        return False, "Attendance already marked for today"
            except Exception as e:
                print(f"[DB] Error checking duplicate: {e}")

            # If it does not exist, insert the record
            record = {
                "name": name,
                "date": today_str,
                "time": time_str,
                "confidence": float(confidence),
                "timestamp": datetime.now()
            }
            
            try:
                self.attendance_collection.insert_one(record)
                print(f"[DB] Attendance marked for {name} at {time_str}")
                return True, "Attendance marked successfully"
            except Exception as e:
                print(f"[DB] Error inserting record: {e}")
                return False, f"Database error: {str(e)}"
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                
                # Strictly enforce one attendance record per person per day (session) unless multiple attendance is allowed for testing
                allow_multiple = os.getenv("ALLOW_MULTIPLE_ATTENDANCE", "true").lower() == "true"
                if not allow_multiple:
                    cursor.execute("SELECT id FROM daily_logs WHERE name = ? AND date = ?", (name, today_str))
                    existing = cursor.fetchone()
                    if existing:
                        conn.close()
                        print(f"[DB SQLite] Attendance already marked for {name} today")
                        return False, "Attendance already marked for today"
                
                # Insert
                cursor.execute(
                    "INSERT INTO daily_logs (name, date, time, confidence, timestamp) VALUES (?, ?, ?, ?, ?)",
                    (name, today_str, time_str, float(confidence), datetime.now().isoformat())
                )
                conn.commit()
                conn.close()
                print(f"[DB SQLite] Attendance marked for {name} at {time_str}")
                return True, "Attendance marked successfully"
            except Exception as e:
                print(f"[DB SQLite] Error marking attendance: {e}")
                return False, f"Database error: {str(e)}"

    def get_attendance_records(self):
        """Retrieves all attendance logs from database, sorted by timestamp (descending)"""
        if self.attendance_collection is not None:
            try:
                records = self.attendance_collection.find().sort("timestamp", -1)
                result = []
                for r in records:
                    result.append({
                        "name": r.get("name"),
                        "date": r.get("date"),
                        "time": r.get("time"),
                        "confidence": r.get("confidence", 0.9)
                    })
                return result
            except Exception as e:
                print(f"[DB] Error retrieving records: {e}")
                return []
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name, date, time, confidence FROM daily_logs ORDER BY timestamp DESC")
                rows = cursor.fetchall()
                conn.close()
                
                result = []
                for row in rows:
                    result.append({
                        "name": row[0],
                        "date": row[1],
                        "time": row[2],
                        "confidence": row[3]
                    })
                return result
            except Exception as e:
                print(f"[DB SQLite] Error retrieving records: {e}")
                return []

    def get_statistics(self):
        """Retrieves statistics directly from database logs"""
        try:
            records = self.get_attendance_records()
            total_records = len(records)
            
            now = get_indian_time()
            today_str = now.strftime("%Y-%m-%d")
            
            # Helper for date objects
            today_dt = now.date()
            week_start = today_dt - timedelta(days=today_dt.weekday())
            month_start = today_dt.replace(day=1)
            
            unique_names = set()
            today_count = 0
            week_count = 0
            month_count = 0
            confidences = []
            name_counts = {}
            hour_counts = {}
            
            for r in records:
                name = r.get("name")
                date_str = r.get("date")
                time_str = r.get("time")
                conf = r.get("confidence", 0.9)
                
                if name:
                    unique_names.add(name)
                    name_counts[name] = name_counts.get(name, 0) + 1
                if conf is not None:
                    confidences.append(conf)
                
                if date_str == today_str:
                    today_count += 1
                
                if date_str:
                    try:
                        rec_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                        if rec_date >= week_start:
                            week_count += 1
                        if rec_date >= month_start:
                            month_count += 1
                    except:
                        pass
                
                if time_str:
                    try:
                        hour = int(time_str.split(":")[0])
                        hour_counts[hour] = hour_counts.get(hour, 0) + 1
                    except:
                        pass
            
            most_active = max(name_counts, key=name_counts.get) if name_counts else None
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            
            sorted_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]
            peak_hours = [{"hour": h, "count": c} for h, c in sorted_hours]
            
            return {
                "total_records": total_records,
                "unique_people": len(unique_names),
                "today_attendance": today_count,
                "this_week": week_count,
                "this_month": month_count,
                "average_confidence": avg_conf,
                "most_active_person": most_active,
                "peak_hours": peak_hours
            }
        except Exception as e:
            print(f"[DB] Error generating stats: {e}")
            return {
                "total_records": 0,
                "unique_people": 0,
                "today_attendance": 0,
                "this_week": 0,
                "this_month": 0,
                "average_confidence": 0.0,
                "most_active_person": None,
                "peak_hours": []
            }

db = Database()
