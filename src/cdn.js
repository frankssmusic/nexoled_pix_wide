/* ==========================================================
   CARGA DE LIBRERÍAS EXTERNAS (JSZip / SheetJS)
   Se cargan desde CDN sólo cuando se usan, mediante <script>.
   No se usa import() dinámico porque CRA no lo soporta en build.
   ========================================================== */

const cache = {};

function cargarScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (cache[src]) return cache[src];

  cache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      if (window[globalName]) resolve(window[globalName]);
      else reject(new Error(`No se cargó ${globalName}`));
    };
    s.onerror = () => reject(new Error(`No se pudo descargar ${globalName}`));
    document.head.appendChild(s);
  });

  return cache[src];
}

export const cargarJSZip = () =>
  cargarScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip");

export const cargarXLSX = () =>
  cargarScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "XLSX");
