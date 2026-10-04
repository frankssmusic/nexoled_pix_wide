// scripts/convertir-portadas.js
// Convierte las portadas originales a WebP livianas para la grilla.
// Lee de:     portadas_originales/
// Escribe en: public/portadas/  (mismo nombre, extension .webp)

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ORIGEN = path.join(__dirname, "..", "portadas_originales");
const DESTINO = path.join(__dirname, "..", "public", "portadas");
const EXTENSIONES = [".png", ".jpg", ".jpeg", ".webp"];
const ANCHO = 720;
const CALIDAD = 78;

async function convertir() {
  if (!fs.existsSync(ORIGEN)) {
    console.log("No existe la carpeta portadas_originales");
    process.exit(1);
  }
  fs.mkdirSync(DESTINO, { recursive: true });

  const archivos = fs
    .readdirSync(ORIGEN)
    .filter((f) => EXTENSIONES.includes(path.extname(f).toLowerCase()));

  for (const archivo of archivos) {
    const nombre = path.basename(archivo, path.extname(archivo)).toLowerCase();
    const salida = path.join(DESTINO, nombre + ".webp");
    await sharp(path.join(ORIGEN, archivo))
      .resize({ width: ANCHO, withoutEnlargement: true })
      .webp({ quality: CALIDAD })
      .toFile(salida);
    const kb = Math.round(fs.statSync(salida).size / 1024);
    console.log("OK " + nombre + ".webp (" + kb + " KB)");
  }
  console.log("Listo: " + archivos.length + " portadas convertidas");
}

convertir().catch((error) => {
  console.error("Error: " + error.message);
  process.exit(1);
});