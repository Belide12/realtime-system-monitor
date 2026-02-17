import json
import os
import time
from datetime import datetime

import psycopg2
from confluent_kafka import Consumer


KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
TOPIC = os.getenv("KAFKA_TOPIC", "metrics")
GROUP_ID = os.getenv("KAFKA_GROUP_ID", "metrics-to-postgres")

PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", "5433"))
PG_DB = os.getenv("PG_DB", "monitor_db")
PG_USER = os.getenv("PG_USER", "monitor")
PG_PASSWORD = os.getenv("PG_PASSWORD", "monitor")


INSERT_SQL = """
INSERT INTO system_metrics
(host, ts, cpu_percent, mem_percent, disk_percent, net_sent_bytes, net_recv_bytes)
VALUES (%s, %s, %s, %s, %s, %s, %s)
"""


def parse_ts(ts_str: str):
    # Incoming is ISO 8601 like "2026-02-02T...+00:00"
    # psycopg2 can accept ISO strings directly, but we validate lightly:
    return ts_str


def connect_db():
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD,
    )


def main():
    print(f"✅ Consumer starting. Kafka={KAFKA_BOOTSTRAP} topic={TOPIC} group={GROUP_ID}")
    print(f"✅ Postgres={PG_HOST}:{PG_PORT} db={PG_DB} user={PG_USER}")

    c = Consumer(
        {
            "bootstrap.servers": KAFKA_BOOTSTRAP,
            "group.id": GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    c.subscribe([TOPIC])

    conn = None
    cur = None

    try:
        conn = connect_db()
        conn.autocommit = False
        cur = conn.cursor()

        while True:
            msg = c.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                print(f"[KAFKA ERROR] {msg.error()}")
                continue

            try:
                payload = json.loads(msg.value().decode("utf-8"))

                cur.execute(
                    INSERT_SQL,
                    (
                        payload["host"],
                        parse_ts(payload["ts"]),
                        float(payload["cpu_percent"]),
                        float(payload["mem_percent"]),
                        float(payload["disk_percent"]),
                        int(payload["net_sent_bytes"]),
                        int(payload["net_recv_bytes"]),
                    ),
                )
                conn.commit()
                c.commit(msg)

                print(
                    f"Inserted: host={payload['host']} ts={payload['ts']} cpu={payload['cpu_percent']} mem={payload['mem_percent']}"
                )

            except Exception as e:
                if conn:
                    conn.rollback()
                print(f"[PROCESSING ERROR] {e}")
                # do NOT commit offset on failure (so message can be retried)

    except KeyboardInterrupt:
        print("\nStopping consumer...")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
        c.close()
        print("✅ Consumer stopped.")


if __name__ == "__main__":
    main()