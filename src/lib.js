/* ==========================================================
   UTILIDADES COMPARTIDAS — NexoPix Wide
   ========================================================== */

export const ADMIN_PASSWORD = "admin9999";

/* ----------------------------------------------------------
   RUTEO POR SLUG
   /                        -> aterrizaje (sin evento)
   /subir/<slug>            -> asistente del evento
   /operador/<slug>         -> panel operador del evento
   /pantalla/<slug>         -> slideshow del evento
   /admin                   -> panel global (todos los eventos)
   ---------------------------------------------------------- */
export function getRoute() {
  const parts = window.location.pathname
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .split("/")
    .filter(Boolean);

  const [head, slug] = parts;

  if (head === "admin") return { view: "admin", slug: null };
  if (head === "subir") return { view: "asistente", slug: slug || null };
  if (head === "operador") return { view: "operador", slug: slug || null };
  if (head === "pantalla") return { view: "pantalla", slug: slug || null };

  return { view: "inicio", slug: null };
}

/* ----------------------------------------------------------
   SLUG: "Boda Paola y Javier" -> "boda-paola-y-javier"
   ---------------------------------------------------------- */
export function generarSlug(nombre) {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")      // solo letras, números, espacios, guiones
    .trim()
    .replace(/\s+/g, "-")              // espacios -> guiones
    .replace(/-+/g, "-")               // guiones repetidos -> uno
    .slice(0, 48) || "evento";
}

/* Sufijo corto para desempatar slugs repetidos */
export function sufijoCorto() {
  return Math.random().toString(36).slice(2, 6);
}

/* ----------------------------------------------------------
   URLS DEL EVENTO
   ---------------------------------------------------------- */
export function urlsDe(slug) {
  const base = window.location.origin;
  return {
    subir:    `${base}/subir/${slug}`,
    operador: `${base}/operador/${slug}`,
    pantalla: `${base}/pantalla/${slug}`,
  };
}

/* ----------------------------------------------------------
   COMPRESIÓN DE IMAGEN (idéntica a NexoPix normal)
   ---------------------------------------------------------- */
export function comprimirImagen(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1080;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    };
    img.src = url;
  });
}

/* ----------------------------------------------------------
   VALIDACIÓN DE RUT CHILENO (idéntica a NexoPix normal)
   ---------------------------------------------------------- */
export function validarRut(rut) {
  const clean = rut.replace(/\./g, "").trim();
  if (!/^\d{7,8}-[\dkK]$/.test(clean)) {
    return { ok: false, msg: "Formato inválido. Usa: 12345678-9 (sin puntos, con guión)" };
  }
  const [cuerpo, dv] = clean.split("-");
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const dvEsperado = 11 - (suma % 11);
  const dvCalc = dvEsperado === 11 ? "0" : dvEsperado === 10 ? "K" : String(dvEsperado);
  if (dv.toUpperCase() !== dvCalc) {
    return { ok: false, msg: "Dígito verificador incorrecto. Revisa tu RUT" };
  }
  return { ok: true, clean };
}

/* ----------------------------------------------------------
   TÉRMINOS DEL OPERADOR
   ---------------------------------------------------------- */
export const OP_TERMS = `TÉRMINOS Y CONDICIONES PARA OPERADORES — NEXOPIX

Al registrarse como operador de un evento NexoPix, usted declara conocer y aceptar las siguientes condiciones:

1. RESPONSABILIDAD DE MODERACIÓN
Como operador, usted es el responsable directo de aprobar o rechazar las fotografías subidas por los asistentes al evento. Debe rechazar toda imagen que contenga contenido sexual, explícito o inapropiado; imágenes que involucren a menores de edad en contextos inadecuados; contenido que atente contra la moral, honra o dignidad de cualquier persona; imágenes de figuras públicas sin su consentimiento; o cualquier contenido que pueda constituir delito según la legislación chilena.

2. REGISTRO DE IDENTIDAD
Su nombre y RUT quedan registrados como respaldo legal del evento. Esta información podrá ser utilizada como antecedente en caso de que se expongan fotografías constituyentes de delito o que generen perjuicio a terceros.

3. DESCARGA DE FOTOGRAFÍAS
Si el administrador habilita la descarga, usted dispone de un plazo máximo de 24 horas desde la finalización del evento para descargar las fotos. Se recomienda realizar la descarga antes del cierre del evento. NexoPix no garantiza la disponibilidad posterior.

4. USO DE IMÁGENES
NexoPix y NexoLED podrán utilizar las fotografías aprobadas durante su operación con fines promocionales, previo acuerdo con el cliente contratante.

5. ACCIONES LEGALES
NexoPix se reserva el derecho de iniciar acciones legales contra el operador registrado si se demuestra negligencia en la moderación de contenido que resulte en la exhibición de material ilegal o perjudicial, pudiendo entregar los antecedentes a las autoridades competentes.

6. LEGISLACIÓN APLICABLE
Estos términos se rigen por las leyes de la República de Chile, bajo la jurisdicción de los tribunales ordinarios de Punta Arenas.

Última actualización: Julio 2026`;
