// Empaqueta la aplicación en un único archivo HTML (dist/index.html) que funciona con doble clic,
// y en un fragmento equivalente para publicarlo como artefacto. La app también funciona SIN
// compilar: index.html en la raíz carga los módulos ES directamente desde un servidor estático.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({ entryPoints: ['src/ui/main.js'], bundle: true, format: 'iife', minify: false, write: false, target: 'es2020', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('styles.css', 'utf8');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@600&display=swap">';
const body = `<div id="root"><noscript>FieldLab RF necesita JavaScript.</noscript></div>\n<script>\n${js}</script>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>FieldLab RF</title>\n${fonts}\n<style>\n${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
writeFileSync('dist/fieldlab-rf.artifact.html', `<title>FieldLab RF</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}</style>\n${body}\n`);
console.log('dist/index.html', (js.length / 1024).toFixed(0) + ' kB de JS');
