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
        self.people_collection = None
        self.classes_collection = None
        self.client = None
        self.db = None
        self.sqlite_db_path = os.path.join(os.path.dirname(__file__), "scan_attendance.db")
        try:
            # Connect to MongoDB client
            self.client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
            self.client.server_info() # Test connection first
            self.db = self.client['scan_attendance']
            self.attendance_collection = self.db['daily_logs']
            self.people_collection = self.db['registered_people']
            self.classes_collection = self.db['classes']
            print("[DB] Successfully connected to MongoDB Atlas")
        except Exception as e:
            print(f"[DB] Error connecting to MongoDB: {e}")
            print("[DB] Falling back to local SQLite database...")
            self.attendance_collection = None
            self.people_collection = None
            self.classes_collection = None
            self.init_sqlite()

    def init_sqlite(self):
        """Initializes the local SQLite database and runs necessary migrations."""
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
                    timestamp TEXT NOT NULL,
                    class_name TEXT,
                    period TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS registered_people (
                    name TEXT PRIMARY KEY,
                    image_data TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    class_name TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS classes (
                    class_name TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL
                )
            """)
            
            # Check and run database migrations for existing SQLite databases
            try:
                cursor.execute("ALTER TABLE daily_logs ADD COLUMN class_name TEXT")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE daily_logs ADD COLUMN period TEXT")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE registered_people ADD COLUMN class_name TEXT")
            except:
                pass
                
            conn.commit()
            conn.close()
            print(f"[DB SQLite] Initialized local database at {self.sqlite_db_path}")
        except Exception as e:
            print(f"[DB SQLite] Error initializing local database: {e}")

    def mark_attendance(self, name, confidence=0.9, class_name=None, period=None):
        """Marks attendance if not already marked for today. (Optimistic Duplicate Check)"""
        now = get_indian_time()
        today_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        # Fetch student's actual registered class to strictly restrict logging to that class
        registered_class = None
        if self.client and self.db is not None and self.people_collection is not None:
            try:
                person = self.people_collection.find_one({"name": name})
                if person:
                    registered_class = person.get("class_name")
            except Exception as e:
                print(f"[DB] Error finding registered class for {name}: {e}")
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT class_name FROM registered_people WHERE name = ?", (name,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    registered_class = row[0]
            except Exception as e:
                print(f"[DB SQLite] Error finding registered class for {name}: {e}")

        # If a registered class is found, enforce it (override class_name)
        if registered_class:
            class_name = registered_class

        # Sanitize class and period
        db_class_name = class_name if class_name else ""
        db_period = period if period else ""

        if self.attendance_collection is not None:
            try:
                # Strictly enforce duplicate check (scoped to person, date, class, and period)
                allow_multiple = os.getenv("ALLOW_MULTIPLE_ATTENDANCE", "true").lower() == "true"
                if not allow_multiple:
                    query = {"name": name, "date": today_str}
                    if class_name:
                        query["class_name"] = class_name
                    if period:
                        query["period"] = period
                    existing = self.attendance_collection.find_one(query)
                    if existing:
                        print(f"[DB] Attendance already marked for {name} today in {class_name} ({period})")
                        return False, "Attendance already marked for today"
            except Exception as e:
                print(f"[DB] Error checking duplicate: {e}")

            # If it does not exist, insert the record
            record = {
                "name": name,
                "date": today_str,
                "time": time_str,
                "confidence": float(confidence),
                "timestamp": datetime.now(),
                "class_name": db_class_name,
                "period": db_period
            }
            
            try:
                self.attendance_collection.insert_one(record)
                print(f"[DB] Attendance marked for {name} at {time_str} for {db_class_name} ({db_period})")
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
                
                allow_multiple = os.getenv("ALLOW_MULTIPLE_ATTENDANCE", "true").lower() == "true"
                if not allow_multiple:
                    sql_query = "SELECT id FROM daily_logs WHERE name = ? AND date = ?"
                    params = [name, today_str]
                    if class_name:
                        sql_query += " AND class_name = ?"
                        params.append(class_name)
                    if period:
                        sql_query += " AND period = ?"
                        params.append(period)
                    cursor.execute(sql_query, tuple(params))
                    existing = cursor.fetchone()
                    if existing:
                        conn.close()
                        print(f"[DB SQLite] Attendance already marked for {name} today in {class_name} ({period})")
                        return False, "Attendance already marked for today"
                
                # Insert
                cursor.execute(
                    "INSERT INTO daily_logs (name, date, time, confidence, timestamp, class_name, period) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (name, today_str, time_str, float(confidence), datetime.now().isoformat(), db_class_name, db_period)
                )
                conn.commit()
                conn.close()
                print(f"[DB SQLite] Attendance marked for {name} at {time_str} for {db_class_name} ({db_period})")
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
                        "confidence": r.get("confidence", 0.9),
                        "class_name": r.get("class_name", ""),
                        "period": r.get("period", "")
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
                cursor.execute("SELECT name, date, time, confidence, class_name, period FROM daily_logs ORDER BY timestamp DESC")
                rows = cursor.fetchall()
                conn.close()
                
                result = []
                for row in rows:
                    result.append({
                        "name": row[0],
                        "date": row[1],
                        "time": row[2],
                        "confidence": row[3],
                        "class_name": row[4] if len(row) > 4 and row[4] is not None else "",
                        "period": row[5] if len(row) > 5 and row[5] is not None else ""
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

    def save_person(self, name, image_data, class_name=None):
        """Saves or updates a person's registered face image (base64) in the database"""
        db_class_name = class_name if class_name else ""
        if self.client and self.db is not None and self.people_collection is not None:
            try:
                self.people_collection.replace_one(
                    {"name": name},
                    {
                        "name": name,
                        "image_data": image_data,
                        "class_name": db_class_name,
                        "timestamp": datetime.now()
                    },
                    upsert=True
                )
                print(f"[DB] Person '{name}' face saved to MongoDB")
                return True
            except Exception as e:
                print(f"[DB] Error saving person to MongoDB: {e}")
                
        # SQLite fallback / dual save
        try:
            import sqlite3
            conn = sqlite3.connect(self.sqlite_db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO registered_people (name, image_data, timestamp, class_name) VALUES (?, ?, ?, ?)",
                (name, image_data, datetime.now().isoformat(), db_class_name)
            )
            conn.commit()
            conn.close()
            print(f"[DB SQLite] Person '{name}' face saved to SQLite")
            return True
        except Exception as e:
            print(f"[DB SQLite] Error saving person to SQLite: {e}")
            return False

    def get_all_people(self):
        """Retrieves all registered people and their face image data"""
        if self.client and self.db is not None and self.people_collection is not None:
            try:
                records = self.people_collection.find()
                people = []
                for r in records:
                    people.append({
                        "name": r.get("name"),
                        "image_data": r.get("image_data"),
                        "class_name": r.get("class_name", "")
                    })
                return people
            except Exception as e:
                print(f"[DB] Error retrieving people from MongoDB: {e}")
                
        # SQLite fallback
        try:
            import sqlite3
            conn = sqlite3.connect(self.sqlite_db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name, image_data, class_name FROM registered_people")
            rows = cursor.fetchall()
            conn.close()
            
            people = []
            for row in rows:
                people.append({
                    "name": row[0],
                    "image_data": row[1],
                    "class_name": row[2] if len(row) > 2 and row[2] is not None else ""
                })
            return people
        except Exception as e:
            print(f"[DB SQLite] Error retrieving people from SQLite: {e}")
            return []

    def delete_person_db(self, name):
        """Deletes a person's registered face profile from the database"""
        if self.client and self.db is not None and self.people_collection is not None:
            try:
                self.people_collection.delete_one({"name": name})
                print(f"[DB] Deleted '{name}' from MongoDB")
            except Exception as e:
                print(f"[DB] Error deleting person from MongoDB: {e}")
                
        # SQLite fallback / dual delete
        try:
            import sqlite3
            conn = sqlite3.connect(self.sqlite_db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM registered_people WHERE name = ?", (name,))
            conn.commit()
            conn.close()
            print(f"[DB SQLite] Deleted '{name}' from SQLite")
            return True
        except Exception as e:
            print(f"[DB SQLite] Error deleting person from SQLite: {e}")
            return False

    def sync_local_faces(self, known_faces_dir):
        """Synchronizes and restores any missing registered face images from the database back to local disk"""
        try:
            import base64
            os.makedirs(known_faces_dir, exist_ok=True)
            people = self.get_all_people()
            
            restored_count = 0
            for p in people:
                name = p.get("name")
                image_data = p.get("image_data")
                if name and image_data:
                    local_path = os.path.join(known_faces_dir, f"{name}.jpg")
                    if not os.path.exists(local_path):
                        try:
                            # Strip prefix if it's a data URL
                            if "," in image_data:
                                image_data = image_data.split(",")[1]
                            img_bytes = base64.b64decode(image_data)
                            with open(local_path, "wb") as f:
                                f.write(img_bytes)
                            print(f"[DB SYNC] Restored missing face image locally: {local_path}")
                            restored_count += 1
                        except Exception as e:
                            print(f"[DB SYNC] Error restoring face image for {name}: {e}")
            if restored_count > 0:
                print(f"[DB SYNC] Restored {restored_count} missing face image(s) locally.")
        except Exception as e:
            print(f"[DB SYNC] Error in local face sync process: {e}")

    def create_class(self, class_name):
        """Creates a new class in the database"""
        if self.classes_collection is not None:
            try:
                # Check duplicate
                existing = self.classes_collection.find_one({"class_name": class_name})
                if existing:
                    return False, "Class already exists"
                self.classes_collection.insert_one({
                    "class_name": class_name,
                    "timestamp": datetime.now()
                })
                print(f"[DB] Created class '{class_name}' in MongoDB")
                return True, "Class created successfully"
            except Exception as e:
                print(f"[DB] Error creating class: {e}")
                return False, str(e)
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT class_name FROM classes WHERE class_name = ?", (class_name,))
                if cursor.fetchone():
                    conn.close()
                    return False, "Class already exists"
                cursor.execute(
                    "INSERT INTO classes (class_name, timestamp) VALUES (?, ?)",
                    (class_name, datetime.now().isoformat())
                )
                conn.commit()
                conn.close()
                print(f"[DB SQLite] Created class '{class_name}' in SQLite")
                return True, "Class created successfully"
            except Exception as e:
                print(f"[DB SQLite] Error creating class: {e}")
                return False, str(e)

    def get_all_classes(self):
        """Retrieves all classes. Defaults to standard classes if empty."""
        default_classes = ["Class 10-A", "Class 10-B", "Class 11-A", "Class 11-B", "Class 12-A", "Class 12-B"]
        
        classes = []
        if self.classes_collection is not None:
            try:
                records = self.classes_collection.find()
                for r in records:
                    name = r.get("class_name")
                    if name and name != "General":
                        classes.append(name)
            except Exception as e:
                print(f"[DB] Error getting classes from MongoDB: {e}")
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT class_name FROM classes WHERE class_name != 'General'")
                rows = cursor.fetchall()
                conn.close()
                for row in rows:
                    classes.append(row[0])
            except Exception as e:
                print(f"[DB SQLite] Error getting classes from SQLite: {e}")
                
        # If no classes in database, return defaults
        if not classes:
            return default_classes
        return classes

    def delete_class_db(self, class_name):
        """Deletes a class from the database"""
        if self.classes_collection is not None:
            try:
                self.classes_collection.delete_one({"class_name": class_name})
                print(f"[DB] Deleted class '{class_name}' from MongoDB")
                return True, "Class deleted successfully"
            except Exception as e:
                print(f"[DB] Error deleting class from MongoDB: {e}")
                return False, str(e)
        else:
            # SQLite fallback
            try:
                import sqlite3
                conn = sqlite3.connect(self.sqlite_db_path)
                cursor = conn.cursor()
                cursor.execute("DELETE FROM classes WHERE class_name = ?", (class_name,))
                conn.commit()
                conn.close()
                print(f"[DB SQLite] Deleted class '{class_name}' from SQLite")
                return True, "Class deleted successfully"
            except Exception as e:
                print(f"[DB SQLite] Error deleting class from SQLite: {e}")
                return False, str(e)

db = Database()
