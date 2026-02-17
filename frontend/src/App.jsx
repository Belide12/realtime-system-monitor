import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const API_BASE = "http://localhost:8000";

// Alert thresholds
const THRESHOLDS = { cpu: 80, mem: 90, disk: 85 };
// Avoid duplicate alerts too frequently (ms)
const ALERT_COOLDOWN_MS = 30_000;

const styles = {
  page: { minHeight: "100vh", background: "#0b0f14", color: "#e8eef7", fontFamily: "system-ui, Arial", padding: 20 },
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 },
  title: { fontSize: 28, margin: 0, fontWeight: 800 },
  subtitle: { opacity: 0.7, marginTop: 6 },
  controls: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  select: { padding: "6px 10px", borderRadius: 10, background: "#111826", color: "#e8eef7", border: "1px solid #22304a" },
  button: { padding: "8px 12px", borderRadius: 10, background: "#111826", color: "#e8eef7", border: "1px solid #22304a", cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 },
  card: { background: "#0f1623", border: "1px solid #22304a", borderRadius: 16, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" },
  kpiValue: { fontSize: 34, fontWeight: 800, marginTop: 6 },
  layout: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" },
  alertItem: { background: "#0b1220", border: "1px solid #22304a", borderRadius: 14, padding: 12 },
};

function pct(v) {
  if (v === null || v === undefined) return "--";
  return `${Number(v).toFixed(1)}%`;
}

function colorFor(metric, value) {
  const t = THRESHOLDS[metric];
  if (value == null) return "#9fb3c8";
  if (value >= t) return "#ff4d4f";
  if (value >= t * 0.8) return "#ffa940";
  return "#52c41a";
}

function severity(metric, value) {
  const t = THRESHOLDS[metric];
  if (value >= t) return "CRITICAL";
  if (value >= t * 0.8) return "WARNING";
  return "OK";
}

export default function App() {
  const [hosts, setHosts] = useState([]);
  const [host, setHost] = useState("");
  const [points, setPoints] = useState([]);
  const [paused, setPaused] = useState(false);
  const [refreshMs, setRefreshMs] = useState(2000);
  const [limit, setLimit] = useState(120);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  // Alerts state
  const [alerts, setAlerts] = useState([]); // {id, ts, host, metric, value, level, message, ack}
  const lastAlertAtRef = useRef({}); // key -> timestamp (for cooldown)

  useEffect(() => {
    fetch(`${API_BASE}/hosts`)
      .then((r) => r.json())
      .then((j) => {
        const hs = j.hosts || [];
        setHosts(hs);
        if (hs.length) setHost(hs[0]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const load = async () => {
    if (!host) return;
    try {
      const r = await fetch(`${API_BASE}/metrics/range?host=${encodeURIComponent(host)}&limit=${limit}`);
      const j = await r.json();
      setPoints(j.points || []);
      setError("");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (!host || paused) return;
    load();
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, paused, refreshMs, limit]);

  const latest = points.length ? points[points.length - 1] : null;
  const cpu = latest?.cpu ?? null;
  const mem = latest?.mem ?? null;
  const disk = latest?.disk ?? null;

  const stats = useMemo(() => {
    if (!points.length) return { cpuAvg: null, memAvg: null, diskAvg: null };
    const avg = (k) => points.reduce((a, p) => a + (Number(p[k]) || 0), 0) / points.length;
    return { cpuAvg: avg("cpu"), memAvg: avg("mem"), diskAvg: avg("disk") };
  }, [points]);

  // ---- Alerts engine (frontend-only) ----
  useEffect(() => {
    if (!latest || !host) return;

    const now = Date.now();

    const maybeAlert = (metric, value) => {
      if (value == null) return;
      const level = severity(metric, value);
      if (level === "OK") return;

      // cooldown key includes host + metric + level
      const key = `${host}:${metric}:${level}`;
      const lastAt = lastAlertAtRef.current[key] || 0;
      if (now - lastAt < ALERT_COOLDOWN_MS) return;

      lastAlertAtRef.current[key] = now;

      const id = `${now}-${Math.random().toString(16).slice(2)}`;
      const message =
        level === "CRITICAL"
          ? `${metric.toUpperCase()} crossed threshold (${pct(value)} ≥ ${THRESHOLDS[metric]}%)`
          : `${metric.toUpperCase()} is approaching threshold (${pct(value)})`;

      setAlerts((prev) => [
        {
          id,
          ts: new Date().toISOString(),
          host,
          metric,
          value,
          level,
          message,
          ack: false,
        },
        ...prev,
      ].slice(0, 20)); // keep last 20
    };

    maybeAlert("cpu", cpu);
    maybeAlert("mem", mem);
    maybeAlert("disk", disk);
  }, [cpu, mem, disk, host, latest]);

  const ackAlert = (id) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ack: true } : a)));
  const clearAlerts = () => setAlerts([]);
  const clearAcked = () => setAlerts((prev) => prev.filter((a) => !a.ack));

  const activeCount = alerts.filter((a) => !a.ack).length;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Real-Time System Monitor</h1>
          <div style={styles.subtitle}>
            Backend: {API_BASE} • Refresh: {paused ? "Paused" : `${refreshMs / 1000}s`} • Last updated: {lastUpdated || "--"}
          </div>
        </div>

        <div style={styles.controls}>
          <label>
            Host:&nbsp;
            <select style={styles.select} value={host} onChange={(e) => setHost(e.target.value)}>
              {hosts.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>

          <label>
            Range:&nbsp;
            <select style={styles.select} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={60}>~1–2 min</option>
              <option value={120}>~3–5 min</option>
              <option value={300}>~10–15 min</option>
            </select>
          </label>

          <label>
            Refresh:&nbsp;
            <select style={styles.select} value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))}>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </label>

          <button style={styles.button} onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button style={styles.button} onClick={load}>Refresh now</button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#ff4d4f", marginBottom: 10 }}>
          Error: {error} (Make sure backend is running on :8000)
        </div>
      )}

      {/* KPI Cards */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={{ opacity: 0.7 }}>CPU</div>
          <div style={{ ...styles.kpiValue, color: colorFor("cpu", cpu) }}>{pct(cpu)}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>Avg (range): {pct(stats.cpuAvg)}</div>
        </div>

        <div style={styles.card}>
          <div style={{ opacity: 0.7 }}>Memory</div>
          <div style={{ ...styles.kpiValue, color: colorFor("mem", mem) }}>{pct(mem)}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>Avg (range): {pct(stats.memAvg)}</div>
        </div>

        <div style={styles.card}>
          <div style={{ opacity: 0.7 }}>Disk</div>
          <div style={{ ...styles.kpiValue, color: colorFor("disk", disk) }}>{pct(disk)}</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>Avg (range): {pct(stats.diskAvg)}</div>
        </div>
      </div>

      {/* Main layout */}
      <div style={styles.layout}>
        {/* Chart */}
        <div style={styles.card}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Live Chart</div>
          <div style={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" hide />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="cpu" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="mem" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="disk" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerts panel */}
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>
              Alerts {activeCount ? <span style={{ color: "#ff4d4f" }}>({activeCount})</span> : <span style={{ color: "#52c41a" }}>(0)</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.button} onClick={clearAcked}>Clear acked</button>
              <button style={styles.button} onClick={clearAlerts}>Clear all</button>
            </div>
          </div>

          <div style={{ opacity: 0.7, marginTop: 8, fontSize: 12 }}>
            Generates WARNING at 80% of threshold and CRITICAL at threshold.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10, maxHeight: 380, overflow: "auto", paddingRight: 4 }}>
            {alerts.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No alerts yet ✅</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} style={styles.alertItem}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, color: a.level === "CRITICAL" ? "#ff4d4f" : "#ffa940" }}>
                      {a.level} • {a.metric.toUpperCase()}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{new Date(a.ts).toLocaleTimeString()}</div>
                  </div>

                  <div style={{ marginTop: 6 }}>{a.message}</div>
                  <div style={{ opacity: 0.75, marginTop: 6, fontSize: 12 }}>
                    Host: <b>{a.host}</b> • Value: <b>{pct(a.value)}</b>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>
                      Status: {a.ack ? <span style={{ color: "#52c41a" }}>ACKED</span> : <span style={{ color: "#ff4d4f" }}>ACTIVE</span>}
                    </div>
                    {!a.ack && (
                      <button style={styles.button} onClick={() => ackAlert(a.id)}>
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
            Cooldown: {ALERT_COOLDOWN_MS / 1000}s per metric/level to avoid duplicates.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
        Tip: If you want to trigger alerts, run a heavy task to increase CPU (e.g., multiple browser tabs / build command).
      </div>
    </div>
  );
}
