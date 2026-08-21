import test from "node:test";
import assert from "node:assert/strict";

import { applyDelta, emptyState, LIMITS } from "../src/state.js";
import { startState, SCENARIO } from "../src/scenario.js";
import { TURN_SCHEMA } from "../src/schema.js";
import { takeTurn } from "../src/engine.js";

const pustaDelta = () => ({
  wiek_delta: 0,
  miejsce: "",
  pora_roku: "",
  rok_delta: 0,
  staty: { zdrowie: 0, energia: 0, nastroj: 0, reputacja: 0 },
  pieniadze: 0,
  umiejetnosci: [],
  relacje: [],
  zajecie: { nazwa: "", opis: "" },
  ekwipunek_dodaj: [],
  ekwipunek_usun: [],
  cele_dodaj: [],
  cele_zrobione: [],
  flagi: [],
  lore_dodaj: [],
  podsumowanie: "",
});

test("pusta delta nie zmienia nic poza numerem tury", () => {
  const przed = startState();
  const po = applyDelta(przed, pustaDelta());
  assert.equal(po.turn, przed.turn + 1);
  assert.deepEqual(po.staty, przed.staty);
  assert.deepEqual(po.relacje, przed.relacje);
  assert.equal(po.pieniadze, przed.pieniadze);
});

test("applyDelta nie mutuje stanu wejsciowego", () => {
  const przed = startState();
  const kopia = structuredClone(przed);
  applyDelta(przed, { ...pustaDelta(), pieniadze: -100, lore_dodaj: ["cos"] });
  assert.deepEqual(przed, kopia);
});

test("staty i więzi są przycinane do zakresu", () => {
  const s = startState();
  const po = applyDelta(s, {
    ...pustaDelta(),
    staty: { zdrowie: 999, energia: -999, nastroj: 0, reputacja: 0 },
    relacje: [{ kto: "Matka, Halina", wiez_zmiana: 500, rola: "", notatka: "", usun: false }],
  });
  assert.equal(po.staty.zdrowie, LIMITS.stat[1]);
  assert.equal(po.staty.energia, LIMITS.stat[0]);
  assert.equal(po.relacje.find((r) => r.kto === "Matka, Halina").wiez, LIMITS.bond[1]);
});

test("umiejętności rosną i zatrzymują się na 10", () => {
  let s = startState();
  for (let i = 0; i < 20; i++) {
    s = applyDelta(s, { ...pustaDelta(), umiejetnosci: [{ nazwa: "gospodarstwo", zmiana: 1 }] });
  }
  assert.equal(s.umiejetnosci.gospodarstwo, LIMITS.skill[1]);
});

test("nowa relacja startuje od 50 plus zmiana", () => {
  const po = applyDelta(startState(), {
    ...pustaDelta(),
    relacje: [{ kto: "Weronika", rola: "sąsiadka", wiez_zmiana: 10, notatka: "z drugiego końca wsi", usun: false }],
  });
  const rel = po.relacje.find((r) => r.kto === "Weronika");
  assert.equal(rel.wiez, 60);
  assert.equal(rel.rola, "sąsiadka");
});

test("usuwanie relacji działa niezależnie od wielkości liter", () => {
  const po = applyDelta(startState(), {
    ...pustaDelta(),
    relacje: [{ kto: "kuba", rola: "", wiez_zmiana: 0, notatka: "", usun: true }],
  });
  assert.equal(po.relacje.some((r) => r.kto === "Kuba"), false);
});

test("ekwipunek nie duplikuje przedmiotów", () => {
  const po = applyDelta(startState(), {
    ...pustaDelta(),
    ekwipunek_dodaj: ["Rower", "kosa"],
    ekwipunek_usun: ["kurtka po bracie"],
  });
  assert.equal(po.ekwipunek.filter((x) => x.toLowerCase() === "rower").length, 1);
  assert.ok(po.ekwipunek.includes("kosa"));
  assert.ok(!po.ekwipunek.includes("kurtka po bracie"));
});

test("cele można dodać i domknąć", () => {
  let s = applyDelta(startState(), { ...pustaDelta(), cele_dodaj: ["Zarobić na kurs prawa jazdy"] });
  s = applyDelta(s, { ...pustaDelta(), cele_zrobione: ["zarobić na kurs prawa jazdy"] });
  assert.equal(s.cele.find((c) => c.tresc.startsWith("Zarobić")).zrobione, true);
});

test("lore nie przekracza limitu i nie ma duplikatów", () => {
  let s = emptyState();
  for (let i = 0; i < LIMITS.maxLore + 15; i++) {
    s = applyDelta(s, { ...pustaDelta(), lore_dodaj: [`fakt ${i}`, "fakt 0"] });
  }
  assert.equal(s.lore.length, LIMITS.maxLore);
  assert.equal(s.lore.filter((f) => f === "fakt 0").length, 1);
});

test("dziennik zapisuje tylko tury z podsumowaniem", () => {
  let s = applyDelta(startState(), pustaDelta(), { action: "nic" });
  assert.equal(s.dziennik.length, 0);
  s = applyDelta(s, { ...pustaDelta(), podsumowanie: "Poszła do obory" }, { action: "idź do obory" });
  assert.equal(s.dziennik.at(-1).streszczenie, "Poszła do obory");
  assert.equal(s.dziennik.at(-1).akcja, "idź do obory");
});

test("zakończenie ustawia się tylko przy niepustym typie", () => {
  const trwa = applyDelta(startState(), { ...pustaDelta(), zakonczenie: { typ: "", tekst: "" } });
  assert.equal(trwa.zakonczenie, null);
  const koniec = applyDelta(trwa, { ...pustaDelta(), zakonczenie: { typ: "gorzkie", tekst: "Zostala." } });
  assert.equal(koniec.zakonczenie.typ, "gorzkie");
});

test("schemat tury jest ścisły — każde pole wymagane, bez dodatkowych", () => {
  const sprawdz = (node, sciezka = "root") => {
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false, `${sciezka}: brak additionalProperties=false`);
      assert.deepEqual(
        [...node.required].sort(),
        Object.keys(node.properties).sort(),
        `${sciezka}: required != properties`
      );
      for (const [key, value] of Object.entries(node.properties)) sprawdz(value, `${sciezka}.${key}`);
    }
    if (node.type === "array") sprawdz(node.items, `${sciezka}[]`);
  };
  sprawdz(TURN_SCHEMA);
});

test("pętla tury działa w trybie offline (bez API)", async () => {
  const start = startState({ imie: "Ola" });
  const pierwsza = await takeTurn(start, "", { offline: true });
  assert.equal(pierwsza.state.turn, 1);
  assert.ok(pierwsza.narracja.includes(SCENARIO.otwarcie.slice(0, 30)));
  assert.equal(pierwsza.propozycje.length, SCENARIO.propozycje.length);

  const druga = await takeTurn(pierwsza.state, "idź do obory", { offline: true });
  assert.equal(druga.state.turn, 2);
  assert.equal(druga.state.dziennik.at(-1).akcja, "idź do obory");
});

test("tura po zakończeniu jest odrzucana", async () => {
  const s = applyDelta(startState(), { ...pustaDelta(), zakonczenie: { typ: "dobre", tekst: "." } });
  await assert.rejects(() => takeTurn(s, "cokolwiek", { offline: true }), /skończyła/);
});
