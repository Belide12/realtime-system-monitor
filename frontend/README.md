# Real-Time System Monitoring Dashboard (Kafka + Postgres + FastAPI + React)

![Dashboard]("C:\Users\91939\Downloads\dashboard1.png.jpg")
![Dashboard]("C:\Users\91939\Downloads\dashboard2.png.jpg")


A production-style real-time monitoring system that streams host metrics through Kafka, persists them to PostgreSQL, serves time-series APIs via FastAPI, and visualizes metrics in a React dashboard with **alerts** and **host comparison**.

## Features
- **Real-time ingestion**: Agent publishes system metrics to Kafka topic (`metrics`)
- **Streaming persistence**: Consumer writes metrics to PostgreSQL
- **FastAPI backend**: Time-series APIs for dashboard
- **React dashboard**:
  - KPI cards (CPU/MEM/DISK)
  - Time range + refresh controls
  - Alerts (WARNING/CRITICAL) with acknowledge/clear
  - Host comparison (overlay two hosts)
- Dockerized infra: Kafka, Zookeeper, Postgres via Docker Compose

## Tech Stack
- Python, FastAPI, psycopg2, psutil
- Apache Kafka
- PostgreSQL
- React (Vite) + Recharts
- Docker Compose

## Architecture
Agent → Kafka (`metrics`) → Consumer → Postgres → FastAPI → React Dashboard

---

## Setup & Run (Windows)

### 1) Start infrastructure
From repo root:
```bash
docker compose up -d
docker ps

Create Kafka Topic


