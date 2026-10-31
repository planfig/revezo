import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Auth, verifyPassword } from "../src/auth.ts";
import { buildConfig } from "../src/config.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();

const API_KEY = "k".repeat(32);
const PASSWORD = "correct-horse-battery";
const dirs: string[] = [];
const managers: Manager[] = [];
after(() => {
  for (const m of managers) m.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "revezo-auth-"));
  dirs.push(dir);
  const storagePath = join(dir, "storage.sqlite");
  const config = buildConfig({ routes: { mail: { kind: "email" } } }, { env: {}, store: new MemoryQuotaStore() });
  const manager = new Manager({ hub: config.hub, storagePath, secretsKey: "s".repeat(32) });
  managers.push(manager);
  let now = Date.now();
  const auth = new Auth(manager, () => now);
  const app = createServer({ hub: config.hub, defaults: {}, apiKey: API_KEY, manager, auth });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const cookieOf = (res: Response) => /revezo_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
  return { app, post, auth, manager, storagePath, cookieOf, advance: (ms: number) => (now += ms) };
}

test("the login is created with the API key and the password is stored only as a hash", async () => {
  const { app, post, storagePath, manager, cookieOf } = setup();
  assert.equal((await (await app.request("/auth/status")).json()).admin, false);
  assert.equal((await post("/auth/setup", { apiKey: "wrong", user: "owner", password: PASSWORD })).status, 401);
  assert.equal((await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: "short" })).status, 400);
  const res = await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.ok(cookieOf(res));

  const creds = manager.getCredentials()!;
  assert.equal(creds.user, "owner");
  assert.ok(await verifyPassword(PASSWORD, creds.hash));
  manager.close();
  assert.ok(!readFileSync(storagePath).includes(PASSWORD));
});

test("a session cookie opens the dashboard API; changes also need the panel header", async () => {
  const { app, post, cookieOf } = setup();
  await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD });
  const login = await post("/auth/login", { user: "owner", password: PASSWORD });
  assert.equal(login.status, 200);
  const cookie = `revezo_session=${cookieOf(login)}`;

  assert.equal((await app.request("/v1/admin/state")).status, 401);
  assert.equal((await app.request("/v1/admin/state", { headers: { cookie } })).status, 200);
  const body = JSON.stringify({ name: "news", kind: "email" });
  const noHeader = await app.request("/v1/admin/routes", { method: "POST", headers: { cookie, "content-type": "application/json" }, body });
  assert.equal(noHeader.status, 403);
  const ok = await app.request("/v1/admin/routes", { method: "POST", headers: { cookie, "content-type": "application/json", "x-revezo-panel": "1" }, body });
  assert.equal(ok.status, 200);
  // programs keep using the API key
  assert.equal((await app.request("/v1/admin/state", { headers: { authorization: `Bearer ${API_KEY}` } })).status, 200);

  await post("/auth/logout", {}, { cookie });
  assert.equal((await app.request("/v1/admin/state", { headers: { cookie } })).status, 401);
});

test("after 3 wrong tries a captcha is needed, after 10 the address is locked", async () => {
  const { app, post, auth, advance } = setup();
  await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD });
  for (let i = 0; i < 3; i++) assert.equal((await post("/auth/login", { user: "owner", password: "nope-nope-nope" })).status, 401);

  const noCaptcha = await post("/auth/login", { user: "owner", password: PASSWORD });
  assert.equal((await noCaptcha.json()).error, "captcha_required");

  const { id } = await (await post("/auth/captcha", {})).json();
  const svg = await (await app.request(`/auth/captcha/${id}.svg`)).text();
  assert.match(svg, /^<svg/);
  assert.ok(!/<text/.test(svg), "drawn with paths only");
  assert.ok(!svg.includes(auth.captchaAnswer(id)!));

  const wrong = await post("/auth/login", { user: "owner", password: PASSWORD, captchaId: id, captcha: "XXXXX" });
  assert.equal((await wrong.json()).error, "captcha_wrong");
  const id2 = (await (await post("/auth/captcha", {})).json()).id;
  const ok = await post("/auth/login", { user: "owner", password: PASSWORD, captchaId: id2, captcha: auth.captchaAnswer(id2)!.toLowerCase() });
  assert.equal(ok.status, 200);

  for (let i = 0; i < 10; i++) {
    const cid = (await (await post("/auth/captcha", {})).json()).id;
    await post("/auth/login", { user: "owner", password: "nope-nope-nope", captchaId: cid, captcha: auth.captchaAnswer(cid) });
  }
  const locked = await post("/auth/login", { user: "owner", password: PASSWORD });
  assert.equal(locked.status, 429);
  assert.ok((await locked.json()).retryAfterSec > 0);
  assert.equal((await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD })).status, 429);

  advance(16 * 60_000);
  const cid = (await (await post("/auth/captcha", {})).json()).id;
  assert.equal((await post("/auth/login", { user: "owner", password: PASSWORD, captchaId: cid, captcha: auth.captchaAnswer(cid) })).status, 200);
});

test("a forgotten password is replaced with the API key and old sessions end", async () => {
  const { app, post, cookieOf } = setup();
  const first = await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD });
  const oldCookie = `revezo_session=${cookieOf(first)}`;
  assert.equal((await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: "a-brand-new-password" })).status, 200);
  assert.equal((await app.request("/v1/admin/state", { headers: { cookie: oldCookie } })).status, 401);
  assert.equal((await post("/auth/login", { user: "owner", password: PASSWORD })).status, 401);
  assert.equal((await post("/auth/login", { user: "owner", password: "a-brand-new-password" })).status, 200);
});

test("sessions expire after 12 hours without use", async () => {
  const { app, post, cookieOf, advance } = setup();
  const res = await post("/auth/setup", { apiKey: API_KEY, user: "owner", password: PASSWORD });
  const cookie = `revezo_session=${cookieOf(res)}`;
  advance(11 * 3_600_000);
  assert.equal((await app.request("/v1/admin/state", { headers: { cookie } })).status, 200);
  advance(13 * 3_600_000);
  assert.equal((await app.request("/v1/admin/state", { headers: { cookie } })).status, 401);
});
