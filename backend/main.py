import os
from datetime import datetime
from typing import Optional, List, Dict, Any

import psycopg2
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware


# IMPORTANT: use 5433 because Docker Postgres is mapped to 5433 on your machine
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", "5433"))
PG_DB = os.getenv("PG_DB", "monitor_db")
PG_USER = os.getenv("PG_USER", "monitor")
PG_PASSWORD = os.getenv("PG_PASSWORD", "monitor")


def get_conn():
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
    )


app = FastAPI(title="Real-Time System Monitor API")

# Allow frontend to call backend (React runs on a different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later you can restrict to http://localhost:5173
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/hosts")
def list_hosts():
    """Return distinct hosts sending metrics."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT host FROM system_metrics ORDER BY host;")
            rows = cur.fetchall()
    return {"hosts": [r[0] for r in rows]}


@app.get("/metrics/latest")
def latest_metrics(host: str = Query(..., description="Host name")):
    """Latest row for a host."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT host, ts, cpu_percent, mem_percent, disk_percent, net_sent_bytes, net_recv_bytes
                FROM system_metrics
                WHERE host = %s
                ORDER BY ts DESC
                LIMIT 1;
                """,
                (host,),
            )
            row = cur.fetchone()

    if not row:
        return {"host": host, "latest": None}

    keys = ["host", "ts", "cpu_percent", "mem_percent", "disk_percent", "net_sent_bytes", "net_recv_bytes"]
    return {"latest": dict(zip(keys, row))}

@app.get("/")
def root():
    return {"message": "System Monitor API is running. Try /health or /docs"}

@app.get("/metrics/range")
def metrics_range(
    host: str = Query(...),
    limit: int = Query(300, ge=10, le=5000, description="Max rows"),
):
    """
    Return recent time series for a host.
    (Simple version: last N points. Later we can add from/to timestamps.)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ts, cpu_percent, mem_percent, disk_percent
                FROM system_metrics
                WHERE host = %s
                ORDER BY ts DESC
                LIMIT %s;
                """,
                (host, limit),
            )
            rows = cur.fetchall()

    # Reverse to chronological order for charts
    rows.reverse()

    series = [
        {"ts": r[0].isoformat(), "cpu": float(r[1]), "mem": float(r[2]), "disk": float(r[3])}
        for r in rows
    ]
    return {"host": host, "points": series}