import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);
const cacheMs = Number(process.env.CALENDAR_CACHE_MS || 15 * 60 * 1000);
const signupsPath = join(root, "data", "deal-signups.json");

let cachedAvailability;
let cachedAt = 0;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function calendarSources() {
  return [
    ["Airbnb", process.env.AIRBNB_ICAL_URL],
    ["Booking.com", process.env.BOOKING_ICAL_URL],
  ].filter(([, url]) => Boolean(url));
}

function parseICalDate(value) {
  if (!value) return null;
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }

  const match = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function unfoldICal(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseBlockedRanges(icalText) {
  const blocks = unfoldICal(icalText).split("BEGIN:VEVENT").slice(1);

  return blocks.map((block) => {
    const startLine = block.match(/\nDTSTART(?:;[^:\n]+)?:([^\n\r]+)/);
    const endLine = block.match(/\nDTEND(?:;[^:\n]+)?:([^\n\r]+)/);
    const start = parseICalDate(startLine?.[1]);
    const end = parseICalDate(endLine?.[1]) || start;
    return start && end ? { start, end } : null;
  }).filter(Boolean);
}

function mergeRanges(ranges) {
  const sorted = ranges
    .filter((range) => range.start && range.end && range.start <= range.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else if (range.end > last.end) {
      last.end = range.end;
    }
  }
  return merged;
}

async function getAvailability() {
  const now = Date.now();
  if (cachedAvailability && now - cachedAt < cacheMs) return cachedAvailability;

  const sources = calendarSources();
  const calendars = await Promise.all(sources.map(async ([name, url]) => {
    const response = await fetch(url, { headers: { Accept: "text/calendar,*/*" } });
    if (!response.ok) throw new Error(`${name} calendar returned ${response.status}`);
    return { name, ranges: parseBlockedRanges(await response.text()) };
  }));

  cachedAvailability = {
    updatedAt: new Date().toISOString(),
    sources: calendars.map((calendar) => calendar.name),
    blockedRanges: mergeRanges(calendars.flatMap((calendar) => calendar.ranges)),
  };
  cachedAt = now;
  return cachedAvailability;
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, normalized);
  const body = await readFile(filePath);
  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readSignups() {
  try {
    return JSON.parse(await readFile(signupsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveSignup(request) {
  const rawBody = await readRequestBody(request);
  const data = JSON.parse(rawBody || "{}");
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const consent = Boolean(data.consent);

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !consent) {
    return { ok: false, status: 400, message: "Please add your name, email, and marketing consent." };
  }

  const signups = await readSignups();
  const existing = signups.find((signup) => signup.email === email);
  const saved = {
    name,
    email,
    consent,
    source: "website deals signup",
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, saved);
  } else {
    signups.push({ ...saved, createdAt: saved.updatedAt });
  }

  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(signupsPath, `${JSON.stringify(signups, null, 2)}\n`);
  return { ok: true, status: 200, message: "Thanks. You are signed up for future offers." };
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/availability") {
      const body = JSON.stringify(await getAvailability());
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      });
      response.end(body);
      return;
    }

    if (url.pathname === "/api/deals-signup" && request.method === "POST") {
      const result = await saveSignup(request);
      response.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: result.ok, message: result.message }));
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`The Old Blacksmiths site running at http://127.0.0.1:${port}/`);
});
