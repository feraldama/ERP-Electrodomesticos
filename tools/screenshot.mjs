import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const API = "http://localhost:4000/api";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* next */
    }
  }
  return await chromium.launch({ headless: true });
}

const pages = [
  { name: "01-dashboard", path: "/", wait: "text=Modulos" },
  { name: "02-modulo-stock", path: "/modulo/STK", wait: "text=Programas del modulo" },
  { name: "03-articulos", path: "/stock/articulos", wait: "text=Administrar articulos" },
  { name: "04-consulta-stock", path: "/stock/consulta-stock", wait: "text=Stock por deposito" },
  { name: "05-ajustes", path: "/stock/ajustes", wait: "text=Ajuste manual" },
  { name: "06-compra-nueva", path: "/compras/nueva", wait: "text=Cargar compra" },
  { name: "07-compras-listado", path: "/compras/listado", wait: "text=Listado de compras" },
  { name: "08-personas", path: "/finanzas/personas", wait: "text=Administrar personas" },
];

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });

// Login via API y guardado del token en localStorage (robusto, sin depender del form)
const resp = await ctx.request.post(`${API}/auth/login`, {
  data: { username: "admin", password: "admin123" },
});
const { token, user } = await resp.json();
const companyId = user.companies[0]?.id ?? 1;
await ctx.addInitScript(
  ([t, c]) => {
    localStorage.setItem("erp_token", t);
    localStorage.setItem("erp_company", String(c));
  },
  [token, companyId]
);
console.log("login API OK, token", token.slice(0, 16) + "...");

const page = await ctx.newPage();
page.setDefaultTimeout(60000);

// Captura del login (sin sesion) en un contexto aparte
const anon = await browser.newContext({ viewport: { width: 1366, height: 850 } });
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await anonPage.waitForSelector('button:has-text("Ingresar")');
await anonPage.waitForTimeout(800);
await anonPage.screenshot({ path: `${OUT}/00-login.png` });
await anon.close();
console.log("ok 00-login");

for (const p of pages) {
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded" });
    if (p.wait) await page.waitForSelector(p.wait, { timeout: 60000 });
    await page.waitForTimeout(1500); // datos del API
    await page.screenshot({ path: `${OUT}/${p.name}.png` });
    console.log("ok", p.name);
  } catch (e) {
    await page.screenshot({ path: `${OUT}/${p.name}.png` }).catch(() => {});
    console.log("FALLO", p.name, e.message.split("\n")[0]);
  }
}

// Modal de nuevo articulo
try {
  await page.goto(`${BASE}/stock/articulos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Nuevo articulo")', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.click('button:has-text("Nuevo articulo")');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-articulo-modal.png` });
  console.log("ok 09-modal");
} catch (e) {
  console.log("FALLO modal", e.message.split("\n")[0]);
}

await browser.close();
console.log("LISTO");
