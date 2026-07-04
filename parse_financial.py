import os
import sqlite3
import pandas as pd
import sys

WORKSPACE_DIR = "/Users/bijuabraham/Documents/GitHub/parishregistry"
DB_PATH = os.path.join(WORKSPACE_DIR, "parish.db")

def parse_financial_data(year=None, filename=None):
    """Parse FundActivitySpreadsheet and add to database"""

    # Determine which file to read
    if filename:
        fund_file = os.path.join(WORKSPACE_DIR, filename)
    elif year:
        fund_file = os.path.join(WORKSPACE_DIR, f"FundActivitySpreadsheet_{year}.xls")
    else:
        fund_file = os.path.join(WORKSPACE_DIR, "FundActivitySpreadsheet.xls")

    if not os.path.exists(fund_file):
        print(f"Error: {fund_file} not found")
        return False

    print(f"Reading {fund_file}...")

    df = pd.read_excel(fund_file)
    print(f"Found {len(df)} contribution records")

    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create financial_contributions table if not exists (with year column)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        donor_number TEXT,
        fund_name TEXT,
        giving_date TEXT,
        amount REAL,
        comment TEXT,
        currency_type TEXT,
        check_number TEXT,
        family_first_name TEXT,
        family_last_name TEXT,
        address_line_1 TEXT,
        address_line_2 TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        status TEXT,
        member_first_name TEXT,
        member_last_name TEXT,
        batch_name TEXT,
        batch_id INTEGER,
        household_id INTEGER,
        import_year INTEGER,
        FOREIGN KEY(household_id) REFERENCES households(household_id)
    )
    """)

    # Add import_year column if it doesn't exist (for existing databases)
    try:
        cursor.execute("ALTER TABLE financial_contributions ADD COLUMN import_year INTEGER")
    except:
        pass  # Column already exists

    # If year is specified, clear only that year's data
    if year:
        cursor.execute("DELETE FROM financial_contributions WHERE import_year = ?", (year,))
        print(f"Cleared existing data for year {year}")
    else:
        # Clear all financial data if no year specified
        cursor.execute("DELETE FROM financial_contributions")

    # Get mapping from envelope_number to household_id
    cursor.execute("SELECT household_id, envelope_number FROM households WHERE envelope_number IS NOT NULL AND envelope_number != ''")
    hh_mapping = {}
    for hh_id, envelope in cursor.fetchall():
        if envelope:
            # Handle multiple envelope numbers
            for env in envelope.split(', '):
                hh_mapping[env.strip()] = hh_id

    print(f"Found {len(hh_mapping)} households with envelope numbers")

    # Determine the import year from file if not provided
    import_year = year
    if not import_year:
        # Try to extract year from filename
        if filename:
            try:
                import_year = int(filename.split('_')[-1].replace('.xls', '').replace('.xlsx', ''))
            except:
                import_year = None
        else:
            # Use the giving dates to determine year
            import_year = None

    # Insert financial data
    inserted = 0
    for idx, row in df.iterrows():
        donor_num = str(int(row['Donor Number'])) if pd.notnull(row['Donor Number']) else None
        household_id = hh_mapping.get(donor_num) if donor_num else None

        # Parse date
        giving_date = None
        actual_year = import_year
        if pd.notnull(row['Giving Date']):
            if hasattr(row['Giving Date'], 'strftime'):
                giving_date = row['Giving Date'].strftime("%Y-%m-%d")
                actual_year = row['Giving Date'].year
            else:
                try:
                    dt = pd.to_datetime(row['Giving Date'])
                    giving_date = dt.strftime("%Y-%m-%d")
                    actual_year = dt.year
                except:
                    giving_date = str(row['Giving Date'])

        # Use actual year from the giving date if available
        if not import_year and actual_year:
            import_year = actual_year

        amount = float(row['Amount']) if pd.notnull(row['Amount']) else 0

        # Handle check number - can be numeric or string like 'EFT'
        check_number = None
        if pd.notnull(row['Check Number']):
            try:
                check_number = str(int(row['Check Number']))
            except (ValueError, TypeError):
                check_number = str(row['Check Number'])

        # Handle batch_id
        batch_id = None
        if pd.notnull(row['Batch ID']):
            try:
                batch_id = int(row['Batch ID'])
            except (ValueError, TypeError):
                batch_id = None

        cursor.execute("""
        INSERT INTO financial_contributions (
            donor_number, fund_name, giving_date, amount, comment, currency_type,
            check_number, family_first_name, family_last_name, address_line_1,
            address_line_2, city, state, zip_code, status, member_first_name,
            member_last_name, batch_name, batch_id, household_id, import_year
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            donor_num,
            str(row['Fund Name']) if pd.notnull(row['Fund Name']) else None,
            giving_date,
            amount,
            str(row['Comment']) if pd.notnull(row['Comment']) else None,
            str(row['Currency Type']) if pd.notnull(row['Currency Type']) else None,
            check_number,
            str(row['Family First Name']) if pd.notnull(row['Family First Name']) else None,
            str(row['Family Last Name']) if pd.notnull(row['Family Last Name']) else None,
            str(row['Address Line 1']) if pd.notnull(row['Address Line 1']) else None,
            str(row['Address Line 2']) if pd.notnull(row['Address Line 2']) else None,
            str(row['City']) if pd.notnull(row['City']) else None,
            str(row['State']) if pd.notnull(row['State']) else None,
            str(row['Zip Code']) if pd.notnull(row['Zip Code']) else None,
            str(row['Status']) if pd.notnull(row['Status']) else None,
            str(row['Member First Name']) if pd.notnull(row['Member First Name']) else None,
            str(row['Member Last Name']) if pd.notnull(row['Member Last Name']) else None,
            str(row['Batch Name']) if pd.notnull(row['Batch Name']) else None,
            batch_id,
            household_id,
            import_year
        ))
        inserted += 1

    conn.commit()

    # Get statistics
    cursor.execute("SELECT COUNT(*) FROM financial_contributions")
    total_records = cursor.fetchone()[0]

    cursor.execute("SELECT SUM(amount) FROM financial_contributions")
    total_amount = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COUNT(DISTINCT donor_number) FROM financial_contributions")
    unique_donors = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(DISTINCT household_id) FROM financial_contributions WHERE household_id IS NOT NULL")
    households_with_giving = cursor.fetchone()[0]

    print(f"\nFinancial data import complete!")
    print(f"Total contribution records: {total_records}")
    print(f"Total amount: ${total_amount:,.2f}")
    print(f"Unique donors: {unique_donors}")
    print(f"Households with giving: {households_with_giving}")
    print(f"Import year: {import_year}")

    conn.close()
    return True

if __name__ == "__main__":
    # Check for command line arguments
    year = None
    filename = None

    if len(sys.argv) > 1:
        year = int(sys.argv[1])
    if len(sys.argv) > 2:
        filename = sys.argv[2]

    parse_financial_data(year, filename)
