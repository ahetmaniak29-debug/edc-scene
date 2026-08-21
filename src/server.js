/**
 * Serwer wersji przeglądarkowej.
 *
 * Stan gry trzyma klient (localStorage) i przysyła go przy każdej turze —
 * serwer jest bezstanowy i służy tylko do tego, żeby klucz API nigdy
 * nie trafił do przeglądarki.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.js";
loadEnv();

import { takeTurn, SCENARIO, startState } from "./engine.js";
import { hasApiKey, MODEL } from "./ai.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 512 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) {
        reject(new Error("Zapytanie za duże."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Niepoprawny JSON."));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const rel = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, "nie znaleziono", "text/plain; charset=utf-8");
  }
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/info") {
      return send(res, 200, {
        scenariusz: { tytul: SCENARIO.tytul, otwarcie: SCENARIO.otwarcie },
        model: hasApiKey() ? MODEL : null,
        offline: !hasApiKey(),
      });
    }

    if (req.method === "POST" && req.url === "/api/nowa") {
      const { imie, plec } = await readBody(req);
      const state = startState({
        imie: String(imie || "Ola").slice(0, 40),
        plec: plec === "mezczyzna" ? "mezczyzna" : "kobieta",
      });
      return send(res, 200, { state, propozycje: SCENARIO.propozycje });
    }

    if (req.method === "POST" && req.url === "/api/tura") {
      const { state, akcja } = await readBody(req);
      if (!state || typeof state !== "object" || !state.postac) {
        return send(res, 400, { blad: "Brak stanu gry." });
      }
      const turn = await takeTurn(state, String(akcja || "").slice(0, 500));
      return send(res, 200, turn);
    }

    if (req.method === "GET") return serveStatic(req, res);
    send(res, 404, { blad: "nie znaleziono" });
  } catch (error) {
    send(res, 400, { blad: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Droga: http://localhost:${PORT}`);
  if (!hasApiKey()) console.log("Uwaga: brak ANTHROPIC_API_KEY — tryb offline (atrapa narratora).");
});
