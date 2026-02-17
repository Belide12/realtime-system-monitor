# Real-Time System Monitoring Dashboard (Kafka + Postgres + FastAPI + React)

<p align="center">
  <img src="docs\dashboard1.png.jpg" width="800"/>
</p>
<p align="center">
  <img src="docs\dashboard2.png.jpg" width="800"/>
</p>
A production-style real-time monitoring system that streams host metrics through Kafka, persists them to PostgreSQL, serves time-series APIs via FastAPI, and visualizes metrics in a React dashboard with alerts and host comparison.

## Features
- **Real-time ingestion**: Agent publishes system metrics to Kafka topic (`metrics`)
- **Streaming persistence**: Consumer writes metrics to PostgreSQL
- **FastAPI backend**: Time-series APIs for dashboard
- **React dashboard**
  - KPI cards (CPU / Memory / Disk)
  - Auto refresh + time range (recent points)
  - Alerts (WARNING/CRITICAL) with acknowledge/clear
  - **Host comparison**: overlay CPU lines for two hosts (demo-friendly)
- Dockerized infra (Kafka, Zookeeper, Postgres) via Docker Compose

## Tech Stack
- Python, FastAPI, psycopg2, psutil
- Apache Kafka
- PostgreSQL
- React (Vite) + Recharts
- Docker Compose

## Architecture
Agent → Kafka (`metrics`) → Consumer → Postgres → FastAPI → React Dashboard

---

## Run Locally (Windows)

### 1) Start infrastructure
From repo root:
```bash
docker compose up -d
docker ps

