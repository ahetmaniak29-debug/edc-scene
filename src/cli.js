#!/usr/bin/env node
/** Droga — wersja terminalowa. */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnv } from "./env.js";
loadEnv();

import { takeTurn, SCENARIO, startState } from "./engine.js";
import { statusLine } from "./state.js";
import { saveGame, loadGame } from "./save.js";
import { hasApiKey, MODEL } from "./ai.js";

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const accent = (s) => `\x1b[38;5;179m${s}\x1b[0m`;

function wrap(text, width = 78) {
  return text
    .split("\n")
    .map((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) return "";
      const lines = [];
      let line = "";
      for (const word of words) {
        if ((line + " " + word).trim().length > width) {
          lines.push(line.trim());
          line = word;
        } else {
          line += " " + word;
        }
      }
      lines.push(line.trim());
      return lines.join("\n");
    })
    .join("\n");
}

const HELP = `
Komendy:
  1-4          wybierz propozycję
  <tekst>      wpisz własną akcję
  /stan        pełny stan postaci
  /fakty       pamięć gry (lore)
  /zapisz [nazwa]
  /wczytaj [nazwa]
  /pomoc
  /koniec
`;

function printState(state) {
  console.log(dim("-".repeat(78)));
  console.log(JSON.stringify(
    {
      postac: state.postac,
      swiat: state.swiat,
      staty: state.staty,
      pieniadze: state.pieniadze,
      umiejetnosci: state.umiejetnosci,
      zajecie: state.zajecie,
      relacje: state.relacje,
      cele: state.cele,
      ekwipunek: state.ekwipunek,
      flagi: state.flagi,
    },
    null,
    2
  ));
  console.log(dim("-".repeat(78)));
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log(bold(`\n  ${SCENARIO.tytul.toUpperCase()}`));
  console.log(dim(`  tekstowa gra-symulacja życia\n`));
  console.log(dim(hasApiKey() ? `  model: ${MODEL}` : "  brak ANTHROPIC_API_KEY — tryb offline (atrapa narratora)"));
  console.log(dim(HELP));

  let state = loadGame("gra");
  if (state) {
    const answer = (await rl.question("Znaleziono zapis. Wczytać? [T/n] ")).trim().toLowerCase();
    if (answer === "n") state = null;
  }

  let suggestions = SCENARIO.propozycje;

  if (!state) {
    const imie = (await rl.question("Imię postaci [Ola]: ")).trim() || "Ola";
    const plecIn = (await rl.question("Płeć (k/m) [k]: ")).trim().toLowerCase();
    state = startState({ imie, plec: plecIn === "m" ? "mezczyzna" : "kobieta" });

    const first = await runTurn(state, "");
    if (!first) return rl.close();
    ({ state, suggestions } = first);
  }

  while (!state.zakonczenie) {
    console.log(dim("\n" + statusLine(state)));
    suggestions.forEach((s, i) => console.log(accent(`  ${i + 1}) `) + s));

    const raw = (await rl.question("\n> ")).trim();
    if (!raw) continue;

    if (raw.startsWith("/")) {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(" ") || "gra";
      if (cmd === "koniec") break;
      if (cmd === "pomoc") console.log(dim(HELP));
      else if (cmd === "stan") printState(state);
      else if (cmd === "fakty") console.log(dim(state.lore.map((f) => "  - " + f).join("\n") || "  (brak)"));
      else if (cmd === "zapisz") console.log(dim(`  zapisano: ${saveGame(state, arg)}`));
      else if (cmd === "wczytaj") {
        const loaded = loadGame(arg);
        if (loaded) {
          state = loaded;
          console.log(dim("  wczytano"));
        } else console.log(dim("  nie ma takiego zapisu"));
      } else console.log(dim("  nieznana komenda, /pomoc"));
      continue;
    }

    const picked = /^[1-9]$/.test(raw) ? suggestions[Number(raw) - 1] : raw;
    if (!picked) {
      console.log(dim("  nie ma takiej propozycji"));
      continue;
    }

    const result = await runTurn(state, picked);
    if (!result) continue;
    ({ state, suggestions } = result);
    saveGame(state, "gra");
  }

  if (state.zakonczenie) {
    console.log(bold(`\n  KONIEC (${state.zakonczenie.typ})\n`));
    console.log(wrap(state.zakonczenie.tekst) + "\n");
  }
  rl.close();
}

/** Jedna tura + obsługa błędów, żeby wywalone API nie ubijało rozgrywki. */
async function runTurn(state, action) {
  process.stdout.write(dim("\n  ...\n"));
  try {
    const turn = await takeTurn(state, action);
    console.log("\n" + wrap(turn.narracja) + "\n");
    if (turn.uplyw_czasu) console.log(dim(`  (${turn.uplyw_czasu})`));
    return { state: turn.state, suggestions: turn.propozycje.length ? turn.propozycje : ["Idź dalej"] };
  } catch (error) {
    console.log(dim(`\n  błąd: ${error.message}\n`));
    return null;
  }
}

main();
