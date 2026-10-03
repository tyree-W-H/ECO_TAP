"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./SensorDashboard.module.css";

type Reading = {
  DeviceID: string;
  Timestamp: number; // ms since epoch
  temperature: number; // °C
  timestamp: number; // s since epoch
};

const POLL_MS = 10_000; // device reports roughly every 10 s
const STALE_AFTER_MS = 60_000; // no reading for a minute = not reporting

const fetcher = async (url: string): Promise<Reading[]> => {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  if (!Array.isArray(body)) throw new Error("Unexpected response shape");
  return body;
};

// The device sometimes publishes the same reading several times within a few ms.
// Keep one reading per device per second, oldest first.
function clean(rows: Reading[]): Reading[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => a.Timestamp - b.Timestamp)
    .filter((r) => {
      const key = `${r.DeviceID}:${r.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const stamp = (ms: number) =>
  new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });

export default function SensorDashboard() {
  const { data, error, isLoading } = useSWR<Reading[]>("/api/readings", fetcher, {
    refreshInterval: POLL_MS,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(() => clean(data ?? []), [data]);
  const devices = useMemo(() => [...new Set(all.map((r) => r.DeviceID))], [all]);
  const [picked, setPicked] = useState<string | null>(null);
  const device = picked && devices.includes(picked) ? picked : devices[0];
  const rows = useMemo(() => all.filter((r) => r.DeviceID === device), [all, device]);

  if (isLoading) return <main className={styles.page}><p>Loading readings…</p></main>;

  if (error && !data) {
    return (
      <main className={styles.page}>
        <p className={styles.problem} role="alert">
          Can’t load readings: {error.message}. Check that /api/readings is reachable.
        </p>
      </main>
    );
  }

  if (rows.length === 0) {
    return (
      <main className={styles.page}>
        <p>No readings yet. Power on a sensor and it will show up here.</p>
      </main>
    );
  }

  const latest = rows[rows.length - 1];
  const age = Math.max(0, now - latest.Timestamp);
  const stale = age > STALE_AFTER_MS;
  const temps = rows.map((r) => r.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={stale ? styles.stale : styles.live} role="status">
            {stale ? "Not reporting" : "Reporting"}
          </p>
          <h1 className={styles.temp}>
            {latest.temperature.toFixed(1)}
            <span className={styles.unit}>°C</span>
          </h1>
          <p className={styles.meta}>
            {device}, last reading {ago(age)} ({stamp(latest.Timestamp)})
          </p>
        </div>

        <dl className={styles.range}>
          <div><dt>Low</dt><dd>{min.toFixed(1)}°</dd></div>
          <div><dt>High</dt><dd>{max.toFixed(1)}°</dd></div>
          <div><dt>Readings</dt><dd>{rows.length}</dd></div>
        </dl>
      </header>

      {devices.length > 1 && (
        <label className={styles.picker}>
          Sensor{" "}
          <select value={device} onChange={(e) => setPicked(e.target.value)}>
            {devices.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      )}

      {error && (
        <p className={styles.problem} role="alert">
          Refresh failed ({error.message}). Showing the last readings received.
        </p>
      )}

      <section className={styles.chart} aria-label="Temperature over time">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="Timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={clock}
              stroke="var(--muted)"
              fontSize={12}
              minTickGap={48}
            />
            <YAxis
              domain={[(d: number) => Math.floor(d - 0.5), (d: number) => Math.ceil(d + 0.5)]}
              unit="°"
              stroke="var(--muted)"
              fontSize={12}
              width={48}
            />
            <Tooltip
              labelFormatter={(v) => stamp(Number(v))}
              formatter={(v) => [`${Number(v).toFixed(1)} °C`, "Temperature"]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--grid)",
                color: "var(--ink)",
              }}
            />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="var(--line)"
              strokeWidth={2}
              dot={{ r: 2.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <table className={styles.table}>
        <caption>Latest readings, newest first</caption>
        <thead>
          <tr><th scope="col">Time</th><th scope="col">Temperature</th></tr>
        </thead>
        <tbody>
          {[...rows].reverse().slice(0, 20).map((r) => (
            <tr key={r.Timestamp}>
              <td>{stamp(r.Timestamp)}</td>
              <td>{r.temperature.toFixed(1)} °C</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
