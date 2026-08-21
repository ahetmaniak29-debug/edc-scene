/**
 * Stan postaci — jedyne "twarde" dane w grze.
 *
 * Cała fabuła jest generowana na bieżąco, ale wszystko, co gra pamięta,
 * mieszka w tym jednym obiekcie JSON. AI nigdy nie nadpisuje stanu wprost —
 * zwraca *deltę* (patrz src/schema.js), którą applyDelta() waliduje i przycina.
 */

export const STATE_VERSION = 1;

/** Twarde kategorie stanu — to jest cała "mechanika" gry. */
export const STAT_KEYS = ["zdrowie", "energia", "nastroj", "reputacja"];

export const LIMITS = {
  stat: [0, 100],
  bond: [0, 100],
  skill: [0, 10],
  maxLore: 40,
  maxLog: 60,
  maxRelations: 24,
  maxInventory: 30,
  maxGoals: 12,
};

const clamp = (n, [lo, hi]) => Math.max(lo, Math.min(hi, Math.round(n)));
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const norm = (s) => clean(s).toLowerCase();

/** Pusty szkielet stanu. Scenariusz (src/scenario.js) go wypełnia. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    turn: 0,
    postac: { imie: "", wiek: 0, plec: "kobieta", pochodzenie: "" },
    swiat: { miejsce: "", pora_roku: "wiosna", rok: 1 },
    staty: { zdrowie: 80, energia: 80, nastroj: 60, reputacja: 50 },
    pieniadze: 0,
    umiejetnosci: {},
    ekwipunek: [],
    relacje: [],
    zajecie: { nazwa: "", opis: "" },
    cele: [],
    flagi: {},
    lore: [],
    dziennik: [],
    zakonczenie: null,
  };
}

/**
 * Nakłada deltę zwróconą przez AI na stan. Czysta funkcja — zwraca nowy obiekt.
 * Wszystko jest przycinane do zakresów z LIMITS, więc złe zachowanie modelu
 * (np. -900 zdrowia) nie rozwala gry.
 */
export function applyDelta(state, delta, { action = "" } = {}) {
  const s = structuredClone(state);
  const d = delta || {};

  s.turn += 1;

  // --- postać i świat -------------------------------------------------
  if (Number.isFinite(d.wiek_delta) && d.wiek_delta !== 0) {
    s.postac.wiek = Math.max(0, Math.min(120, s.postac.wiek + Math.round(d.wiek_delta)));
  }
  if (clean(d.miejsce)) s.swiat.miejsce = clean(d.miejsce);
  if (clean(d.pora_roku)) s.swiat.pora_roku = clean(d.pora_roku);
  if (Number.isFinite(d.rok_delta) && d.rok_delta !== 0) {
    s.swiat.rok = Math.max(1, s.swiat.rok + Math.round(d.rok_delta));
  }

  // --- staty ----------------------------------------------------------
  for (const key of STAT_KEYS) {
    const change = Number(d.staty?.[key] ?? 0);
    if (!Number.isFinite(change) || change === 0) continue;
    s.staty[key] = clamp((s.staty[key] ?? 50) + change, LIMITS.stat);
  }

  // --- pieniądze ------------------------------------------------------
  if (Number.isFinite(d.pieniadze) && d.pieniadze !== 0) {
    s.pieniadze = Math.round(s.pieniadze + d.pieniadze);
  }

  // --- umiejętności ---------------------------------------------------
  for (const item of d.umiejetnosci ?? []) {
    const name = clean(item?.nazwa);
    const change = Number(item?.zmiana ?? 0);
    if (!name || !Number.isFinite(change) || change === 0) continue;
    s.umiejetnosci[name] = clamp((s.umiejetnosci[name] ?? 0) + change, LIMITS.skill);
  }

  // --- relacje --------------------------------------------------------
  for (const item of d.relacje ?? []) {
    const name = clean(item?.kto);
    if (!name) continue;
    const idx = s.relacje.findIndex((r) => norm(r.kto) === norm(name));
    if (item.usun) {
      if (idx >= 0) s.relacje.splice(idx, 1);
      continue;
    }
    const change = Number(item?.wiez_zmiana ?? 0);
    if (idx >= 0) {
      const rel = s.relacje[idx];
      if (Number.isFinite(change) && change !== 0) {
        rel.wiez = clamp(rel.wiez + change, LIMITS.bond);
      }
      if (clean(item.rola)) rel.rola = clean(item.rola);
      if (clean(item.notatka)) rel.notatka = clean(item.notatka);
    } else if (s.relacje.length < LIMITS.maxRelations) {
      s.relacje.push({
        kto: name,
        rola: clean(item.rola) || "znajomy",
        wiez: clamp(50 + (Number.isFinite(change) ? change : 0), LIMITS.bond),
        notatka: clean(item.notatka),
      });
    }
  }

  // --- zajęcie --------------------------------------------------------
  if (clean(d.zajecie?.nazwa)) s.zajecie.nazwa = clean(d.zajecie.nazwa);
  if (clean(d.zajecie?.opis)) s.zajecie.opis = clean(d.zajecie.opis);

  // --- ekwipunek ------------------------------------------------------
  for (const raw of d.ekwipunek_dodaj ?? []) {
    const item = clean(raw);
    if (!item || s.ekwipunek.length >= LIMITS.maxInventory) continue;
    if (!s.ekwipunek.some((x) => norm(x) === norm(item))) s.ekwipunek.push(item);
  }
  for (const raw of d.ekwipunek_usun ?? []) {
    const item = norm(raw);
    if (!item) continue;
    s.ekwipunek = s.ekwipunek.filter((x) => norm(x) !== item);
  }

  // --- cele -----------------------------------------------------------
  for (const raw of d.cele_dodaj ?? []) {
    const text = clean(raw);
    if (!text || s.cele.length >= LIMITS.maxGoals) continue;
    if (!s.cele.some((c) => norm(c.tresc) === norm(text))) {
      s.cele.push({ tresc: text, zrobione: false });
    }
  }
  for (const raw of d.cele_zrobione ?? []) {
    const text = norm(raw);
    const goal = s.cele.find((c) => norm(c.tresc) === text);
    if (goal) goal.zrobione = true;
  }

  // --- flagi ----------------------------------------------------------
  for (const item of d.flagi ?? []) {
    const key = clean(item?.klucz);
    if (!key) continue;
    s.flagi[key] = clean(item.wartosc);
  }

  // --- lore (pamięć długoterminowa) -----------------------------------
  for (const raw of d.lore_dodaj ?? []) {
    const fact = clean(raw);
    if (!fact) continue;
    if (!s.lore.some((x) => norm(x) === norm(fact))) s.lore.push(fact);
  }
  if (s.lore.length > LIMITS.maxLore) s.lore = s.lore.slice(-LIMITS.maxLore);

  // --- dziennik -------------------------------------------------------
  const summary = clean(d.podsumowanie);
  if (summary) {
    s.dziennik.push({ tura: s.turn, akcja: clean(action), streszczenie: summary });
    if (s.dziennik.length > LIMITS.maxLog) s.dziennik = s.dziennik.slice(-LIMITS.maxLog);
  }

  // --- zakończenie ----------------------------------------------------
  const endType = clean(delta?.zakonczenie?.typ);
  if (endType) {
    s.zakonczenie = { typ: endType, tekst: clean(delta.zakonczenie.tekst) };
  }

  return s;
}

/** Kompaktowy widok stanu wysyłany do AI (bez pełnego dziennika). */
export function stateForPrompt(state) {
  return {
    tura: state.turn,
    postac: state.postac,
    swiat: state.swiat,
    staty: state.staty,
    pieniadze: state.pieniadze,
    umiejetnosci: state.umiejetnosci,
    ekwipunek: state.ekwipunek,
    relacje: state.relacje,
    zajecie: state.zajecie,
    cele: state.cele,
    flagi: state.flagi,
  };
}

/** Jednolinijkowy pasek stanu do terminala. */
export function statusLine(state) {
  const { zdrowie, energia, nastroj, reputacja } = state.staty;
  return [
    `${state.postac.imie}, ${state.postac.wiek} l.`,
    state.swiat.miejsce,
    `${state.swiat.pora_roku}, rok ${state.swiat.rok}`,
    `zdr ${zdrowie} | ene ${energia} | nas ${nastroj} | rep ${reputacja}`,
    `${state.pieniadze} zł`,
  ].join("  |  ");
}
