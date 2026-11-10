export const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();

/** Copia texto; si el visor lo impide, deja el texto seleccionado para copiar a mano. */
export async function copyText(text, textarea, statusEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) statusEl.textContent = 'Copiado al portapapeles.';
  } catch {
    if (textarea) { textarea.focus(); textarea.select(); }
    if (statusEl) statusEl.textContent = 'No se pudo copiar automáticamente: el texto quedó seleccionado, copialo a mano.';
  }
}

export function downloadText(name, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
