import json
import os
import socket
import time
from datetime import datetime, timezone

import psutil
from confluent_kafka import Producer


KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
TOPIC = os.getenv("KAFKA_TOPIC", "metrics")
INTERVAL_SEC = float(os.getenv("INTERVAL_SEC", "2.0"))


def collect_metrics(hostname: str) -> dict:
    # cpu_percent needs a prior call; psutil handles it over time
    cpu = psutil.cpu_percent(interval=None)

    mem = psutil.virtual_memory().percent
    disk = psutil.disk_usage("/").percent

    net = psutil.net_io_counters()
    payload = {
        "host": hostname,
        "ts": datetime.now(timezone.utc).isoformat(),
        "cpu_percent": cpu,
        "mem_percent": mem,
        "disk_percent": disk,
        "net_sent_bytes": net.bytes_sent,
        "net_recv_bytes": net.bytes_recv,
    }
    return payload


def delivery_report(err, msg):
    if err is not None:
        print(f"[DELIVERY ERROR] {err}")
    else:
        # Uncomment for verbose debug:
        # print(f"[DELIVERED] {msg.topic()} [{msg.partition()}] @ offset {msg.offset()}")
        pass


def main():
    hostname = os.getenv("HOSTNAME_OVERRIDE") or socket.gethostname()

    producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})

    print(f"✅ Agent started. Sending to topic='{TOPIC}' at '{KAFKA_BOOTSTRAP}' every {INTERVAL_SEC}s")
    print(f"Host: {hostname}\nPress Ctrl+C to stop.\n")

    try:
        while True:
            payload = collect_metrics(hostname)
            producer.produce(
                TOPIC,
                value=json.dumps(payload).encode("utf-8"),
                callback=delivery_report,
            )
            producer.poll(0)  # serve delivery callbacks
            print(payload)    # show what you're sending
            time.sleep(INTERVAL_SEC)
    except KeyboardInterrupt:
        print("\nStopping agent...")
    finally:
        producer.flush(5)
        print("✅ Agent stopped.")


if __name__ == "__main__":
    # Prime cpu_percent so first read isn't 0.0
    psutil.cpu_percent(interval=None)
    main()