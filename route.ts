// Server-side proxy: avoids CORS and keeps the upstream URL (and any future key) off the client.
const UPSTREAM =
  process.env.SENSOR_API_URL ??
  "https://n8hpbwvb2f.execute-api.us-east-2.amazonaws.com/default/getSensorReadings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const headers: Record<string, string> = {};
    if (process.env.SENSOR_API_KEY) headers["x-api-key"] = process.env.SENSOR_API_KEY;

    const res = await fetch(UPSTREAM, { headers, cache: "no-store" });
    if (!res.ok) {
      return Response.json(
        { error: `Sensor API returned ${res.status}` },
        { status: 502 },
      );
    }
    return Response.json(await res.json());
  } catch {
    return Response.json({ error: "Sensor API unreachable" }, { status: 502 });
  }
}
