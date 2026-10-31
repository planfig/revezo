import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./dashboard/page.css", import.meta.url), "utf8");
const js = readFileSync(new URL("./dashboard/page.js", import.meta.url), "utf8");

/**
 * The dashboard page. Static HTML: it asks for the API key, keeps it in sessionStorage
 * (gone when the tab closes) and talks to /v1/admin/* and /v1/events with it. All data is
 * written with textContent, never as HTML, and dynamic styles go through the CSSOM so the
 * Content-Security-Policy can forbid inline style attributes.
 */
export function dashboardHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Revezo</title>
<style nonce="${nonce}">${css}</style>
</head>
<body>
<main>
  <header>
    <h1>Revezo</h1>
    <span class="muted" id="updated" aria-live="polite"></span>
  </header>
  <section class="card" id="login" hidden>
    <h2 id="loginTitle"></h2>
    <p class="muted" id="loginHelp"></p>
    <form id="loginForm" class="entry">
      <label><span data-t="user"></span><input id="user" autocomplete="username" required maxlength="64"></label>
      <label><span data-t="password"></span><input id="password" type="password" autocomplete="current-password" required maxlength="200"></label>
      <div class="captcha" id="captchaBox" hidden>
        <img id="captchaImg" alt="captcha" width="170" height="60">
        <button type="button" class="ghost" id="captchaNew" data-t="captchaNew"></button>
        <label><span data-t="captcha"></span><input id="captcha" autocomplete="off" autocapitalize="characters" maxlength="8"></label>
      </div>
      <button type="submit" data-t="enter"></button>
    </form>
    <form id="setupForm" class="entry" hidden>
      <label><span>REVEZO_API_KEY</span><input id="setupKey" type="password" autocomplete="off" required maxlength="200"></label>
      <label><span data-t="user"></span><input id="setupUser" autocomplete="username" required minlength="3" maxlength="64"></label>
      <label><span data-t="newPassword"></span><input id="setupPass" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
      <label><span data-t="repeatPassword"></span><input id="setupPass2" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
      <button type="submit" data-t="saveLogin"></button>
    </form>
    <p class="row"><button class="link" type="button" id="toSetup" data-t="forgot"></button><button class="link" type="button" id="toLogin" data-t="backToLogin" hidden></button></p>
    <p id="error" role="alert" hidden></p>
  </section>
  <div id="app" hidden>
    <div class="live">
      <div class="row spread"><h2 data-t="liveTitle"></h2><span class="muted" data-t="liveHelp"></span></div>
      <nav class="sectors" id="sectorNav" aria-label="Sectors"></nav>
      <div id="visors"></div>
      <div class="legend">
        <span class="ok" data-t="legOk"></span><span class="warn" data-t="legHigh"></span>
        <span class="bad" data-t="legFull"></span><span class="off" data-t="legUser"></span>
      </div>
    </div>
    <section class="card" id="manage">
      <h2 data-t="manageTitle"></h2>
      <p class="notice" id="readonly" hidden></p>
      <ul class="notice" id="warnings" hidden></ul>
      <div id="routes"></div>
      <p id="manageMsg" aria-live="polite"></p>
    </section>
    <section class="card" id="addCard">
      <h2 data-t="addTitle"></h2>
      <p class="muted" data-t="addHelp"></p>
      <form id="addForm" autocomplete="off">
        <label><span data-t="route"></span><select id="addRoute" required></select></label>
        <label><span data-t="type"></span><select id="addType" required></select></label>
        <label><span data-t="name"></span><input id="addName" maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,47}"></label>
        <div class="fields" id="addFields"></div>
        <label><span data-t="perDay"></span><input id="addPerDay" type="number" min="0" step="1"></label>
        <label><span data-t="perMonth"></span><input id="addPerMonth" type="number" min="0" step="1"></label>
        <label><span data-t="perHour"></span><input id="addPerHour" type="number" min="0" step="1"></label>
        <label><span data-t="weight"></span><input id="addWeight" type="number" min="0.1" max="1000" step="0.1" value="1"></label>
        <label class="check"><input id="addMarketing" type="checkbox"><span data-t="marketing"></span></label>
        <button type="submit" data-t="add"></button>
      </form>
      <p id="addMsg" aria-live="polite"></p>
    </section>
    <section class="card" id="keysCard">
      <h2 data-t="keysTitle"></h2>
      <p class="muted" data-t="keysHelp"></p>
      <div id="keys"></div>
      <div class="notice" id="newKey" hidden>
        <p id="newKeyText"></p>
        <div class="row"><input id="newKeyValue" readonly aria-label="key"><button type="button" id="copyKey" data-t="copy"></button><button type="button" class="ghost" id="hideKey">OK</button></div>
      </div>
      <form id="keyForm" autocomplete="off">
        <label><span data-t="keyName"></span><input id="keyName" required maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{0,47}"></label>
        <label><span data-t="keyPerDay"></span><input id="keyPerDay" type="number" min="1" step="1"></label>
        <button type="submit" data-t="createKey"></button>
      </form>
      <p id="keyMsg" aria-live="polite"></p>
    </section>
    <section class="card" id="routeCard">
      <h2 data-t="newRouteTitle"></h2>
      <form id="routeForm" autocomplete="off">
        <label><span data-t="routeNameLabel"></span><input id="routeName" required maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,47}"></label>
        <label><span data-t="kind"></span><select id="routeKind" required></select></label>
        <label><span data-t="strategy"></span><select id="routeStrategy"></select></label>
        <button type="submit" data-t="create"></button>
      </form>
      <p id="routeMsg" aria-live="polite"></p>
    </section>
    <section class="card">
      <h2 data-t="recent"></h2>
      <div class="table"><table>
        <thead><tr><th data-t="time"></th><th data-t="route"></th><th data-t="provider"></th><th data-t="app"></th><th data-t="result"></th><th data-t="detail"></th></tr></thead>
        <tbody id="events"></tbody>
      </table></div>
    </section>
    <p><button class="link" id="logout" type="button" data-t="logout"></button></p>
  </div>
</main>
<script nonce="${nonce}">${js}</script>
</body>
</html>`;
}
