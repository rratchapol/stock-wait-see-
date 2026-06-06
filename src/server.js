import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { buildDashboardData } from "./dashboard-data.js";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "config", "watchlist.json");
const PORT = Number(process.env.PORT ?? 4173);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/dashboard") {
      const data = await buildDashboardData({ sampleMode: url.searchParams.get("sample") === "1" });
      sendJson(response, data);
      return;
    }

    if (url.pathname === "/api/positions" && request.method === "POST") {
      const body = await readJsonBody(request);
      const position = normalizePosition(body);
      const config = await readConfig();
      const positions = config.positions ?? [];
      const existingIndex = positions.findIndex((row) => row.ticker === position.ticker);
      if (existingIndex >= 0) positions[existingIndex] = { ...positions[existingIndex], ...position };
      else positions.push(position);
      config.positions = positions;
      await writeConfig(config);
      sendJson(response, { ok: true, position });
      return;
    }

    if (url.pathname.startsWith("/api/positions/") && request.method === "DELETE") {
      const ticker = decodeURIComponent(url.pathname.split("/").at(-1) ?? "").toUpperCase();
      const config = await readConfig();
      config.positions = (config.positions ?? []).filter((row) => row.ticker !== ticker);
      await writeConfig(config);
      sendJson(response, { ok: true, ticker });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Agent Office UI: http://localhost:${PORT}`);
});

async function serveStatic(urlPath, response) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    if (!path.extname(safePath)) {
      const indexPath = path.join(PUBLIC_DIR, "index.html");
      response.writeHead(200, { "content-type": contentType(indexPath) });
      createReadStream(indexPath).pipe(response);
      return;
    }
    response.writeHead(404);
    response.end("Not found");
  }
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

async function writeConfig(config) {
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizePosition(body) {
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error("Invalid ticker");

  const position = {
    ticker,
    avgCost: positiveNumber(body.avgCost, "avgCost"),
    shares: positiveNumber(body.shares, "shares"),
    entryDate: String(body.entryDate || new Date().toISOString().slice(0, 10)),
    thesis: String(body.thesis ?? ""),
    stopLoss: optionalPositiveNumber(body.stopLoss),
    takeProfit1: optionalPositiveNumber(body.takeProfit1),
    takeProfit2: optionalPositiveNumber(body.takeProfit2),
    riskNotes: Array.isArray(body.riskNotes)
      ? body.riskNotes.map(String).filter(Boolean)
      : String(body.riskNotes ?? "")
          .split("\n")
          .map((note) => note.trim())
          .filter(Boolean),
  };

  return Object.fromEntries(Object.entries(position).filter(([, value]) => value !== null && value !== ""));
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field} must be positive`);
  return number;
}

function optionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  return positiveNumber(value, "optional price");
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "application/octet-stream";
}
