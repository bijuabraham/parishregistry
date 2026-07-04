import os
import json
import time
import math
import sqlite3
import urllib.request
import urllib.parse
import pandas as pd

# Coordinates for Church: 418 Junction Ave, Livermore, CA 94551
CHURCH_LAT = 37.68968
CHURCH_LON = -121.75836

WORKSPACE_DIR = "/Users/bijuabraham/Documents/GitHub/parishregistry"
CACHE_PATH = os.path.join(WORKSPACE_DIR, "geocoding_cache.json")
DB_PATH = os.path.join(WORKSPACE_DIR, "parish.db")

# Load geocoding cache
if os.path.exists(CACHE_PATH):
    try:
        with open(CACHE_PATH, "r") as f:
            geocoding_cache = json.load(f)
    except Exception as e:
        print(f"Error loading cache: {e}")
        geocoding_cache = {}
else:
    geocoding_cache = {}

def save_cache():
    try:
        with open(CACHE_PATH, "w") as f:
            json.dump(geocoding_cache, f, indent=2)
    except Exception as e:
        print(f"Error saving cache: {e}")

def geocode_address(address_1, city, state, zip_code):
    # Construct various query variations for geocoding
    full_address = f"{address_1}, {city}, {state} {zip_code}, United States"
    clean_address = ''.join(c for c in full_address if c.isalnum() or c in ' ,.-').strip()
    
    if clean_address in geocoding_cache:
        return geocoding_cache[clean_address]
    
    # Try geocoding variations
    queries = [
        f"{address_1}, {city}, {state} {zip_code}, USA",
        f"{address_1}, {city}, {state}, USA",
        f"{city}, {state} {zip_code}, USA",
        f"{zip_code}, USA",
        f"{city}, {state}, USA"
    ]
    
    for q in queries:
        url_q = urllib.parse.quote(q)
        url = f"https://nominatim.openstreetmap.org/search?q={url_q}&format=json&limit=1"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "ParishRegistryApp/1.0 (bijuabraham@gmail.com)"
            }
        )
        try:
            print(f"Geocoding online: {q} ...")
            time.sleep(1.0) # Respect rate limits
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    res = {"lat": lat, "lon": lon, "matched_query": q}
                    geocoding_cache[clean_address] = res
                    save_cache()
                    return res
        except Exception as e:
            print(f"Error geocoding '{q}': {e}")
            time.sleep(1.0)
            
    # Default fallback to church coordinates if geocoding fails completely
    res = {"lat": CHURCH_LAT, "lon": CHURCH_LON, "fallback": True}
    geocoding_cache[clean_address] = res
    save_cache()
    return res

def calculate_distance(lat1, lon1, lat2, lon2):
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    # Haversine formula
    R = 3958.8  # Radius of Earth in miles
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def format_date(val):
    if pd.isnull(val):
        return None
    # If it is a timestamp or datetime
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    
    # Try converting string representation
    val_str = str(val).strip()
    if not val_str or val_str == "nan" or val_str == "0000-00-00" or val_str == "0":
        return None
        
    try:
        # Check standard MM/DD/YYYY
        dt = pd.to_datetime(val_str)
        return dt.strftime("%Y-%m-%d")
    except:
        return val_str

def parse_and_load():
    print("Reading Excel files...")
    export_path = os.path.join(WORKSPACE_DIR, "ExportFile.xls")
    envelope_path = os.path.join(WORKSPACE_DIR, "Envelope.xls")
    groups_path = os.path.join(WORKSPACE_DIR, "GroupsH.xls")
    
    df_export = pd.read_excel(export_path)
    df_envelope = pd.read_excel(envelope_path)
    df_groups = pd.read_excel(groups_path)
    
    # 1. Build Household to Envelope Mapping
    print("Mapping envelopes...")
    hh_to_envelope = {}
    for idx, row in df_envelope.iterrows():
        hh_id = row["Household Record ID"]
        donor_num = row["Donor Number"]
        if pd.notnull(hh_id) and pd.notnull(donor_num):
            hh_id = int(hh_id)
            donor_str = str(int(donor_num))
            if hh_id in hh_to_envelope:
                hh_to_envelope[hh_id].add(donor_str)
            else:
                hh_to_envelope[hh_id] = {donor_str}
                
    hh_envelope_str = {k: ", ".join(sorted(list(v))) for k, v in hh_to_envelope.items()}
    
    # 2. Build Household to Group Mapping
    print("Mapping prayer groups...")
    hh_to_group = {}
    for idx, row in df_groups.iterrows():
        hh_id = row["Household Record ID"]
        grp_name = row["grpName"]
        if pd.notnull(hh_id) and pd.notnull(grp_name):
            hh_to_group[int(hh_id)] = str(grp_name).strip()
            
    # 3. Create SQLite Database and Schema
    print("Initializing SQLite database...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE households (
        household_id INTEGER PRIMARY KEY,
        added_date TEXT,
        last_changed_date TEXT,
        status_date TEXT,
        last_name TEXT,
        first_name TEXT,
        mail_to TEXT,
        address_1 TEXT,
        address_2 TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        phone TEXT,
        status TEXT,
        envelope_number TEXT,
        prayer_group TEXT,
        latitude REAL,
        longitude REAL,
        distance_miles REAL
    )
    """)
    
    cursor.execute("""
    CREATE TABLE members (
        member_id INTEGER PRIMARY KEY AUTOINCREMENT,
        household_id INTEGER,
        member_index INTEGER,
        first_name TEXT,
        last_name TEXT,
        relationship TEXT,
        gender TEXT,
        birth_date TEXT,
        age INTEGER,
        marriage_date TEXT,
        mobile_phone TEXT,
        personal_email TEXT,
        work_email TEXT,
        other_email TEXT,
        home_phone TEXT,
        work_phone TEXT,
        status TEXT,
        date_added TEXT,
        status_date TEXT,
        FOREIGN KEY(household_id) REFERENCES households(household_id)
    )
    """)
    
    # 4. Ingest data
    print(f"Parsing {len(df_export)} households from ExportFile.xls...")
    
    for idx, row in df_export.iterrows():
        hh_id = int(row["Household Record ID"])
        
        # Parse Dates
        added_date = format_date(row.get("hseAddedDate"))
        last_changed = row.get("hseLastDateChanged")
        # last_changed might be a datetime
        if hasattr(last_changed, "strftime"):
            last_changed_date = last_changed.strftime("%Y-%m-%d %H:%M:%S")
        else:
            last_changed_date = str(last_changed) if pd.notnull(last_changed) else None
            
        status_date = format_date(row.get("Status Date"))
        
        last_name = str(row["LastName"]).strip() if pd.notnull(row["LastName"]) else None
        first_name = str(row["FirstName"]).strip() if pd.notnull(row["FirstName"]) else None
        mail_to = str(row["MailTo"]).strip() if pd.notnull(row["MailTo"]) else None
        
        address_1 = str(row["Address Line One"]).strip() if pd.notnull(row["Address Line One"]) else ""
        address_2 = str(row["Address Line Two"]).strip() if pd.notnull(row["Address Line Two"]) else None
        city = str(row["City"]).strip() if pd.notnull(row["City"]) else ""
        state = str(row["State"]).strip() if pd.notnull(row["State"]) else ""
        
        # ZIP can be float, int, or string
        zip_val = row["Zip"]
        if pd.isnull(zip_val):
            zip_code = ""
        elif isinstance(zip_val, float):
            zip_code = str(int(zip_val))
        else:
            zip_code = str(zip_val).strip()
            
        phone = str(row["HousePhone"]).strip() if pd.notnull(row["HousePhone"]) else None
        status = str(row["Status"]).strip() if pd.notnull(row["Status"]) else None
        
        envelope = hh_envelope_str.get(hh_id)
        prayer_group = hh_to_group.get(hh_id) # Leave None if not found, like Lynn Riya John
        
        # Geocode and calculate distance
        coords = geocode_address(address_1, city, state, zip_code)
        lat = coords.get("lat")
        lon = coords.get("lon")
        distance = calculate_distance(CHURCH_LAT, CHURCH_LON, lat, lon)
        
        # Insert household
        cursor.execute("""
        INSERT INTO households (
            household_id, added_date, last_changed_date, status_date, last_name, first_name,
            mail_to, address_1, address_2, city, state, zip, phone, status, envelope_number,
            prayer_group, latitude, longitude, distance_miles
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            hh_id, added_date, last_changed_date, status_date, last_name, first_name,
            mail_to, address_1, address_2, city, state, zip_code, phone, status, envelope,
            prayer_group, lat, lon, distance
        ))
        
        # Extract members
        for i in range(1, 9):
            mem_col = f"Member{i}"
            if mem_col in df_export.columns:
                m_first_name = row[mem_col]
                if pd.notnull(m_first_name):
                    m_first_name = str(m_first_name).strip()
                    m_rel = str(row.get(f"Relationship{i}")).strip() if pd.notnull(row.get(f"Relationship{i}")) else None
                    m_gender = str(row.get(f"Gender{i}")).strip() if pd.notnull(row.get(f"Gender{i}")) else None
                    
                    m_birth = format_date(row.get(f"BirthDate{i}"))
                    
                    # Age can be float or int
                    age_val = row.get(f"Age{i}")
                    m_age = int(age_val) if pd.notnull(age_val) else None
                    
                    m_marr = format_date(row.get(f"Marriage{i}"))
                    
                    m_email = str(row.get(f"Personal Email{i}")).strip() if pd.notnull(row.get(f"Personal Email{i}")) else None
                    m_work_email = str(row.get(f"Work Email{i}")).strip() if pd.notnull(row.get(f"Work Email{i}")) else None
                    m_other_email = str(row.get(f"Other{i}")).strip() if pd.notnull(row.get(f"Other{i}")) else None
                    
                    m_mobile = str(row.get(f"Mobile{i}")).strip() if pd.notnull(row.get(f"Mobile{i}")) else None
                    m_home_phone = str(row.get(f"Home{i}")).strip() if pd.notnull(row.get(f"Home{i}")) else None
                    m_work_phone = str(row.get(f"Work{i}")).strip() if pd.notnull(row.get(f"Work{i}")) else None
                    
                    m_status = str(row.get(f"Status{i}")).strip() if pd.notnull(row.get(f"Status{i}")) else None
                    m_added = format_date(row.get(f"DateAdded{i}"))
                    m_status_date = format_date(row.get(f"StatusDate{i}"))
                    
                    cursor.execute("""
                    INSERT INTO members (
                        household_id, member_index, first_name, last_name, relationship, gender,
                        birth_date, age, marriage_date, mobile_phone, personal_email, work_email,
                        other_email, home_phone, work_phone, status, date_added, status_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        hh_id, i, m_first_name, last_name, m_rel, m_gender,
                        m_birth, m_age, m_marr, m_mobile, m_email, m_work_email,
                        m_other_email, m_home_phone, m_work_phone, m_status, m_added, m_status_date
                    ))
                    
    conn.commit()
    
    # Run sanity checks
    cursor.execute("SELECT COUNT(*) FROM households")
    hh_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM members")
    mem_count = cursor.fetchone()[0]
    
    print(f"\nParsing complete!")
    print(f"Households written: {hh_count} (expected 187)")
    print(f"Members written: {mem_count}")
    
    cursor.execute("SELECT COUNT(*) FROM households WHERE prayer_group IS NULL")
    null_group_count = cursor.fetchone()[0]
    print(f"Households with unassigned/empty prayer group: {null_group_count}")
    
    conn.close()

if __name__ == "__main__":
    parse_and_load()
