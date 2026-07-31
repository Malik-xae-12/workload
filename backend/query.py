import sqlite3

def get_blob_conn():
    conn = sqlite3.connect('app/app.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute('''
        SELECT c.* 
        FROM source_connections c
        JOIN project_source_connections psc ON c.id = psc.source_connection_id
        WHERE psc.project_id = 'a8204c38-e6ea-4a4e-a9ef-d400aa8cf0bd'
    ''')
    conns = cur.fetchall()
    print("Project p3 connections:", [dict(c) for c in conns])

get_blob_conn()
