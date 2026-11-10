// Pruebas de interfaz con un navegador real (Chrome sin cabeza, vía Playwright).
// Uso: npm run build && node tests/ui/ui.test.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const url = process.env.APP_URL || pathToFileURL('dist/index.html').href;
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
const results = [];
const jsErrors = [];
let current = '';
async function step(name, fn) {
  current = name;
  try { await fn(); results.push({ name, ok: true }); console.log(`ok   - ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`FAIL - ${name}\n       ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function watch(page, label) {
  page.on('pageerror', (e) => jsErrors.push(`[${label}] ${current}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) jsErrors.push(`[${label}] ${current}: ${m.text()}`); });
}
const screenOf = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.getElementById('plan');
  const p = new DOMPoint(x, FieldLab.S.cfg.env.room.h - y).matrixTransform(svg.getScreenCTM());
  return { x: p.x, y: p.y };
}, [x, y]);
const state = (page, expr) => page.evaluate(`(() => { const S = FieldLab.S; return ${expr}; })()`);
const scene = async (page, name) => { await page.click('#tabbtn-model'); await page.click(`[data-scene="${name}"]`); await page.click('#tabbtn-lab'); };
const noOverflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
async function mouseDrag(page, from, to) {
  const a = await screenOf(page, from.x, from.y), b = await screenOf(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6);
  await page.mouse.up();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

// ───────────── Escritorio ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage(); watch(page, 'escritorio');
  await page.goto(url);

  await step('escritorio: la aplicación carga con una escena en funcionamiento', async () => {
    await page.waitForSelector('#positioning table');
    assert(await page.locator('#signals tbody tr').count() === 4, 'se esperaban 4 AP en la tabla de señales');
    assert(await page.locator('#positioning .chip.ok').count() === 2, 'ambos métodos deberían estar disponibles');
    assert(await page.locator('#plan polygon').count() >= 4, 'el plano debería dibujar los AP');
  });

  await step('escritorio: arrastrar el receptor actualiza posición, RSSI y estimaciones', async () => {
    const before = await state(page, '({ rx: { ...S.rx }, rssi: S.live.signals.map((s) => s.rssi), a: [S.live.a.x, S.live.a.y] })');
    const table0 = await page.locator('#signals tbody').innerText();
    await mouseDrag(page, before.rx, { x: 2.5, y: 6 });
    const after = await state(page, '({ rx: { ...S.rx }, rssi: S.live.signals.map((s) => s.rssi), a: [S.live.a.x, S.live.a.y] })');
    assert(Math.abs(after.rx.x - 2.5) < 0.11 && Math.abs(after.rx.y - 6) < 0.11, `receptor en (${after.rx.x}, ${after.rx.y})`);
    assert(after.rssi.every((v, i) => v !== before.rssi[i]), 'todos los RSSI deberían cambiar');
    assert(after.a[0] !== before.a[0], 'la estimación A debería cambiar');
    assert((await page.locator('#signals tbody').innerText()) !== table0, 'la tabla de señales debería refrescarse');
    assert((await page.locator('#positioning').innerText()).includes('(2.50, 6.00)'), 'el panel debería mostrar la nueva posición real');
  });

  await step('escritorio: arrastrar un AP lo mueve y lo selecciona', async () => {
    const ap = await state(page, '({ ...S.cfg.env.aps[1] })');
    await mouseDrag(page, ap, { x: 9, y: 4 });
    const now = await state(page, '({ ap: { ...S.cfg.env.aps[1] }, sel: S.selected })');
    assert(Math.abs(now.ap.x - 9) < 0.11 && Math.abs(now.ap.y - 4) < 0.11, `AP en (${now.ap.x}, ${now.ap.y})`);
    assert(now.sel?.id === ap.id, 'el AP debería quedar seleccionado');
    assert((await page.locator('#inspector').innerText()).includes(ap.id), 'el inspector debería mostrar el AP');
  });

  await step('escritorio: agregar un AP, editar su ΔP y eliminarlo', async () => {
    await page.click('[data-tool="ap"]');
    const p = await screenOf(page, 6, 2);
    await page.mouse.click(p.x, p.y);
    assert(await state(page, 'S.cfg.env.aps.length') === 5, 'debería haber 5 AP');
    assert(await page.locator('#signals tbody tr').count() === 5, 'la tabla debería tener 5 filas');
    const rssi0 = await state(page, 'S.live.signals[4].mean');
    await page.fill('#insp-offset', '-6'); await page.press('#insp-offset', 'Enter');
    const rssi1 = await state(page, 'S.live.signals[4].mean');
    assert(Math.abs(rssi0 - 6 - rssi1) < 1e-9, 'ΔP = −6 dB debería bajar el RSSI medio exactamente 6 dB');
    await page.click('#inspector [data-act="del"]');
    assert(await state(page, 'S.cfg.env.aps.length') === 4, 'debería volver a 4 AP');
  });

  await step('escritorio: dibujar una pared reduce el RSSI del AP que queda detrás; su atenuación es editable', async () => {
    await scene(page, 'live');
    await state(page, '(S.cfg.env.walls = [], S.cfg.env.model.sigma = 0, 0)');
    await page.click('#btnMeasure');
    const before = await state(page, 'S.live.signals.find((s) => s.id === "AP2").rssi');
    await page.click('[data-tool="wall"]');
    await mouseDrag(page, { x: 9, y: 0.5 }, { x: 9, y: 7.5 });
    assert(await state(page, 'S.cfg.env.walls.length') === 1, 'debería existir una pared');
    const mid = await state(page, 'S.live.signals.find((s) => s.id === "AP2")');
    assert(Math.abs(before - 6 - mid.rssi) < 1e-9 && mid.wallLoss === 6, `RSSI ${before} → ${mid.rssi}`);
    await page.fill('#insp-att', '10'); await page.press('#insp-att', 'Enter');
    const after = await state(page, 'S.live.signals.find((s) => s.id === "AP2").rssi');
    assert(Math.abs(before - 10 - after) < 1e-9, 'la atenuación editada debería aplicarse');
  });

  await step('escritorio: «Nueva medición» cambia las lecturas con ruido y no mueve el receptor', async () => {
    await scene(page, 'live');
    const a = await state(page, '({ r: S.live.signals.map((s) => s.rssi), rx: { ...S.rx } })');
    await page.click('#btnMeasure');
    const b = await state(page, '({ r: S.live.signals.map((s) => s.rssi), rx: { ...S.rx } })');
    assert(a.r.every((v, i) => v !== b.r[i]), 'las lecturas deberían cambiar');
    assert(a.rx.x === b.rx.x && a.rx.y === b.rx.y, 'el receptor no debería moverse');
  });

  await step('escritorio: zoom con rueda y botones; «Ajustar» restablece la vista', async () => {
    const v0 = await state(page, 'S.view.w');
    const p = await screenOf(page, 6, 4);
    await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, -300);
    const v1 = await state(page, 'S.view.w');
    assert(v1 < v0, 'la rueda debería acercar');
    await page.click('#zoomIn');
    assert(await state(page, 'S.view.w') < v1, '+ debería acercar');
    await page.click('#zoomFit');
    assert(Math.abs(await state(page, 'S.view.w') - v0) < 1e-9, 'Ajustar debería restablecer');
  });

  await step('escritorio: el teclado mueve el receptor', async () => {
    const x0 = await state(page, 'S.rx.x');
    await state(page, '(S.selected = null, 0)');
    await page.focus('#plan'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert(Math.abs(await state(page, 'S.rx.x') - (x0 + 0.2)) < 1e-9, 'dos pasos de 0,1 m');
  });

  await step('escritorio: geometría degenerada → el método A informa el fallo y no dibuja coordenadas', async () => {
    await page.click('#tabbtn-model'); await page.click('[data-scene="collinear"]'); await page.click('#tabbtn-lab');
    const a = await state(page, '({ ok: S.live.a.ok, x: S.live.a.x, status: S.live.a.status })');
    assert(a.ok === false && a.x === null && a.status === 'geometria_degenerada', JSON.stringify(a));
    const txt = await page.locator('#positioning').innerText();
    assert(/sin estimación/i.test(txt) && /colineales/.test(txt), 'el panel debería explicar el fallo');
    assert(await state(page, 'S.live.b.ok') === true, 'el método B sigue disponible');
  });

  await step('escritorio: menos de 3 AP → fallo explícito por AP insuficientes', async () => {
    await state(page, '(S.cfg.env.aps.pop(), 0)'); await page.click('#btnMeasure');
    assert(/al menos 3 AP/.test(await page.locator('#positioning').innerText()), 'debería pedir al menos 3 AP');
  });

  await step('escritorio: desvincular la calibración cambia la estimación A y no la B', async () => {
    await page.click('#tabbtn-model'); await page.click('[data-scene="six"]');
    const b0 = await state(page, '[S.live.a.x, S.live.b.x]');
    await page.uncheck('[data-bind="linked"]');
    await page.fill('[data-bind="cfg.assumed.n"]', '3.5'); await page.press('[data-bind="cfg.assumed.n"]', 'Enter');
    const b1 = await state(page, '[S.live.a.x, S.live.b.x, S.live.cfg.assumed.n]');
    assert(b1[2] === 3.5 && b1[0] !== b0[0] && b1[1] === b0[1], JSON.stringify([b0, b1]));
  });

  await step('escritorio: sin recalibración automática, mover un AP marca el mapa como desactualizado', async () => {
    await page.uncheck('[data-bind="autoCal"]');
    await state(page, '(S.cfg.env.aps[2].x = 3, 0)'); await page.click('#btnRecal');
    assert(await state(page, 'S.live.stale') === false, 'recién calibrado');
    await page.click('#tabbtn-lab');
    const ap = await state(page, '({ ...S.cfg.env.aps[2] })');
    await mouseDrag(page, ap, { x: 8, y: 5 });
    assert(await state(page, 'S.live.stale') === true, 'debería quedar desactualizado');
    assert(/desactualizado/.test(await page.locator('#positioning').innerText()), 'debería avisar');
    await page.click('#positioning [data-act="recal"]');
    assert(await state(page, 'S.live.stale') === false, 'recalibrado');
  });

  await step('escritorio: mapas de calor (RSSI y error) se dibujan', async () => {
    await page.selectOption('#overlay', 'rssi');
    assert(await page.locator('#plan g[opacity] rect').count() > 100, 'celdas de RSSI');
    await page.selectOption('#overlay', 'errA');
    await page.waitForFunction(() => FieldLab.S.heat !== null, null, { timeout: 5000 });
    assert(await page.locator('#plan g[opacity] rect').count() > 100, 'celdas de error');
    if (shots) await page.screenshot({ path: `${shots}/desktop-heat.png` });
    await page.selectOption('#overlay', 'none');
  });

  await step('escritorio: Experimento 1 se ejecuta, muestra métricas y gráficos, y se repite con la misma huella', async () => {
    await page.click('#tabbtn-exp');
    await page.click('#expRun');
    await page.waitForSelector('#expResults table');
    assert(await page.locator('#expResults tbody tr').count() === 6, '3 condiciones × 2 métodos');
    assert(await page.locator('#expResults svg.chart').count() === 3, 'tres gráficos');
    const d1 = await page.locator('#expResults .runbar code').innerText();
    await page.click('#expRun');
    await page.waitForSelector('#expResults .chip.ok');
    const d2 = await page.locator('#expResults .runbar code').innerText();
    assert(d1 === d2 && /idéntica/i.test(await page.locator('#expResults .runbar').innerText()), `${d1} vs ${d2}`);
    if (shots) await page.screenshot({ path: `${shots}/desktop-exp.png`, fullPage: true });
    await page.fill('#expSeed', '99'); await page.click('#expRun');
    await page.waitForFunction((d) => document.querySelector('#expResults .runbar code')?.innerText !== d, d1);
  });

  await step('escritorio: los cinco experimentos predefinidos y uno personalizado corren desde la interfaz', async () => {
    for (const id of ['exp2', 'exp3', 'exp4', 'exp5']) {
      await page.selectOption('#expPreset', id);
      await page.click('#expRun');
      await page.waitForSelector('#expResults table');
      assert(await page.locator('#expResults .note.bad').count() === 0, `${id} no debería fallar`);
    }
    assert(await page.locator('#expResults svg.chart rect').count() > 8, 'exp5 usa barras');
    await page.selectOption('#expPreset', 'custom');
    await page.selectOption('#expVar', 'k'); await page.fill('#expValues', '1, 3, 7'); await page.click('#expRun');
    await page.waitForSelector('#expResults table');
    assert(await page.locator('#expResults tbody tr').count() === 6, 'personalizado: 3 condiciones');
    await page.click('[data-exp="csv"]');
    assert((await page.inputValue('#expExportText')).startsWith('condition,sample_id'), 'CSV de resultados');
    await page.fill('#expValues', '1, x'); await page.click('#expRun');
    assert(/números/.test(await page.locator('#expResults .note.bad').innerText()), 'valores inválidos se rechazan');
  });

  await step('escritorio: CSV de ejemplo se importa y analiza; las muestras sin posición no tienen error', async () => {
    await page.click('#tabbtn-data'); await page.click('#dataExample');
    const txt = await page.locator('#dataResult').innerText();
    assert(/Archivo válido/.test(txt) && /24 \/ 8 \/ 4/.test(txt) && /sintético/.test(txt), 'resumen de importación');
    assert(await page.locator('#dataResult table').count() >= 2, 'tablas de análisis');
    assert(/no existe posición real/.test(txt), 'aviso de muestras sin posición');
  });

  await step('escritorio: CSV inválido se rechaza con mensajes; sin ground truth no hay métricas', async () => {
    await page.fill('#dataText', 'experiment_id,sample_id,ap_id,rssi_dbm,x_m,y_m,role\ne1,s1,AP1,55,1,1,evaluation\ne1,s2,AP1,-60,,,calibration\n');
    await page.click('#dataImport');
    const bad = await page.locator('#dataResult').innerText();
    assert(/rechazado/.test(bad) && /positivo/.test(bad) && /exige posición conocida/.test(bad), bad);
    await page.fill('#dataText', 'experiment_id,sample_id,ap_id,rssi_dbm\ncampo,m1,AP1,-55\ncampo,m1,AP2,-63\ncampo,m1,AP3,-70\n');
    await page.click('#dataImport');
    const un = await page.locator('#dataResult').innerText();
    assert(/no se calcula ninguna métrica/.test(un) && /origen no declarado/.test(un), un);
    await page.click('#dataExportBtn');
    assert((await page.inputValue('#dataExportText')).split('\n').length > 100, 'exportación de la escena');
  });

  await step('escritorio: los ejercicios cargan su escena en el laboratorio', async () => {
    await page.click('#tabbtn-learn');
    assert(await page.locator('#tab-learn details.exercise').count() === 3, 'tres ejercicios');
    await page.locator('#tab-learn details.exercise').nth(1).locator('summary').click();
    await page.click('[data-ex="1"]');
    const s = await state(page, '({ tab: S.tab, sigma: S.cfg.env.model.sigma, att: S.cfg.env.walls[0].att, errA: S.live.errA })');
    assert(s.tab === 'lab' && s.sigma === 0 && s.att === 8 && s.errA > 0.5, JSON.stringify(s));
    await page.fill('#insp-att', '0'); await page.press('#insp-att', 'Enter');
    assert(await state(page, 'S.live.errA') < 1e-6, 'sin pared ni ruido, A debería ser exacto');
  });

  if (shots) { await scene(page, 'live'); await page.screenshot({ path: `${shots}/desktop-lab.png` }); }
  await ctx.close();
}

// ───────────── Móvil (táctil, 390 × 844) ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage(); watch(page, 'móvil');
  await page.goto(url);
  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (from, to) => {
    const a = await screenOf(page, from.x, from.y), b = await screenOf(page, to.x, to.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200); // un toque inmediatamente después de soltar se funde con el gesto anterior
  };

  await step('móvil: carga sin desbordamiento horizontal', async () => {
    await page.waitForSelector('#positioning table');
    assert(await noOverflow(page), 'la página no debería desplazarse en horizontal');
    if (shots) { await page.screenshot({ path: `${shots}/mobile-lab.png` }); await page.evaluate(() => window.scrollTo(0, 700)); await page.screenshot({ path: `${shots}/mobile-lab2.png` }); await page.evaluate(() => window.scrollTo(0, 0)); }
  });

  await step('móvil: arrastrar el receptor con el dedo actualiza las mediciones', async () => {
    const rx = await state(page, '({ ...S.rx })');
    const r0 = await state(page, 'S.live.signals.map((s) => s.rssi)');
    await touchDrag(rx, { x: 3, y: 5 });
    const now = await state(page, '({ rx: { ...S.rx }, r: S.live.signals.map((s) => s.rssi) })');
    assert(Math.abs(now.rx.x - 3) < 0.15 && Math.abs(now.rx.y - 5) < 0.15, `receptor en (${now.rx.x}, ${now.rx.y})`);
    assert(now.r.every((v, i) => v !== r0[i]), 'los RSSI deberían cambiar');
  });

  await step('móvil: arrastrar un AP con el dedo y agregar otro con un toque', async () => {
    const ap = await state(page, '({ ...S.cfg.env.aps[2] })');
    await touchDrag(ap, { x: 8, y: 6 });
    const now = await state(page, '({ ...S.cfg.env.aps[2] })');
    assert(Math.abs(now.x - 8) < 0.15 && Math.abs(now.y - 6) < 0.15, `AP en (${now.x}, ${now.y})`);
    await page.tap('[data-tool="ap"]');
    const p = await screenOf(page, 10, 4);
    await page.touchscreen.tap(p.x, p.y);
    assert(await state(page, 'S.cfg.env.aps.length') === 5, 'debería haber 5 AP');
    assert(await noOverflow(page), 'sin desbordamiento con el inspector abierto');
  });

  await step('móvil: pellizco para acercar', async () => {
    const w0 = await state(page, 'S.view.w');
    const c = await screenOf(page, 6, 4);
    const pts = (d) => [{ x: c.x - d, y: c.y, id: 0 }, { x: c.x + d, y: c.y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (const d of [45, 60, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await state(page, 'S.view.w') < w0 * 0.6, 'el pellizco debería acercar');
    await page.tap('#zoomFit');
  });

  await step('móvil: todas las pestañas funcionan y ninguna desborda', async () => {
    for (const t of ['model', 'exp', 'data', 'learn', 'lab']) {
      await page.tap(`#tabbtn-${t}`);
      assert(await page.locator(`#tab-${t}`).isVisible(), `pestaña ${t} visible`);
      assert(await page.locator('.tabpanel:visible').count() === 1, 'solo una pestaña visible a la vez');
      assert(await noOverflow(page), `desbordamiento en ${t}`);
    }
  });

  await step('móvil: un experimento se ejecuta y sus gráficos caben en pantalla', async () => {
    await page.tap('#tabbtn-exp'); await page.selectOption('#expPreset', 'exp3'); await page.tap('#expRun');
    await page.waitForSelector('#expResults svg.chart');
    const widths = await page.evaluate(() => [...document.querySelectorAll('#expResults svg.chart')].map((s) => s.getBoundingClientRect().right));
    assert(widths.every((r) => r <= 390 + 1), `gráficos fuera de pantalla: ${widths}`);
    assert(await noOverflow(page), 'sin desbordamiento con resultados');
    if (shots) { await page.evaluate(() => document.querySelector('#expResults').scrollIntoView()); await page.screenshot({ path: `${shots}/mobile-exp.png` }); }
  });

  await step('móvil: importar el ejemplo y abrir un ejercicio', async () => {
    await page.tap('#tabbtn-data'); await page.tap('#dataExample');
    assert(/Archivo válido/.test(await page.locator('#dataResult').innerText()), 'importación');
    assert(await noOverflow(page), 'sin desbordamiento con el análisis');
    await page.tap('#tabbtn-learn'); await page.tap('[data-ex="0"]');
    assert(await state(page, 'S.tab === "lab" && S.cfg.env.model.sigma === 4'), 'ejercicio 1 cargado');
  });
  await ctx.close();
}

await browser.close();
await step('ningún escenario produjo excepciones de JavaScript ni errores de consola', async () => {
  assert(jsErrors.length === 0, jsErrors.join('\n       '));
});
const failed = results.filter((r) => !r.ok).length;
console.log(`\n# pruebas de interfaz: ${results.length} · correctas: ${results.length - failed} · fallidas: ${failed}`);
process.exit(failed ? 1 : 0);
