/** Droga - klient przegladarkowy. Stan gry zyje tutaj, w localStorage. */

const KLUCZ = "droga:zapis";
const $ = (id) => document.getElementById(id);

const el = {
  start: $("start"),
  startForm: $("start-form"),
  imie: $("imie"),
  plec: $("plec"),
  tryb: $("tryb"),
  gra: $("gra"),
  pasek: $("pasek"),
  tekst: $("tekst"),
  wybory: $("wybory"),
  akcjaForm: $("akcja-form"),
  akcja: $("akcja"),
  wyslij: $("wyslij"),
  panel: $("panel"),
};

let stan = null;
let propozycje = [];
let zajete = false;

/* ---------- sieć ---------- */

async function api(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const dane = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dane.blad || `Blad serwera (${res.status})`);
  return dane;
}

/* ---------- render ---------- */

function dodajWpis(html) {
  const div = document.createElement("div");
  div.className = "wpis nowy";
  div.innerHTML = html;
  el.tekst.append(div);
  div.scrollIntoView({ behavior: "smooth", block: "start" });
  return div;
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const akapity = (tekst) =>
  esc(tekst)
    .split(/\n{2,}|\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${p}</p>`)
    .join("");

function rysujWybory() {
  el.wybory.innerHTML = "";
  if (stan?.zakonczenie) return;
  propozycje.forEach((tekst, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = zajete;
    btn.innerHTML = `<span>${i + 1}</span>${esc(tekst)}`;
    btn.onclick = () => tura(tekst);
    el.wybory.append(btn);
  });
}

function rysujPanel() {
  const s = stan;
  el.pasek.textContent = `${s.postac.imie}, ${s.postac.wiek} l. — ${s.swiat.miejsce} — ${s.swiat.pora_roku}, rok ${s.swiat.rok} — ${s.pieniadze} zł`;

  $("p-postac").innerHTML = [
    ["wiek", `${s.postac.wiek} lat`],
    ["miejsce", s.swiat.miejsce],
    ["zajęcie", s.zajecie.nazwa || "—"],
    ["portfel", `${s.pieniadze} zł`],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
    .join("");

  $("p-staty").innerHTML = Object.entries(s.staty)
    .map(
      ([k, v]) =>
        `<div class="stat"><b>${k}</b><span class="slupek"><i style="width:${v}%"></i></span><span class="wartosc">${v}</span></div>`
    )
    .join("");

  $("p-relacje").innerHTML =
    s.relacje.map((r) => `<li>${esc(r.kto)} <span class="cichy">— ${esc(r.rola)} · ${r.wiez}</span></li>`).join("") ||
    "<li class='cichy'>—</li>";

  $("p-umiejetnosci").innerHTML =
    Object.entries(s.umiejetnosci)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<li>${esc(k)} <span class="cichy">${v}/10</span></li>`)
      .join("") || "<li class='cichy'>—</li>";

  $("p-cele").innerHTML =
    s.cele.map((c) => `<li class="${c.zrobione ? "zrobione" : ""}">${esc(c.tresc)}</li>`).join("") ||
    "<li class='cichy'>—</li>";

  $("p-lore").innerHTML =
    s.lore.slice(-12).map((f) => `<li class="cichy">${esc(f)}</li>`).join("") || "<li class='cichy'>—</li>";
}

function blokuj(wartosc) {
  zajete = wartosc;
  el.akcja.disabled = wartosc;
  el.wyslij.disabled = wartosc;
  el.wyslij.textContent = wartosc ? "…" : "Zrób to";
  rysujWybory();
}

/* ---------- pętla tury ---------- */

async function tura(akcja) {
  if (zajete || stan?.zakonczenie) return;
  blokuj(true);
  if (akcja) dodajWpis(`<p class="ruch">${esc(akcja)}</p><p class="czas">…</p>`);

  try {
    const wynik = await api("/api/tura", { state: stan, akcja });
    stan = wynik.state;
    propozycje = wynik.propozycje;

    if (akcja) el.tekst.lastElementChild.remove();
    dodajWpis(
      (akcja ? `<p class="ruch">${esc(akcja)}</p>` : "") +
        akapity(wynik.narracja) +
        (wynik.uplyw_czasu ? `<p class="czas">(${esc(wynik.uplyw_czasu)})</p>` : "") +
        (wynik.zakonczenie
          ? `<div class="koniec"><h2>Koniec — ${esc(wynik.zakonczenie.typ)}</h2>${akapity(wynik.zakonczenie.tekst)}</div>`
          : "")
    );

    zapisz();
    rysujPanel();
  } catch (error) {
    if (akcja) el.tekst.lastElementChild.remove();
    dodajWpis(`<p class="blad">${esc(error.message)}</p>`);
  } finally {
    blokuj(false);
    el.akcja.focus();
  }
}

/* ---------- zapis ---------- */

function zapisz() {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify({ stan, propozycje, historia: el.tekst.innerHTML }));
  } catch { /* prywatne okno albo pelny magazyn - trudno */ }
}

function wczytaj() {
  try {
    const zapis = JSON.parse(localStorage.getItem(KLUCZ) || "null");
    if (!zapis?.stan?.postac) return false;
    stan = zapis.stan;
    propozycje = zapis.propozycje || [];
    el.tekst.innerHTML = zapis.historia || "";
    return true;
  } catch {
    return false;
  }
}

/* ---------- start ---------- */

el.startForm.onsubmit = async (e) => {
  e.preventDefault();
  const dane = await api("/api/nowa", { imie: el.imie.value, plec: el.plec.value });
  stan = dane.state;
  propozycje = dane.propozycje;
  el.tekst.innerHTML = "";
  el.start.hidden = true;
  el.gra.hidden = false;
  rysujPanel();
  await tura("");
};

el.akcjaForm.onsubmit = (e) => {
  e.preventDefault();
  const tekst = el.akcja.value.trim();
  if (!tekst) return;
  el.akcja.value = "";
  tura(/^[1-9]$/.test(tekst) ? propozycje[Number(tekst) - 1] || tekst : tekst);
};

$("btn-nowa").onclick = () => {
  if (!confirm("Zacząć od nowa? Obecna historia zniknie.")) return;
  localStorage.removeItem(KLUCZ);
  location.reload();
};

$("btn-panel").onclick = () => el.panel.classList.toggle("widoczny");

(async function init() {
  try {
    const info = await api("/api/info");
    el.tryb.textContent = info.offline
      ? "tryb offline — ustaw GEMINI_API_KEY albo ANTHROPIC_API_KEY w .env"
      : `model: ${info.model}`;
  } catch {
    el.tryb.textContent = "serwer nie odpowiada";
  }

  if (wczytaj()) {
    el.start.hidden = true;
    el.gra.hidden = false;
    rysujPanel();
    rysujWybory();
  }
})();
