/** Zapis i odczyt gry z pliku (tryb terminalowy). */

import fs from "node:fs";
import path from "node:path";

const DIR = process.env.DROGA_SAVE_DIR || "zapisy";

export function savePath(name = "gra") {
  return path.join(DIR, `${name.replace(/[^\w-]/g, "_")}.json`);
}

export function saveGame(state, name = "gra") {
  fs.mkdirSync(DIR, { recursive: true });
  const file = savePath(name);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}

export function loadGame(name = "gra") {
  const file = savePath(name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
