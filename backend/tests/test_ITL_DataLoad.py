import datetime
import pyodbc

# 1. Connection Setup
server_ip = "10.10.200.205"
port = "1433"
database = "ACP_Internal"
username = "acpdev"
password = "Glass-Shelter-Car"

conn_str = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={server_ip},{port};"
    f"DATABASE={database};"
    f"UID={username};"
    f"PWD={password};"
)
# For Employees Table ---------------------------------------------------------------------------------------------
test_data = [
    (2, "Gandhi Mahaan", "Sharma", "GandhiMahaan.sharma@email.com", datetime.datetime.now(), True, 85000.00),
    (11, "Rajeev Gandhi", "Patel", "RajeevGandhi.patel@email.com", datetime.datetime.now(), True, 92000.00)
]

# 3. Query Definitions
insert_query = """
INSERT INTO dbo.[Employees] 
([DepartmentID], [FirstName], [LastName], [Email], [HireDate], [IsActive], [Salary])
VALUES (?, ?, ?, ?, ?, ?, ?);
"""

select_query = """
SELECT [EmployeeID], [DepartmentID], [FirstName], [LastName], [Email], [HireDate], [IsActive], [Salary] 
FROM dbo.[Employees];
"""
# --------------------------------------------------------------------------------------------------------------------------

# # For Departments Table ------------------------------------------------------------------------------------------
# test_data = [
#     (datetime.datetime.now(), "Swimmer", "India"),
#     (datetime.datetime.now(), "Runner", "Malaysia")
# ]

# insert_query = """
# INSERT INTO dbo.[Departments] ([CreatedDate], [DepartmentName], [Location])
# VALUES (?, ?, ?);
# """

# select_query = "SELECT [DepartmentID], [DepartmentName], [Location], [CreatedDate] FROM dbo.[Departments];"

# # ------------------------------------------------------------------------------------------------------------------

# 3. Execution Block
try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Step A: Run insertion
    cursor.executemany(insert_query, test_data)
    conn.commit()
    print(f"Successfully inserted {len(test_data)} test rows.")
    
    # Step B: Run selection
    cursor.execute(select_query)
    rows = cursor.fetchall()
    
    print("\n--- Departments Table Contents ---")
    for row in rows:
        print(row)
        
except Exception as e:
    print(f"Database operation failed: {e}")
finally:
    if 'conn' in locals():
        cursor.close()
        conn.close()
