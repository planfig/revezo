/**
 * The dashboard page. Static HTML: it asks for the API key, keeps it in sessionStorage
 * (gone when the tab closes) and reads /v1/quota and /v1/events with it. All data is
 * written with textContent, never as HTML.
 */
export function dashboardHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Revezo</title>
<style nonce="${nonce}">
:root{--bg:#f4f6f7;--card:#fff;--fg:#17201f;--muted:#5d6966;--line:#d9e0de;--accent:#0b6e63;--ok:#1d7a34;--warn:#a35400;--bad:#b42323;--track:#e6ecea}
@media (prefers-color-scheme:dark){:root{--bg:#0f1514;--card:#172120;--fg:#e3ebe9;--muted:#98a8a4;--line:#2a3735;--accent:#4fc2b2;--ok:#74d08a;--warn:#f0a35a;--bad:#f07b7b;--track:#24302e;color-scheme:dark}}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:20px}
header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}
h1{margin:0;font-size:1.5rem}
h2{margin:0;font-size:1.1rem}
.muted{color:var(--muted);font-size:.85rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
form{display:flex;flex-wrap:wrap;gap:8px}
input{flex:1 1 240px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit}
button{padding:8px 14px;border:0;border-radius:6px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}
button.link{background:none;color:var(--accent);padding:0;text-decoration:underline}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.prov{display:grid;grid-template-columns:minmax(120px,1.1fr) 2fr auto;gap:6px 14px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.prov:first-of-type{border-top:0}
.name{font-weight:600;overflow-wrap:anywhere}
.bars{display:flex;flex-direction:column;gap:4px;min-width:0}
.bar{display:grid;grid-template-columns:52px 1fr 92px;gap:8px;align-items:center;font-size:.8rem;color:var(--muted)}
.track{height:8px;background:var(--track);border-radius:4px;overflow:hidden}
.fill{height:100%;background:var(--accent)}
.fill.hi{background:var(--warn)}.fill.full{background:var(--bad)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{font-size:.75rem;padding:2px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap;justify-self:end}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.85rem;min-width:560px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500}
td.msg{color:var(--muted);overflow-wrap:anywhere}
#error{color:var(--bad)}
.stack{display:flex;flex-direction:column;gap:20px}.spaced{margin-top:20px}
@media (max-width:560px){.prov{grid-template-columns:1fr auto}.bars{grid-column:1/-1}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Revezo</h1>
    <span class="muted" id="updated"></span>
  </header>
  <section class="card" id="login">
    <h2 data-t="loginTitle"></h2>
    <p class="muted" data-t="loginHelp"></p>
    <form id="loginForm">
      <input id="key" type="password" autocomplete="current-password" required>
      <button type="submit" data-t="open"></button>
    </form>
    <p id="error" hidden></p>
  </section>
  <div id="app" hidden>
    <div id="routes" class="stack"></div>
    <section class="card spaced">
      <h2 data-t="recent"></h2>
      <div class="table"><table>
        <thead><tr><th data-t="time"></th><th data-t="route"></th><th data-t="provider"></th><th data-t="result"></th><th data-t="detail"></th></tr></thead>
        <tbody id="events"></tbody>
      </table></div>
    </section>
    <p><button class="link" id="logout" type="button" data-t="logout"></button></p>
  </div>
</main>
<script nonce="${nonce}">
(() => {
  const T = {
    en: { loginTitle: "Open dashboard", loginHelp: "Paste the REVEZO_API_KEY. It is kept only in this tab.", open: "Open", recent: "Recent attempts",
      time: "Time", route: "Route", provider: "Provider", result: "Result", detail: "Detail", logout: "Close dashboard", updated: "Updated",
      wrongKey: "Wrong key.", offline: "Could not reach the server.", ok: "available", full: "limit reached", paused: "paused until",
      sent: "sent", skipped_full: "skipped: full", skipped_blocked: "skipped: paused", skipped_capability: "skipped: not allowed", failed: "failed",
      none: "No attempts yet.", minute: "minute", hour: "hour", day: "day", month: "month", noLimit: "no limit" },
    pt: { loginTitle: "Abrir painel", loginHelp: "Cole a REVEZO_API_KEY. Ela fica guardada só nesta aba.", open: "Abrir", recent: "Últimas tentativas",
      time: "Hora", route: "Rota", provider: "Provedor", result: "Resultado", detail: "Detalhe", logout: "Fechar painel", updated: "Atualizado",
      wrongKey: "Chave errada.", offline: "Não foi possível falar com o servidor.", ok: "disponível", full: "limite atingido", paused: "pausado até",
      sent: "enviado", skipped_full: "pulado: cheio", skipped_blocked: "pulado: pausado", skipped_capability: "pulado: não permitido", failed: "falhou",
      none: "Nenhuma tentativa ainda.", minute: "minuto", hour: "hora", day: "dia", month: "mês", noLimit: "sem limite" },
  };
  const lang = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
  const t = (k) => T[lang][k] ?? k;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const store = { get() { try { return sessionStorage.getItem("revezo-key"); } catch { return null; } },
    set(v) { try { v ? sessionStorage.setItem("revezo-key", v) : sessionStorage.removeItem("revezo-key"); } catch {} } };
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtUntil = (iso) => new Date(iso).toLocaleString(lang, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const LIMIT = { minute: "perMinute", hour: "perHour", day: "perDay", month: "perMonth" };
  let timer;

  async function api(path, key) {
    const res = await fetch(path, { headers: { authorization: "Bearer " + key }, cache: "no-store" });
    if (res.status === 401) throw new Error("401");
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function renderRoutes(routes) {
    const box = $("routes"); box.replaceChildren();
    for (const r of routes) {
      const card = el("section", "card");
      const head = el("div"); head.append(el("h2", "", r.route), el("span", "muted", r.kind + " · " + r.strategy));
      head.style.cssText = "display:flex;gap:10px;align-items:baseline;flex-wrap:wrap";
      card.append(head);
      for (const p of r.providers) {
        const row = el("div", "prov");
        const name = el("div"); name.append(el("div", "name", p.name), el("div", "muted", p.type));
        const bars = el("div", "bars");
        let full = false;
        const windows = Object.keys(LIMIT).filter((w) => p.limits[LIMIT[w]] !== undefined);
        for (const w of windows.length ? windows : ["day"]) {
          const limit = p.limits[LIMIT[w]];
          const used = p.usage[w];
          const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
          if (limit !== undefined && used >= limit) full = true;
          const bar = el("div", "bar");
          const track = el("div", "track"); const fill = el("div", "fill" + (pct >= 100 ? " full" : pct >= 80 ? " hi" : ""));
          fill.style.width = pct + "%"; track.append(fill);
          bar.append(el("span", "", t(w)), track, el("span", "num", limit === undefined ? used + " · " + t("noLimit") : used + " / " + limit));
          bars.append(bar);
        }
        const pill = p.blocked ? el("span", "pill warn", t("paused") + " " + fmtUntil(p.blocked.until))
          : full ? el("span", "pill bad", t("full")) : el("span", "pill ok", t("ok"));
        row.append(name, bars, pill);
        card.append(row);
      }
      box.append(card);
    }
  }

  function renderEvents(events) {
    const body = $("events"); body.replaceChildren();
    if (!events.length) { const tr = el("tr"); const td = el("td", "msg", t("none")); td.colSpan = 5; tr.append(td); body.append(tr); return; }
    for (const e of events) {
      const tr = el("tr");
      const cls = e.outcome === "sent" ? "ok" : e.outcome === "failed" ? "bad" : "warn";
      tr.append(el("td", "", fmtTime(e.ts)), el("td", "", e.route), el("td", "", e.provider), el("td", cls, t(e.outcome)),
        el("td", "msg", [e.kind, e.message].filter(Boolean).join(" · ")));
      body.append(tr);
    }
  }

  async function refresh() {
    const key = store.get(); if (!key) return;
    try {
      const [quota, events] = await Promise.all([api("/v1/quota", key), api("/v1/events?limit=50", key)]);
      renderRoutes(quota.routes); renderEvents(events.events);
      $("login").hidden = true; $("app").hidden = false; $("error").hidden = true;
      $("updated").textContent = t("updated") + " " + fmtTime(new Date().toISOString());
    } catch (err) {
      if (err.message === "401") { store.set(null); showLogin(t("wrongKey")); }
      else { $("updated").textContent = t("offline"); }
    }
  }

  function showLogin(msg) {
    clearInterval(timer);
    $("app").hidden = true; $("login").hidden = false;
    $("error").hidden = !msg; $("error").textContent = msg || "";
  }

  $("loginForm").addEventListener("submit", (ev) => {
    ev.preventDefault(); store.set($("key").value.trim()); $("key").value = "";
    refresh(); clearInterval(timer); timer = setInterval(refresh, 10000);
  });
  $("logout").addEventListener("click", () => { store.set(null); showLogin(); });
  if (store.get()) { refresh(); timer = setInterval(refresh, 10000); }
})();
</script>
</body>
</html>`;
}
