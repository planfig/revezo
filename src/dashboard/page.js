// Dashboard client. Inlined into the page with a CSP nonce. Rules: data goes in with
// textContent only, and dynamic styles only through the CSSOM (element.style), never as
// inline style attributes.
(() => {
  "use strict";
  const T = {
    en: {
      loginTitle: "Open dashboard", loginHelp: "Paste the REVEZO_API_KEY. It is kept only in this tab.", open: "Open",
      liveTitle: "Live view", liveHelp: "Updates every 3 seconds", clients: "Clients", clientsSub: "your apps", hub: "Hub",
      hubSub: "{routes} routes · {sent} sent today", recent: "Recent attempts", time: "Time", route: "Route", provider: "Provider",
      result: "Result", detail: "Detail", logout: "Close dashboard", updated: "Updated", wrongKey: "Wrong key.",
      offline: "Could not reach the server.", today: "Today", month: "Month", noLimit: "no limit",
      st_ok: "free", st_high: "almost full", st_full: "full", st_blocked: "paused by errors until {until}", st_user: "paused by you",
      sent: "sent", skipped_full: "skipped: full", skipped_blocked: "skipped: paused (errors)", skipped_capability: "skipped: not allowed",
      skipped_paused: "skipped: paused by you", failed: "failed", none: "No attempts yet.",
      legOk: "free", legHigh: "80% or more of the limit", legFull: "full or paused by errors", legUser: "paused by you",
      diagramDesc: "{providers} providers in {routes} routes. {sent} sent today.", noProviders: "no providers yet",
      manageTitle: "Manage APIs", fromFile: "from the file", fromPanel: "added here", default: "default",
      priority: "priority", weighted: "by weight", "least-used": "least used", strategy: "Strategy", kind: "Kind",
      up: "Move up", down: "Move down", pause: "Pause", resume: "Resume", edit: "Edit", remove: "Remove", save: "Save", cancel: "Cancel",
      removeRoute: "Remove route", weight: "Weight", perMinute: "Per minute", perHour: "Per hour", perDay: "Per day", perMonth: "Per month",
      marketing: "Allows marketing e-mails", keysSaved: "keys", saved: "saved", missing: "missing",
      confirmRemove: "Remove {name}? Its saved keys are deleted.", confirmRemoveRoute: "Remove route {name}?",
      addTitle: "Add an API", addHelp: "Keys are stored encrypted and never shown again. The hub starts using the new API on the next call.",
      type: "Type", name: "Name (optional)", add: "Add", newRouteTitle: "New route", create: "Create",
      done: "Done.", added: "{name} added. The hub is already using it.", ro_memory_storage: "Read only: counters are kept in memory. Set storage.sqlite in revezo.config.yaml to manage APIs here.",
      ro_no_secrets_key: "Read only: REVEZO_SECRETS_KEY is not set. It encrypts the API keys you add here. Add it to .env and restart.",
      ro_no_api_key: "Read only: the server runs without REVEZO_API_KEY.",
      limitsLine: "{limits} · weight {weight}", perDayShort: "/day", perMonthShort: "/month", perHourShort: "/hour", perMinuteShort: "/min",
    },
    pt: {
      loginTitle: "Abrir painel", loginHelp: "Cole a REVEZO_API_KEY. Ela fica guardada só nesta aba.", open: "Abrir",
      liveTitle: "Ao vivo", liveHelp: "Atualiza a cada 3 segundos", clients: "Clientes", clientsSub: "seus apps", hub: "Hub",
      hubSub: "{routes} rotas · {sent} envios hoje", recent: "Últimas tentativas", time: "Hora", route: "Rota", provider: "Provedor",
      result: "Resultado", detail: "Detalhe", logout: "Fechar painel", updated: "Atualizado", wrongKey: "Chave errada.",
      offline: "Não foi possível falar com o servidor.", today: "Hoje", month: "Mês", noLimit: "sem limite",
      st_ok: "livre", st_high: "quase cheio", st_full: "cheio", st_blocked: "pausado por erro até {until}", st_user: "pausado por você",
      sent: "enviado", skipped_full: "pulado: cheio", skipped_blocked: "pulado: pausado (erro)", skipped_capability: "pulado: não permitido",
      skipped_paused: "pulado: pausado por você", failed: "falhou", none: "Nenhuma tentativa ainda.",
      legOk: "livre", legHigh: "80% ou mais do limite", legFull: "cheio ou pausado por erro", legUser: "pausado por você",
      diagramDesc: "{providers} provedores em {routes} rotas. {sent} envios hoje.", noProviders: "nenhum provedor ainda",
      manageTitle: "Gerir APIs", fromFile: "do arquivo", fromPanel: "do painel", default: "padrão",
      priority: "prioridade", weighted: "por peso", "least-used": "menos usado", strategy: "Estratégia", kind: "Tipo de API",
      up: "Subir", down: "Descer", pause: "Pausar", resume: "Retomar", edit: "Editar", remove: "Remover", save: "Salvar", cancel: "Cancelar",
      removeRoute: "Remover rota", weight: "Peso", perMinute: "Por minuto", perHour: "Por hora", perDay: "Por dia", perMonth: "Por mês",
      marketing: "Permite e-mails de marketing", keysSaved: "chaves", saved: "guardada", missing: "em falta",
      confirmRemove: "Remover {name}? As chaves guardadas são apagadas.", confirmRemoveRoute: "Remover a rota {name}?",
      addTitle: "Adicionar API", addHelp: "As chaves ficam guardadas cifradas e nunca mais aparecem. O hub passa a usar a nova API já na próxima chamada.",
      type: "Provedor", name: "Nome (opcional)", add: "Adicionar", newRouteTitle: "Nova rota", create: "Criar",
      done: "Feito.", added: "{name} adicionado. O hub já está usando.", ro_memory_storage: "Só leitura: os contadores estão só na memória. Ponha storage.sqlite no revezo.config.yaml para gerir as APIs aqui.",
      ro_no_secrets_key: "Só leitura: falta a variável REVEZO_SECRETS_KEY, que cifra as chaves das APIs adicionadas aqui. Acrescente-a ao .env e reinicie.",
      ro_no_api_key: "Só leitura: o servidor está rodando sem REVEZO_API_KEY.",
      limitsLine: "{limits} · peso {weight}", perDayShort: "/dia", perMonthShort: "/mês", perHourShort: "/hora", perMinuteShort: "/min",
      "API key": "Chave da API", "Secret key": "Chave secreta", Port: "Porta", User: "Usuário", Password: "Senha",
      "TLS from the start (port 465)": "TLS desde o início (porta 465)",
      err_duplicate_name: "Já existe um provedor ou rota com esse nome.",
      err_duplicate_account: "Esta rota já tem uma conta desse provedor. Somar contas grátis do mesmo provedor viola os termos dele.",
      err_from_file: "Isto vem do revezo.config.yaml: mude lá.", err_read_only: "O painel está só de leitura.",
      err_invalid_name: "Nome inválido: use letras, números, - _ ou . (até 48).", err_not_empty: "Remova primeiro os provedores da rota.",
      err_missing_option: "Falta preencher um campo obrigatório.", err_invalid_limits: "Limites inválidos: use números inteiros.",
      err_invalid_weight: "O peso tem de ser maior que 0 e até 1000.",
    },
  };
  const lang = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
  const t = (k, vars) => {
    let s = T[lang][k] ?? T.en[k] ?? k;
    if (vars) for (const [name, v] of Object.entries(vars)) s = s.split("{" + name + "}").join(String(v));
    return s;
  };
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t(e.dataset.t); });

  const SVGNS = "http://www.w3.org/2000/svg";
  const WINDOWS = ["minute", "hour", "day", "month"];
  const LIMIT = { minute: "perMinute", hour: "perHour", day: "perDay", month: "perMonth" };
  const STRATEGIES = ["priority", "weighted", "least-used"];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const sv = (tag, attrs, cls, text) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    if (cls) e.setAttribute("class", cls);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const store = {
    get() { try { return sessionStorage.getItem("revezo-key"); } catch { return null; } },
    set(v) { try { v ? sessionStorage.setItem("revezo-key", v) : sessionStorage.removeItem("revezo-key"); } catch {} },
  };
  const num = (n) => Number(n).toLocaleString(lang);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtUntil = (iso) => new Date(iso).toLocaleString(lang, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const clip = (s, max) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s);

  let state = null;
  let lastId = null;
  let recent = [];
  let timer = null;
  let busy = false;
  let diagram = null; // { sig, svg, inWire, wires: Map, nodes: Map, dots, layer }
  let manageSig = "";
  let editing = null; // provider name whose edit form is open

  async function api(path, opts = {}) {
    const headers = { authorization: "Bearer " + store.get() };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(path, {
      method: opts.method || "GET", headers, cache: "no-store",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((data && data.message) || String(res.status));
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  function provState(p) {
    if (p.paused) return "user";
    if (p.blocked) return "blocked";
    let max = 0;
    for (const w of WINDOWS) {
      const limit = p.limits[LIMIT[w]];
      if (limit === undefined) continue;
      max = Math.max(max, limit === 0 ? 1 : p.usage[w] / limit);
    }
    return max >= 1 ? "full" : max >= 0.8 ? "high" : "ok";
  }
  const stateText = (p, s) => t("st_" + s, { until: p.blocked ? fmtUntil(p.blocked.until) : "" });
  const usageText = (used, limit) => (limit === undefined ? num(used) + " · " + t("noLimit") : num(used) + " / " + num(limit));

  // ---------- live diagram ----------

  function layout(routes, W) {
    const vertical = W < 640;
    const BOX_H = 96, GAP = 12, LABEL_H = 24, GROUP_GAP = 18;
    const all = routes.flatMap((r) => r.providers);
    const nodes = [];
    const groups = [];
    let clients, hub, boxX, boxW, y, rail = null;
    if (!vertical) {
      boxW = Math.round(Math.min(320, Math.max(230, W * 0.38)));
      boxX = W - boxW - 2;
      y = 4;
    } else {
      clients = { x: W / 2 - 64, y: 4, w: 128, h: 50 };
      hub = { x: 2, y: 84, w: W - 4, h: 54 };
      const n = Math.max(1, all.length);
      const step = Math.min(10, 70 / n);
      rail = { x0: 14, step };
      boxX = Math.round(rail.x0 + n * step + 12);
      boxW = W - boxX - 2;
      y = hub.y + hub.h + 18;
    }
    let i = 0;
    for (const r of routes) {
      groups.push({ route: r, x: boxX, y: y + 15 });
      y += LABEL_H;
      if (!r.providers.length) {
        groups[groups.length - 1].empty = { x: boxX, y: y + 12 };
        y += 26;
      }
      for (const p of r.providers) {
        nodes.push({ p, route: r.route, i: i++, x: boxX, y, w: boxW, h: BOX_H });
        y += BOX_H + GAP;
      }
      y += GROUP_GAP;
    }
    const H = Math.max(y, vertical ? 200 : 220);
    if (!vertical) {
      hub = { x: Math.round(Math.max(150, W * 0.3)), y: H / 2 - 42, w: 132, h: 84 };
      clients = { x: 2, y: H / 2 - 32, w: 116, h: 64 };
    }
    for (const n of nodes) {
      const cy = n.y + n.h / 2;
      if (!vertical) {
        const x0 = hub.x + hub.w, y0 = hub.y + hub.h / 2, mx = (x0 + n.x) / 2;
        n.d = "M" + x0 + "," + y0 + " C" + mx + "," + y0 + " " + mx + "," + cy + " " + n.x + "," + cy;
      } else {
        const sx = rail.x0 + n.i * rail.step, y0 = hub.y + hub.h;
        n.d = "M" + sx + "," + y0 + " L" + sx + "," + (cy - 10) + " Q" + sx + "," + cy + " " + (sx + 10) + "," + cy + " L" + n.x + "," + cy;
      }
    }
    const inD = !vertical
      ? "M" + (clients.x + clients.w) + "," + (clients.y + clients.h / 2) + " L" + hub.x + "," + (hub.y + hub.h / 2)
      : "M" + (W / 2) + "," + (clients.y + clients.h) + " L" + (W / 2) + "," + hub.y;
    return { W, H, vertical, clients, hub, nodes, groups, inD };
  }

  function buildDiagram(routes) {
    const box = $("diagram");
    const W = Math.max(300, Math.floor(box.clientWidth || 320));
    const L = layout(routes, W);
    const svg = sv("svg", { viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H, "aria-hidden": "true", focusable: "false" });
    const wiresG = sv("g"), nodesG = sv("g"), layer = sv("g");
    svg.append(wiresG, nodesG, layer);

    const inWire = sv("path", { d: L.inD }, "wire w-in");
    wiresG.append(inWire);
    const wires = new Map();
    const nodes = new Map();
    for (const n of L.nodes) {
      const wire = sv("path", { d: n.d }, "wire w-ok");
      wiresG.append(wire);
      wires.set(n.p.name, wire);

      const g = sv("g");
      const rect = sv("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 8 }, "box");
      const maxChars = Math.floor((n.w - 24) / 7.4);
      const name = sv("text", { x: n.x + 12, y: n.y + 20 }, "t-name", clip(n.p.name, maxChars));
      const meta = sv("text", { x: n.x + 12, y: n.y + 37 }, "t-meta");
      const dayT = sv("text", { x: n.x + 12, y: n.y + 56 }, "t-num");
      const monthT = sv("text", { x: n.x + n.w - 12, y: n.y + 56, "text-anchor": "end" }, "t-num");
      const track = sv("rect", { x: n.x + 12, y: n.y + 63, width: n.w - 24, height: 5, rx: 2.5 }, "track");
      const fill = sv("rect", { x: n.x + 12, y: n.y + 63, width: 0, height: 5, rx: 2.5 }, "fill");
      const st = sv("text", { x: n.x + 12, y: n.y + 85 }, "t-state");
      g.append(rect, name, meta, dayT, monthT, track, fill, st);
      nodesG.append(g);
      nodes.set(n.p.name, { n, rect, meta, dayT, monthT, fill, st, maxChars });
    }
    for (const gr of L.groups) {
      const label = gr.route.route + " · " + t(gr.route.strategy) + (gr.route.isDefault ? " · " + t("default") : "");
      nodesG.append(sv("text", { x: gr.x + 2, y: gr.y }, "t-group", clip(label.toUpperCase(), Math.floor(L.W / 7))));
      if (gr.empty) nodesG.append(sv("text", { x: gr.empty.x + 2, y: gr.empty.y }, "t-meta", t("noProviders")));
    }
    const c = L.clients;
    nodesG.append(
      sv("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: 8 }, "box"),
      sv("text", { x: c.x + c.w / 2, y: c.y + c.h / 2 - 2, "text-anchor": "middle" }, "t-name", t("clients")),
      sv("text", { x: c.x + c.w / 2, y: c.y + c.h / 2 + 15, "text-anchor": "middle" }, "t-meta", t("clientsSub")),
    );
    const h = L.hub;
    const hubSub = sv("text", { x: h.x + h.w / 2, y: h.y + h.h / 2 + 16, "text-anchor": "middle" }, "t-hubsub");
    nodesG.append(
      sv("rect", { x: h.x, y: h.y, width: h.w, height: h.h, rx: 10 }, "hubbox"),
      sv("text", { x: h.x + h.w / 2, y: h.y + h.h / 2 - 2, "text-anchor": "middle" }, "t-hub", t("hub")),
      hubSub,
    );
    box.replaceChildren(svg);
    if (diagram) diagram.dots.forEach((d) => cancelAnimationFrame(d));
    diagram = { svg, inWire, wires, nodes, hubSub, layer, dots: new Set(), L };
  }

  function updateDiagram(routes) {
    const all = routes.flatMap((r) => r.providers);
    const maxDay = Math.max(1, ...all.map((p) => p.usage.day));
    const total = all.reduce((s, p) => s + p.usage.day, 0);
    // On phones the wires run side by side down a rail, so they stay thinner than the gap.
    const maxExtra = diagram.L.vertical ? Math.max(0, Math.min(10, 70 / Math.max(1, all.length)) - 4) : 10;
    diagram.inWire.style.strokeWidth = (total > 0 ? 3 + Math.min(9, Math.sqrt(total)) : 2) + "px";
    diagram.hubSub.textContent = t("hubSub", { routes: routes.length, sent: num(total) });
    for (const r of routes) {
      for (const p of r.providers) {
        const s = provState(p);
        const wire = diagram.wires.get(p.name);
        const node = diagram.nodes.get(p.name);
        if (!wire || !node) continue;
        wire.setAttribute("class", "wire w-" + s);
        wire.style.strokeWidth = (p.usage.day > 0 ? 2 + maxExtra * Math.sqrt(p.usage.day / maxDay) : 2) + "px";
        node.rect.setAttribute("class", "box b-" + s);
        node.meta.textContent = clip(p.type + " · " + t(p.source === "panel" ? "fromPanel" : "fromFile"), node.maxChars + 6);
        node.dayT.textContent = t("today") + " " + usageText(p.usage.day, p.limits.perDay);
        node.monthT.textContent = t("month") + " " + usageText(p.usage.month, p.limits.perMonth);
        const limit = p.limits.perDay ?? p.limits.perMonth;
        const used = p.limits.perDay !== undefined ? p.usage.day : p.usage.month;
        const ratio = limit ? Math.min(1, used / limit) : 0;
        node.fill.setAttribute("width", String(Math.round((node.n.w - 24) * ratio)));
        node.fill.setAttribute("class", "fill s-" + s);
        node.st.setAttribute("class", "t-state s-" + s);
        node.st.textContent = clip(stateText(p, s), node.maxChars + 4);
      }
    }
    $("diagramDesc").textContent = t("diagramDesc", { providers: all.length, routes: routes.length, sent: num(total) });
  }

  function renderDiagram(routes) {
    const W = Math.floor($("diagram").clientWidth || 320);
    const sig = JSON.stringify([Math.round(W / 40), routes.map((r) => [r.route, r.strategy, r.isDefault, r.providers.map((p) => p.name)])]);
    if (!diagram || diagram.sig !== sig) {
      buildDiagram(routes);
      diagram.sig = sig;
    }
    updateDiagram(routes);
  }

  /** A dot running Clients → Hub → provider for one sent message. */
  function sendDot(provider, delay) {
    if (!diagram) return;
    const wire = diagram.wires.get(provider);
    if (!wire) return;
    const dot = sv("circle", { r: 5, cx: -20, cy: -20 }, "dot");
    if (motion.matches) {
      const len = wire.getTotalLength();
      const pt = wire.getPointAtLength(len);
      dot.setAttribute("cx", String(pt.x - 8));
      dot.setAttribute("cy", String(pt.y));
      diagram.layer.append(dot);
      setTimeout(() => dot.remove(), 1500);
      return;
    }
    const legs = [diagram.inWire, wire];
    const lens = legs.map((w) => w.getTotalLength());
    const total = lens[0] + lens[1];
    const DURATION = 1400;
    let start = null;
    const layer = diagram.layer;
    const dots = diagram.dots;
    let raf = 0;
    const step = (now) => {
      dots.delete(raf);
      if (start === null) start = now + delay;
      const k = (now - start) / DURATION;
      if (k >= 1 || !layer.isConnected) { dot.remove(); return; }
      if (k >= 0) {
        if (!dot.isConnected) layer.append(dot);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const d = eased * total;
        const pt = d <= lens[0] ? legs[0].getPointAtLength(d) : legs[1].getPointAtLength(d - lens[0]);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
      }
      raf = requestAnimationFrame(step);
      dots.add(raf);
    };
    raf = requestAnimationFrame(step);
    dots.add(raf);
  }

  /** A red mark in the middle of the provider's wire for a failed attempt. */
  function failMark(provider) {
    if (!diagram) return;
    const wire = diagram.wires.get(provider);
    if (!wire) return;
    const pt = wire.getPointAtLength(wire.getTotalLength() * 0.6);
    const g = sv("g", {}, "fail");
    g.append(
      sv("circle", { cx: pt.x, cy: pt.y, r: 9 }, "failmark"),
      sv("path", { d: "M" + (pt.x - 3.5) + "," + (pt.y - 3.5) + " L" + (pt.x + 3.5) + "," + (pt.y + 3.5) + " M" + (pt.x + 3.5) + "," + (pt.y - 3.5) + " L" + (pt.x - 3.5) + "," + (pt.y + 3.5) }, "failx"),
    );
    diagram.layer.append(g);
    setTimeout(() => g.remove(), 8000);
  }

  // ---------- recent attempts ----------

  function renderEvents() {
    const body = $("events");
    body.replaceChildren();
    if (!recent.length) {
      const tr = el("tr");
      const td = el("td", "msg", t("none"));
      td.colSpan = 5;
      tr.append(td);
      body.append(tr);
      return;
    }
    for (const e of recent) {
      const tr = el("tr");
      const cls = e.outcome === "sent" ? "ok" : e.outcome === "failed" ? "bad" : "warn";
      tr.append(el("td", "", fmtTime(e.ts)), el("td", "", e.route), el("td", "", e.provider), el("td", cls, t(e.outcome)),
        el("td", "msg", [e.kind, e.message].filter(Boolean).join(" · ")));
      body.append(tr);
    }
  }

  async function pullEvents() {
    if (lastId === null) {
      const res = await api("/v1/events?limit=50");
      recent = res.events;
      lastId = res.last;
      renderEvents();
      return;
    }
    const res = await api("/v1/events?limit=200&since=" + lastId);
    if (res.last < lastId) { lastId = null; return pullEvents(); } // server restarted
    lastId = res.last;
    if (!res.events.length) return;
    const fresh = res.events.slice().reverse();
    let delay = 0;
    for (const e of fresh) {
      if (e.outcome === "sent") { sendDot(e.provider, delay); delay += 180; }
      else if (e.outcome === "failed") failMark(e.provider);
    }
    recent = res.events.concat(recent).slice(0, 50);
    renderEvents();
  }

  // ---------- management ----------

  const msg = (id, text, ok) => { const p = $(id); p.textContent = text || ""; p.className = text ? (ok ? "msg-ok" : "msg-bad") : ""; };
  const errText = (err) => (T[lang]["err_" + err.code] ? t("err_" + err.code) : err.message);

  async function act(method, path, body, msgId, okText) {
    try {
      await api(path, { method, body });
      msg(msgId, okText || t("done"), true);
      editing = null;
      manageSig = "";
      await refresh();
      return true;
    } catch (err) {
      if (err.status === 401) { store.set(null); showLogin(t("wrongKey")); return false; }
      msg(msgId, errText(err), false);
      return false;
    }
  }

  function limitsLine(p) {
    const parts = [];
    for (const w of ["day", "month", "hour", "minute"]) {
      const v = p.limits[LIMIT[w]];
      if (v !== undefined) parts.push(num(v) + t(LIMIT[w] + "Short"));
    }
    return t("limitsLine", { limits: parts.join(" · ") || t("noLimit"), weight: p.weight });
  }

  function renderManage() {
    const writable = state.writable;
    const ro = $("readonly");
    ro.hidden = writable;
    ro.textContent = writable ? "" : t("ro_" + state.reason);
    const warn = $("warnings");
    warn.replaceChildren(...state.warnings.map((w) => el("li", "", w)));
    warn.hidden = !state.warnings.length;
    $("addCard").hidden = !writable;
    $("routeCard").hidden = !writable;

    const box = $("routes");
    box.replaceChildren();
    for (const r of state.routes) {
      const sec = el("div", "route");
      const head = el("div", "row");
      head.append(el("h3", "", r.route), el("span", "muted", r.kind), el("span", "pill " + (r.source === "panel" ? "ok" : "off"), t(r.source === "panel" ? "fromPanel" : "fromFile")));
      if (r.isDefault) head.append(el("span", "pill ok", t("default")));
      const strat = el("select", "inline");
      strat.setAttribute("aria-label", t("strategy") + " " + r.route);
      for (const s of STRATEGIES) { const o = el("option", "", t(s)); o.value = s; strat.append(o); }
      strat.value = r.strategy;
      strat.disabled = !writable;
      strat.addEventListener("change", () => act("PATCH", "/v1/admin/routes/" + encodeURIComponent(r.route), { strategy: strat.value }, "manageMsg"));
      head.append(el("span", "grow"), strat);
      if (writable && r.source === "panel" && !r.providers.length) {
        const rm = el("button", "ghost danger", t("removeRoute"));
        rm.type = "button";
        rm.addEventListener("click", () => { if (confirm(t("confirmRemoveRoute", { name: r.route }))) act("DELETE", "/v1/admin/routes/" + encodeURIComponent(r.route), undefined, "manageMsg"); });
        head.append(rm);
      }
      sec.append(head);
      if (!r.providers.length) sec.append(el("p", "muted", t("noProviders")));
      r.providers.forEach((p, idx) => sec.append(providerRow(r, p, idx, writable)));
      box.append(sec);
    }
  }

  function providerRow(r, p, idx, writable) {
    const row = el("div", "prov");
    const s = provState(p);
    const info = el("div", "grow");
    const top = el("div", "row");
    top.append(el("span", "name", p.name), el("span", "muted", p.type),
      el("span", "pill " + (p.source === "panel" ? "ok" : "off"), t(p.source === "panel" ? "fromPanel" : "fromFile")),
      el("span", "pill " + ({ ok: "ok", high: "warn", full: "bad", blocked: "bad", user: "off" })[s], stateText(p, s)));
    info.append(top);
    const secretNames = Object.keys(p.secrets || {});
    let line = limitsLine(p);
    if (secretNames.length) line += " · " + t("keysSaved") + ": " + secretNames.map((k) => k + " " + (p.secrets[k] ? "✓ " + t("saved") : "✗ " + t("missing"))).join(", ");
    info.append(el("div", "muted", line));
    row.append(info);

    const actions = el("div", "actions");
    const btn = (label, fn, cls) => {
      const b = el("button", "ghost" + (cls ? " " + cls : ""), label);
      b.type = "button";
      b.disabled = !writable;
      b.addEventListener("click", fn);
      actions.append(b);
      return b;
    };
    const move = (delta) => {
      const order = r.providers.map((x) => x.name);
      const j = idx + delta;
      [order[idx], order[j]] = [order[j], order[idx]];
      act("PATCH", "/v1/admin/routes/" + encodeURIComponent(r.route), { order }, "manageMsg");
    };
    const upB = btn("↑", () => move(-1));
    upB.setAttribute("aria-label", t("up") + " " + p.name);
    upB.disabled = !writable || idx === 0;
    const downB = btn("↓", () => move(1));
    downB.setAttribute("aria-label", t("down") + " " + p.name);
    downB.disabled = !writable || idx === r.providers.length - 1;
    btn(p.paused ? t("resume") : t("pause"), () => act("PATCH", "/v1/admin/providers/" + encodeURIComponent(p.name), { paused: !p.paused }, "manageMsg"));
    if (p.source === "panel") {
      btn(t("edit"), () => { editing = editing === p.name ? null : p.name; renderManage(); });
      btn(t("remove"), () => {
        if (confirm(t("confirmRemove", { name: p.name }))) act("DELETE", "/v1/admin/providers/" + encodeURIComponent(p.name), undefined, "manageMsg");
      }, "danger");
    }
    row.append(actions);
    if (editing === p.name && writable) row.append(editForm(p));
    return row;
  }

  function numberInput(labelKey, value, attrs) {
    const label = el("label");
    const input = el("input");
    input.type = "number";
    input.min = attrs && attrs.min !== undefined ? attrs.min : "0";
    input.step = attrs && attrs.step ? attrs.step : "1";
    if (attrs && attrs.max) input.max = attrs.max;
    if (value !== undefined) input.value = String(value);
    label.append(el("span", "", t(labelKey)), input);
    return { label, input };
  }

  function readLimits(inputs) {
    const limits = {};
    for (const [key, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      limits[key] = v === "" ? null : Number(v);
    }
    return limits;
  }

  function editForm(p) {
    const form = el("form", "edit");
    const inputs = {};
    for (const key of ["perDay", "perMonth", "perHour", "perMinute"]) {
      const f = numberInput(key, p.limits[key]);
      inputs[key] = f.input;
      form.append(f.label);
    }
    const w = numberInput("weight", p.weight, { min: "0.1", max: "1000", step: "0.1" });
    form.append(w.label);
    const mk = el("label", "check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = p.capabilities && p.capabilities.allowsMarketing === true;
    mk.append(box, el("span", "", t("marketing")));
    form.append(mk);
    const save = el("button", "", t("save"));
    save.type = "submit";
    const cancel = el("button", "ghost", t("cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => { editing = null; renderManage(); });
    form.append(save, cancel);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      act("PATCH", "/v1/admin/providers/" + encodeURIComponent(p.name), {
        limits: readLimits(inputs), weight: Number(w.input.value), capabilities: { allowsMarketing: box.checked },
      }, "manageMsg");
    });
    return form;
  }

  // ---------- add forms ----------

  let addSig = "";
  let addTypeShown = "";

  function syncAddForms() {
    const sig = JSON.stringify([state.routes.map((r) => [r.route, r.kind]), state.plugins.map((p) => p.kind + ":" + p.id)]);
    if (sig === addSig) return;
    addSig = sig;
    const routeSel = $("addRoute");
    const keep = routeSel.value;
    routeSel.replaceChildren(...state.routes.map((r) => { const o = el("option", "", r.route + " (" + r.kind + ")"); o.value = r.route; return o; }));
    if (state.routes.some((r) => r.route === keep)) routeSel.value = keep;
    syncTypes();
    const kinds = [...new Set(state.plugins.map((p) => p.kind))];
    const kindSel = $("routeKind");
    const keepKind = kindSel.value;
    kindSel.replaceChildren(...kinds.map((k) => { const o = el("option", "", k); o.value = k; return o; }));
    if (kinds.includes(keepKind)) kindSel.value = keepKind;
    const stratSel = $("routeStrategy");
    if (!stratSel.options.length) stratSel.append(...STRATEGIES.map((s) => { const o = el("option", "", t(s)); o.value = s; return o; }));
  }

  function syncTypes() {
    const route = state.routes.find((r) => r.route === $("addRoute").value);
    const typeSel = $("addType");
    const keep = typeSel.value;
    const plugins = state.plugins.filter((p) => route && p.kind === route.kind);
    typeSel.replaceChildren(...plugins.map((p) => { const o = el("option", "", p.label); o.value = p.id; return o; }));
    if (plugins.some((p) => p.id === keep)) typeSel.value = keep;
    showFields();
  }

  function showFields() {
    const plugin = state.plugins.find((p) => p.id === $("addType").value && state.routes.some((r) => r.route === $("addRoute").value && r.kind === p.kind));
    const key = plugin ? plugin.kind + ":" + plugin.id : "";
    if (key === addTypeShown) return;
    addTypeShown = key;
    const box = $("addFields");
    box.replaceChildren();
    if (!plugin) return;
    for (const f of plugin.fields) {
      const input = el("input");
      input.dataset.field = f.name;
      input.dataset.kind = f.type;
      if (f.type === "boolean") {
        input.type = "checkbox";
        const label = el("label", "check");
        label.append(input, el("span", "", t(f.label)));
        box.append(label);
        continue;
      }
      input.type = f.secret ? "password" : f.type === "number" ? "number" : "text";
      if (f.secret) input.autocomplete = "new-password";
      input.maxLength = 1000;
      input.required = f.required;
      const label = el("label");
      label.append(el("span", "", t(f.label) + (f.required ? " *" : "")), input);
      box.append(label);
    }
    const s = plugin.suggestedLimits || {};
    $("addPerDay").value = s.perDay !== undefined ? String(s.perDay) : "";
    $("addPerMonth").value = s.perMonth !== undefined ? String(s.perMonth) : "";
    $("addPerHour").value = s.perHour !== undefined ? String(s.perHour) : "";
    $("addMarketing").checked = plugin.defaultCapabilities.allowsMarketing === true;
    $("addName").placeholder = plugin.id;
  }

  /** "brevo", or "brevo-2", "brevo-3"... when the name is taken. */
  function freeName(base) {
    const taken = new Set(state.routes.flatMap((r) => r.providers.map((p) => p.name)));
    let name = base;
    for (let i = 2; taken.has(name); i++) name = base + "-" + i;
    return name;
  }

  $("addRoute").addEventListener("change", syncTypes);
  $("addType").addEventListener("change", showFields);

  $("addForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const options = {};
    for (const input of $("addFields").querySelectorAll("input")) {
      const k = input.dataset.field;
      if (input.dataset.kind === "boolean") { if (input.checked) options[k] = true; }
      else if (input.value.trim() !== "") options[k] = input.dataset.kind === "number" ? Number(input.value) : input.value.trim();
    }
    const limits = {};
    for (const [key, id] of [["perDay", "addPerDay"], ["perMonth", "addPerMonth"], ["perHour", "addPerHour"]]) {
      const v = $(id).value.trim();
      if (v !== "") limits[key] = Number(v);
    }
    const name = $("addName").value.trim() || freeName($("addType").value);
    const ok = await act("POST", "/v1/admin/providers", {
      route: $("addRoute").value, use: $("addType").value, name, options, limits,
      weight: Number($("addWeight").value) || 1, capabilities: { allowsMarketing: $("addMarketing").checked },
    }, "addMsg", t("added", { name }));
    if (ok) {
      $("addName").value = "";
      for (const input of $("addFields").querySelectorAll("input")) { input.value = ""; input.checked = false; }
    }
  });

  $("routeForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ok = await act("POST", "/v1/admin/routes", { name: $("routeName").value.trim(), kind: $("routeKind").value, strategy: $("routeStrategy").value }, "routeMsg");
    if (ok) $("routeName").value = "";
  });

  // ---------- refresh loop ----------

  async function refresh() {
    if (busy || !store.get()) return;
    busy = true;
    try {
      state = await api("/v1/admin/state");
      $("login").hidden = true;
      $("app").hidden = false;
      $("error").hidden = true;
      renderDiagram(state.routes);
      const sig = JSON.stringify([state.writable, state.reason, state.warnings, state.routes.map((r) => [r.route, r.strategy,
        r.providers.map((p) => [p.name, p.paused, provState(p), p.limits, p.weight, p.capabilities, p.secrets])])]);
      const typing = document.activeElement && $("routes").contains(document.activeElement) && document.activeElement.tagName !== "BUTTON";
      if (sig !== manageSig && !typing && editing === null) { manageSig = sig; renderManage(); }
      syncAddForms();
      await pullEvents();
      $("updated").textContent = t("updated") + " " + fmtTime(new Date().toISOString());
    } catch (err) {
      if (err.status === 401) { store.set(null); showLogin(t("wrongKey")); }
      else $("updated").textContent = t("offline");
    } finally {
      busy = false;
    }
  }

  function start() {
    clearInterval(timer);
    refresh();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, 3000);
  }

  function showLogin(text) {
    clearInterval(timer);
    lastId = null;
    recent = [];
    manageSig = "";
    addSig = "";
    $("app").hidden = true;
    $("login").hidden = false;
    $("error").hidden = !text;
    $("error").textContent = text || "";
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state) renderDiagram(state.routes); }, 200);
  });

  $("loginForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    store.set($("key").value.trim());
    $("key").value = "";
    start();
  });
  $("logout").addEventListener("click", () => { store.set(null); showLogin(); });
  if (store.get()) start();
})();
