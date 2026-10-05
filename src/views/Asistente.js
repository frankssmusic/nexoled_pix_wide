import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase";
import { comprimirImagen } from "../lib";
import Icon from "../components/Icons";
import { Vacio, Logo } from "../components/UI";
import MiniJuego from "../components/MiniJuego";

// Bloque DIVERTIDOS: filtros tipo Snapchat, solo disponibles en eventos premium.
// En eventos Base se muestran con candado. El servidor (api/generarFoto.js)
// también los bloquea si el evento no es premium.
const MODOS_DIVERTIDOS = [
  { id: "ojos_saltones", nombre: "Ojos Saltones" },
  { id: "maquillaje_tia", nombre: "El Gran Maquillaje" },
  { id: "chimuela_cachetona", nombre: "Chimuela Cachetona" },
  { id: "cambio_genero", nombre: "Mi otr@ yo" },
  { id: "cara_pescado", nombre: "Cara de Pescado" },
  { id: "cara_bebe", nombre: "Cara de Bebé" },
  { id: "cabezones", nombre: "Cabezones" },
  { id: "cara_aplastada", nombre: "Gruñón" },
];

// Catálogo en filas deslizables. El id interno de cada modo no cambia;
// la portada se busca en public/portadas/<id>.webp
const FILAS_CATALOGO = [
  { id: "divertidos", titulo: "Divertidos", premium: true, modos: MODOS_DIVERTIDOS },
  {
    id: "cine", titulo: "Cine y series", modos: [
      { id: "game_of_thrones", nombre: "Juego de Tronos" },
      { id: "peaky_style", nombre: "Peaky Style" },
      { id: "breaking_bad", nombre: "Breaking Bad" },
      { id: "harry_magic", nombre: "Harry Magic" },
      { id: "jurassic_park", nombre: "Jurassic Park" },
      { id: "super_hero", nombre: "Super Hero" },
    ],
  },
  {
    id: "epocas", titulo: "Épocas", modos: [
      { id: "old_school", nombre: "Old School" },
      { id: "disco_70s", nombre: "70s Disco" },
      { id: "viejitos", nombre: "Viejitos" },
    ],
  },
  {
    id: "animados", titulo: "Animados y fantasía", modos: [
      { id: "simpsons", nombre: "Simpsons" },
      { id: "barbie", nombre: "El Mundo Barbie" },
      { id: "princesa_disney", nombre: "Príncipes y Princesas" },
    ],
  },
  {
    id: "futbol", titulo: "Fútbol Fan", modos: [
      { id: "futbol_fan_1", nombre: "Noruega" },
      { id: "futbol_fan_2", nombre: "Francia" },
      { id: "futbol_fan_3", nombre: "Portugal" },
      { id: "futbol_fan_4", nombre: "Argentina" },
    ],
  },
];

// Filas que ya hicieron el empujoncito inicial (solo la primera vez por visita).
const filasEmpujadas = new Set();

// Marquesina del inicio: velocidad (píxeles por segundo), tamaño de cada
// portada y espacio que ocupa cada una con su separación.
const VELOCIDAD_CINTA = 26;
const ANCHO_TARJETA_CINTA = 84;
const ALTO_TARJETA_CINTA = 112;
const PASO_CINTA = 92;
// Cada cinta repite sus portadas hasta cubrir al menos este ancho,
// así nunca queda un hueco en pantallas anchas.
const ANCHO_MINIMO_CINTA = 900;

// Modo Especial: el prompt y las referencias los define el admin por evento.
const MODO_ESPECIAL = "especial";

// Mensajes que van rotando mientras la IA genera la foto.
const MENSAJES_GENERANDO = [
  "Aplicando el estilo a tu foto",
  "Ajustando los detalles",
  "Cuidando que te reconozcas",
  "Dando los últimos toques",
  "Algunos modos tardan un poco más, ya casi",
];

// Errores donde reintentar no sirve (cuota, plan, IA apagada, evento cerrado).
const ERRORES_NO_REINTENTABLES = ["límite", "plan premium", "no está disponible", "cerró"];

const MENSAJE_ERROR_REINTENTABLE =
  "La IA no pudo generar esta foto esta vez. Toca \"Intentar de nuevo\" y se creará otra versión.";

// Espera máxima: 90 consultas x 3 segundos = 270 segundos.
const MAX_CONSULTAS = 90;

// Consejos del instructivo. Los emojis van como códigos para que no se
// corrompan al copiar el archivo. El color usa las variables de la paleta.
const CONSEJOS_INSTRUCTIVO = [
  { emoji: "\u{1F4A1}", fuerte: "Busca buena luz", resto: " para tu selfie", color: "var(--cyan-rgb)" },
  { emoji: "\u{1F465}", fuerte: "Sugerencia:", resto: " máximo 2 personas para un resultado óptimo", color: "var(--magenta-rgb)" },
  { emoji: "\u{23F3}", fuerte: "El modo HD puede tardar hasta 4 minutos,", resto: " ten paciencia", color: "var(--cyan-rgb)" },
  { emoji: "\u{1F4F1}", fuerte: "No cierres la app", resto: " ni bloquees el celular mientras se genera", color: "var(--magenta-rgb)" },
];
const EMOJI_BRILLO = "\u{2728}";
const EMOJI_CONTROL = "\u{1F3AE}";
const EMOJI_LUZ = "\u{1F4A1}";
const EMOJI_CANDADO = "\u{1F512}";

const esCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

export default function Asistente({ evento }) {
  const [step, setStep] = useState("subir");
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [autorizada, setAutorizada] = useState(true);
  const [aprobadaDirecto, setAprobadaDirecto] = useState(false);

  const [generandoIA, setGenerandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [errorReintentable, setErrorReintentable] = useState(true);
  const [iaLista, setIaLista] = useState(false);
  const [urlResultadoIA, setUrlResultadoIA] = useState(null);
  const [fotoIdIA, setFotoIdIA] = useState(null);
  const [intentosIA, setIntentosIA] = useState(0);
  const [confirmandoIA, setConfirmandoIA] = useState(false);
  const [iaConfirmada, setIaConfirmada] = useState(false);
  const [modoSeleccionado, setModoSeleccionado] = useState(null);
  const [descargandoFoto, setDescargandoFoto] = useState(false);
  const [reusarFoto, setReusarFoto] = useState(false);
  const [mostrarInstructivo, setMostrarInstructivo] = useState(false);
  const [jugando, setJugando] = useState(false);
  const MAX_INTENTOS_IA = 2;

  const fileRef = useRef();
  const fileRefCamara = useRef();
  const fileRefIAGaleria = useRef();
  const fileRefIACamara = useRef();
  const modoParaSubidaRef = useRef(null);
  const destinoFunfotoRef = useRef("catalogo"); // "catalogo" o el Especial
  const seguirGenerandoRef = useRef(true);
  const wakeLockRef = useRef(null);
  const audioCtxRef = useRef(null);

  const mensaje = evento?.mensaje_subida || "Subir foto";
  const esPremium = evento?.motor_ia === "premium";
  const iaActiva = evento?.ia_habilitada !== false;
  const claveInstructivo = evento ? `funfoto_instructivo_${evento.id}` : null;

  // Contenido IA del evento: grilla / especial_grilla / solo_especial.
  const contenido = evento?.contenido_ia || "grilla";
  const esSoloEspecial = contenido === "solo_especial";
  const conEspecialEnGrilla = contenido === "especial_grilla";
  const nombreEspecial = evento?.especial_label || "Especial de la noche";

  // Marquesina: solo los modos que el invitado puede usar en este evento.
  const modosMarquesina = FILAS_CATALOGO
    .filter((f) => !f.premium || esPremium)
    .flatMap((f) => f.modos);

  // Catálogo: en Premium, Divertidos va primero y destacado.
  // En Base, Divertidos va al final con candado (para mostrar el upgrade).
  const filasCatalogo = esPremium
    ? FILAS_CATALOGO
    : [...FILAS_CATALOGO.filter((f) => !f.premium), ...FILAS_CATALOGO.filter((f) => f.premium)];

  // Estado de la foto que se le informa al minijuego.
  let estadoFoto = "generando";
  if (!generandoIA && errorIA) estadoFoto = "error";
  else if (!generandoIA && iaLista) estadoFoto = "lista";

  const textoTrasConfirmar = aprobadaDirecto
    ? "¡Tu foto ya está en la pantalla del evento!"
    : "El operador la revisa y, si la aprueba, aparece en la pantalla.";

  /* ---------- Sonido y vibración al terminar ---------- */

  // El navegador solo deja sonar audio si se "despertó" con un toque del
  // usuario. Por eso se llama en cada botón que inicia una generación.
  const prepararAudio = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {
      // Sin audio no pasa nada.
    }
  };

  // Vibra (Android) y suena un ding-ding corto.
  const avisarFotoLista = () => {
    try {
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
    } catch {
      // iPhone no permite vibrar desde la web.
    }
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const ahora = ctx.currentTime;
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ahora + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      });
    } catch {
      // Sin audio no pasa nada.
    }
  };

  /* ---------- Pantalla encendida mientras genera ---------- */
  useEffect(() => {
    if (!generandoIA) return;
    let activo = true;

    const pedir = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Si el celular no lo permite, sigue normal.
      }
    };

    // Si la persona sale de la app y vuelve, se pide de nuevo.
    const alVolver = () => {
      if (activo && document.visibilityState === "visible") pedir();
    };

    pedir();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [generandoIA]);

  /* ---------- Entrada a FUNfoto IA ---------- */

  // Va al catálogo, o directo a la selfie si es el Especial.
  const entrarAFunfoto = () => {
    if (esSoloEspecial || destinoFunfotoRef.current === MODO_ESPECIAL) {
      modoParaSubidaRef.current = MODO_ESPECIAL;
      setReusarFoto(false);
      setStep("elegir-fuente-ia");
    } else {
      setStep("catalogo");
    }
  };

  // Instructivo: una vez por evento y celular.
  const abrirFunfoto = (destino = "catalogo") => {
    prepararAudio();
    destinoFunfotoRef.current = destino;
    let visto = false;
    try {
      visto = claveInstructivo ? localStorage.getItem(claveInstructivo) === "1" : false;
    } catch {
      visto = false;
    }
    if (visto) {
      entrarAFunfoto();
    } else {
      setMostrarInstructivo(true);
    }
  };

  const cerrarInstructivo = () => {
    try {
      if (claveInstructivo) localStorage.setItem(claveInstructivo, "1");
    } catch {
      // Si no se puede guardar, se mostrará de nuevo la próxima vez.
    }
    setMostrarInstructivo(false);
    entrarAFunfoto();
  };

  // Si se entró al Especial desde el inicio, vuelve al inicio; si no, al catálogo.
  const volverAlCatalogo = () => {
    if (esSoloEspecial || destinoFunfotoRef.current === MODO_ESPECIAL) {
      destinoFunfotoRef.current = "catalogo";
      setStep("subir");
      return;
    }
    setStep("catalogo");
  };

  // Descargar la foto generada.
  // Celular: menú nativo de compartir ("Guardar imagen", WhatsApp, etc.).
  // Computador: descarga directa del archivo.
  const descargarFoto = async () => {
    if (!urlResultadoIA) return;
    setDescargandoFoto(true);
    try {
      const resp = await fetch(urlResultadoIA);
      const blob = await resp.blob();
      const nombre = `funfoto_${Date.now()}.jpg`;
      const archivo = new File([blob], nombre, { type: blob.type || "image/jpeg" });

      if (esCelular() && navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: "Mi FUNfoto IA" });
      } else {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err?.name !== "AbortError") window.open(urlResultadoIA, "_blank", "noopener,noreferrer");
    } finally {
      setDescargandoFoto(false);
    }
  };

  const tomarArchivo = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Elige una foto.");
      return;
    }
    setError("");
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => { setPreview(e.target.result); setStep("revisar"); };
    reader.readAsDataURL(f);
  };

  const enviar = async () => {
    if (!file || !evento) return;
    setEnviando(true);
    setError("");
    try {
      const { data: evActual } = await supabase
        .from("eventos").select("evento_cerrado, auto_aprobar").eq("id", evento.id).single();
      if (evActual?.evento_cerrado) {
        setError("Este evento ya cerró. No se pueden subir más fotos.");
        setEnviando(false);
        return;
      }
      const directo = evActual?.auto_aprobar === true;
      const comprimida = await comprimirImagen(file);
      const filename = `${evento.id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("fotos").upload(filename, comprimida, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("fotos").getPublicUrl(filename);
      const { error: dbErr } = await supabase.from("fotos").insert({
        evento_id: evento.id,
        url: urlData.publicUrl,
        status: directo ? "approved" : "pending",
        autorizada,
      });
      if (dbErr) throw dbErr;
      setAprobadaDirecto(directo);
      setStep("enviada");
    } catch {
      setError("No se pudo enviar la foto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const generarConIA = async (fileParaIA, modo) => {
    const fileAUsar = fileParaIA || file;
    const modoAUsar = modo || modoSeleccionado;
    if (!fileAUsar || !evento || !modoAUsar) return;
    setGenerandoIA(true);
    setErrorIA("");
    setErrorReintentable(true);
    setIaLista(false);
    setUrlResultadoIA(null);
    seguirGenerandoRef.current = true;

    try {
      const comprimida = await comprimirImagen(fileAUsar);
      const filenameOriginal = `original_${evento.id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("fotos")
        .upload(filenameOriginal, comprimida, { contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: urlOriginal } = supabase.storage
        .from("fotos")
        .getPublicUrl(filenameOriginal);

      const respuestaCrear = await fetch("/api/generarFoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fotoUrl: urlOriginal.publicUrl,
          modo: modoAUsar,
          eventoId: evento.id,
        }),
      });

      const resultadoCrear = await respuestaCrear.json();

      if (!respuestaCrear.ok) {
        throw new Error(resultadoCrear?.error || "Error creando la generación con IA");
      }

      const { taskId, motorUsado } = resultadoCrear;

      for (let intento = 0; intento < MAX_CONSULTAS; intento++) {
        if (!seguirGenerandoRef.current) return;

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const respuestaConsulta = await fetch("/api/consultarFoto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, modo: modoAUsar, eventoId: evento.id, motorUsado }),
        });

        const resultadoConsulta = await respuestaConsulta.json();

        if (!respuestaConsulta.ok) {
          throw new Error(resultadoConsulta?.error || "Error generando la foto con IA");
        }

        if (resultadoConsulta.listo) {
          setUrlResultadoIA(resultadoConsulta?.foto?.url || null);
          setFotoIdIA(resultadoConsulta?.foto?.id || null);
          setIntentosIA((n) => n + 1);
          setIaLista(true);
          setGenerandoIA(false);
          avisarFotoLista();
          return;
        }
      }

      throw new Error("La generación demoró demasiado, intenta de nuevo");
    } catch (err) {
      if (!seguirGenerandoRef.current) return;
      const textoError = err?.message || "";
      const noReintentable = ERRORES_NO_REINTENTABLES.some((t) =>
        textoError.toLowerCase().includes(t)
      );
      setErrorReintentable(!noReintentable);
      setErrorIA(noReintentable ? textoError : MENSAJE_ERROR_REINTENTABLE);
      setGenerandoIA(false);
    }
  };

  // Desde "Otro modo": genera de inmediato con la misma foto.
  const iniciarConFotoGuardada = (modoId) => {
    modoParaSubidaRef.current = modoId;
    setModoSeleccionado(modoId);
    setIntentosIA(0);
    setIaConfirmada(false);
    setReusarFoto(false);
    setStep("ia");
    generarConIA(file, modoId);
  };

  const elegirModo = (modoId) => {
    prepararAudio();
    if (reusarFoto && file) {
      iniciarConFotoGuardada(modoId);
      return;
    }
    modoParaSubidaRef.current = modoId;
    setStep("elegir-fuente-ia");
  };

  const tomarArchivoIA = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen. Elige una foto.");
      return;
    }
    const modo = modoParaSubidaRef.current;
    if (!modo) return;

    setError("");
    setFile(f);
    setIntentosIA(0);
    setIaConfirmada(false);
    setModoSeleccionado(modo);
    setReusarFoto(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
      setStep("ia");
      generarConIA(f, modo);
    };
    reader.readAsDataURL(f);
  };

  // Contador para los puntitos y los mensajes rotativos.
  const [tickGenerando, setTickGenerando] = useState(0);
  useEffect(() => {
    if (!generandoIA) {
      setTickGenerando(0);
      return;
    }
    const t = setInterval(() => setTickGenerando((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [generandoIA]);
  const puntosGenerando = ".".repeat(tickGenerando % 4);
  const mensajeGenerando = MENSAJES_GENERANDO[Math.floor(tickGenerando / 10) % MENSAJES_GENERANDO.length];

  const volverAGenerar = () => {
    if (intentosIA >= MAX_INTENTOS_IA) return;
    prepararAudio();
    setIaLista(false);
    generarConIA(file, modoSeleccionado);
  };

  // Tras un error: misma foto, mismo modo, otra variante. No cuenta como intento.
  const reintentarTrasError = () => {
    if (!file || !modoSeleccionado) { reiniciar(); return; }
    prepararAudio();
    generarConIA(file, modoSeleccionado);
  };

  const limpiarResultado = () => {
    seguirGenerandoRef.current = false;
    setGenerandoIA(false); setErrorIA(""); setErrorReintentable(true); setIaLista(false);
    setUrlResultadoIA(null); setFotoIdIA(null);
    setConfirmandoIA(false); setIaConfirmada(false);
  };

  // Otra selfie: mismo modo, foto nueva.
  const otraSelfie = () => {
    const modoActual = modoSeleccionado || modoParaSubidaRef.current;
    limpiarResultado();
    setPreview(null); setFile(null); setError(""); setReusarFoto(false);
    if (!modoActual) { reiniciar(); return; }
    modoParaSubidaRef.current = modoActual;
    setStep("elegir-fuente-ia");
  };

  // Otro modo: misma foto, eliges otro modo (no existe en "Solo Especial").
  const otroModo = () => {
    if (!file || esSoloEspecial) { reiniciar(); return; }
    limpiarResultado();
    destinoFunfotoRef.current = "catalogo";
    setReusarFoto(true);
    setStep("catalogo");
  };

  // "Usar esta foto": el servidor decide si queda aprobada o en espera.
  const confirmarFotoIA = async () => {
    if (!fotoIdIA) return;
    setConfirmandoIA(true);
    try {
      const resp = await fetch("/api/confirmarFoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoId: fotoIdIA, eventoId: evento.id }),
      });
      let json = {};
      try {
        json = await resp.json();
      } catch {
        json = {};
      }
      if (!resp.ok) {
        throw new Error(json?.error || "No se pudo confirmar la foto. Intenta de nuevo.");
      }
      setAprobadaDirecto(json.directo === true);
      setIaConfirmada(true);
    } catch (err) {
      setErrorReintentable(false);
      setErrorIA(err?.message || "No se pudo confirmar la foto. Intenta de nuevo.");
    } finally {
      setConfirmandoIA(false);
    }
  };

  const reiniciar = () => {
    seguirGenerandoRef.current = false;
    setJugando(false);
    setStep("subir"); setPreview(null); setFile(null);
    setAutorizada(true); setError(""); setAprobadaDirecto(false); setReusarFoto(false);
    setGenerandoIA(false); setErrorIA(""); setErrorReintentable(true); setIaLista(false);
    setUrlResultadoIA(null); setFotoIdIA(null); setIntentosIA(0);
    setConfirmandoIA(false); setIaConfirmada(false); setModoSeleccionado(null);
    modoParaSubidaRef.current = null;
    destinoFunfotoRef.current = "catalogo";
  };

  if (!evento) {
    return (
      <Vacio
        titulo="Evento no encontrado"
        detalle="Revisa el enlace o escanea de nuevo el código QR del evento."
      />
    );
  }

  if (evento.evento_cerrado) {
    return (
      <Vacio
        icono="inbox"
        titulo="Este evento ya terminó"
        detalle={`"${evento.nombre}" cerró la recepción de fotos. Gracias por participar.`}
      />
    );
  }

  // Qué hace la flecha de la barra superior en cada pantalla.
  // Mientras se genera o tras enviar no hay flecha, para no cortar nada por accidente.
  const accionesVolver = {
    catalogo: reiniciar,
    "elegir-fuente-normal": () => setStep("subir"),
    "elegir-fuente-ia": volverAlCatalogo,
    revisar: reiniciar,
  };
  const accionVolver = accionesVolver[step] || null;

  const avisoMismaFoto = reusarFoto && preview ? (
    <div className="card card-tight" style={{
      display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
      border: "1px solid var(--cyan)",
    }}>
      <img src={preview} alt="Tu foto" style={{
        width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>Usarás la misma foto</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Elige un modo y se genera al tiro.</div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setReusarFoto(false)}>
        Usar otra
      </button>
    </div>
  ) : null;

  const consejoSelfie = (
    <div className="chip" style={{
      marginBottom: 18, padding: "10px 14px", fontSize: 12.5,
      lineHeight: 1.5, textAlign: "center", justifyContent: "center",
    }}>
      Consejo: usa una selfie con buena luz y tu rostro bien visible, así la IA te reconoce mejor.
    </div>
  );

  const estiloInputOculto = { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-start", padding: "20px 16px 40px",
    }}>
      <style>{`
        @keyframes nexoPulsoEspecial {
          0%, 100% { box-shadow: 0 0 22px rgba(var(--magenta-rgb),0.35), 0 0 0 1px rgba(var(--magenta-rgb),0.6); }
          50% { box-shadow: 0 0 46px rgba(var(--cyan-rgb),0.45), 0 0 0 1px rgba(var(--cyan-rgb),0.8); }
        }
        @keyframes nexoBarridoEspecial {
          0% { transform: translateX(-120%) skewX(-20deg); }
          60%, 100% { transform: translateX(220%) skewX(-20deg); }
        }
        @keyframes nexoFlotarEmoji {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.12); }
        }
        .nexo-carril {
          display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden;
          scroll-snap-type: x mandatory; scroll-padding-left: 16px;
          margin: 0 -16px; padding: 2px 16px 6px;
          scrollbar-width: none; -webkit-overflow-scrolling: touch;
        }
        .nexo-carril::-webkit-scrollbar { display: none; }
        .nexo-flecha { animation: nexoLatidoFlecha 1.4s ease-in-out infinite; }
        @keyframes nexoLatidoFlecha {
          0%, 100% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(5px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nexo-flecha { animation: none; }
        }
      `}</style>

      {mostrarInstructivo && <Instructivo onAceptar={cerrarInstructivo} />}

      {jugando && (
        <MiniJuego
          eventoId={evento.id}
          estadoFoto={estadoFoto}
          onVerFoto={() => setJugando(false)}
          onCerrar={() => setJugando(false)}
        />
      )}

      <div style={{ width: "100%", maxWidth: 420 }}>

        <input ref={fileRef} type="file" accept="image/*" style={estiloInputOculto}
          onChange={(e) => { tomarArchivo(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefIACamara} type="file" accept="image/*" capture="environment" style={estiloInputOculto}
          onChange={(e) => { tomarArchivoIA(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefIAGaleria} type="file" accept="image/*" style={estiloInputOculto}
          onChange={(e) => { tomarArchivoIA(e.target.files[0]); e.target.value = ""; }} />
        <input ref={fileRefCamara} type="file" accept="image/*" capture="environment" style={estiloInputOculto}
          onChange={(e) => { tomarArchivo(e.target.files[0]); e.target.value = ""; }} />

        {/* Barra superior compacta en todas las pantallas menos el inicio */}
        {step !== "subir" && (
          <BarraSuperior nombreEvento={evento.nombre} onVolver={accionVolver} />
        )}

        {/* ===================== INICIO: MARQUESINA ===================== */}
        {step === "subir" && (
          <div className="rise" style={{ textAlign: "center", paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <Logo size={15} sub={false} />
            </div>
            <div className="eyebrow" style={{ marginBottom: 22 }}>{evento.nombre}</div>

            {iaActiva && !esSoloEspecial && (
              <>
                <h1 className="display" style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 10 }}>
                  ¿Quién quieres <span className="grad-text">ser hoy?</span>
                </h1>
                <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.55, margin: "0 auto 22px", maxWidth: 320 }}>
                  Elige un modo, toma una selfie y la IA te transforma.
                </p>

                <Marquesina modos={modosMarquesina} onClick={() => abrirFunfoto()} />

                {conEspecialEnGrilla && (
                  <div style={{ marginTop: 22 }}>
                    <TarjetaEspecial nombre={nombreEspecial} compacta
                      onClick={() => abrirFunfoto(MODO_ESPECIAL)} />
                  </div>
                )}

                <button className="btn btn-primary btn-block"
                  style={{ marginTop: 22, padding: "16px 18px", fontSize: 16 }}
                  onClick={() => abrirFunfoto()}>
                  Quiero mi FUNfoto
                </button>
              </>
            )}

            {iaActiva && esSoloEspecial && (
              <>
                <h1 className="display" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 10 }}>
                  Tu foto <span className="grad-text">especial</span>
                </h1>
                <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.55, margin: "0 auto 22px", maxWidth: 320 }}>
                  Toma una selfie y la IA crea tu recuerdo de esta noche.
                </p>
                <TarjetaEspecial nombre={nombreEspecial} onClick={() => abrirFunfoto(MODO_ESPECIAL)} />
              </>
            )}

            {!iaActiva && (
              <>
                <h1 className="display" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 10 }}>
                  Comparte tu <span className="grad-text">foto</span>
                </h1>
                <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.55, margin: "0 auto 22px", maxWidth: 320 }}>
                  Súbela y aparece en la pantalla del evento.
                </p>
                <button className="btn btn-primary btn-block"
                  style={{ padding: "16px 18px", fontSize: 16 }}
                  onClick={() => setStep("elegir-fuente-normal")}>
                  <Icon.Camera size={18} /> {mensaje}
                </button>
              </>
            )}

            {iaActiva && (
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }}
                onClick={() => setStep("elegir-fuente-normal")}>
                <Icon.Camera size={16} /> Subir foto sin IA
              </button>
            )}

            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 12, lineHeight: 1.5 }}>
              Tu foto pasa por revisión y aparece en la pantalla del evento.
            </p>

            {error && (
              <div className="chip chip-danger" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>
                {error}
              </div>
            )}

            <Banner />
          </div>
        )}

        {/* ===================== CATÁLOGO ===================== */}
        {step === "catalogo" && (
          <div className="rise">
            <div style={{ marginBottom: 18 }}>
              <h2 className="display" style={{ fontSize: 24, lineHeight: 1.15 }}>
                Elige tu <span className="grad-text">FUNfoto</span>
              </h2>
              {!avisoMismaFoto && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, background: "var(--tint-cyan)",
                  }}>
                    {EMOJI_LUZ}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
                    Selfie con buena luz y rostro visible: así la IA te reconoce mejor.
                  </span>
                </div>
              )}
            </div>

            {avisoMismaFoto}

            {conEspecialEnGrilla && (
              <div style={{ marginBottom: 22 }}>
                <TarjetaEspecial nombre={nombreEspecial} onClick={() => elegirModo(MODO_ESPECIAL)} />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {filasCatalogo.map((fila, i) => (
                <FilaModos
                  key={fila.id}
                  idFila={fila.id}
                  titulo={fila.titulo}
                  modos={fila.modos}
                  destacada={fila.premium === true && esPremium}
                  bloqueada={fila.premium === true && !esPremium}
                  indice={i}
                  onElegir={elegirModo}
                />
              ))}
            </div>

            <Banner />
          </div>
        )}

        {step === "elegir-fuente-normal" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 className="display" style={{ fontSize: 20 }}>¿Cómo quieres tu foto?</h2>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }} onClick={() => fileRefCamara.current?.click()}>
              Tomar foto ahora
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => fileRef.current?.click()}>
              Elegir de galería
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={() => setStep("subir")}>
              Volver
            </button>
            <Banner />
          </div>
        )}

        {step === "elegir-fuente-ia" && (
          <div className="rise">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: modoParaSubidaRef.current === MODO_ESPECIAL ? "var(--magenta)" : undefined }}>
                {modoParaSubidaRef.current === MODO_ESPECIAL ? `${EMOJI_BRILLO} ${nombreEspecial}` : "FUNfoto IA"}
              </div>
              <h2 className="display" style={{ fontSize: 20 }}>¿Cómo quieres tu foto?</h2>
            </div>
            {consejoSelfie}
            <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }}
              onClick={() => { prepararAudio(); fileRefIACamara.current?.click(); }}>
              Tomar foto ahora
            </button>
            <button className="btn btn-ghost btn-block"
              onClick={() => { prepararAudio(); fileRefIAGaleria.current?.click(); }}>
              Elegir de galería
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={volverAlCatalogo}>
              {esSoloEspecial || destinoFunfotoRef.current === MODO_ESPECIAL ? "Volver" : "Volver al catálogo"}
            </button>
            <Banner />
          </div>
        )}

        {step === "ia" && (
          <div className="rise">
            <div className="card" style={{ textAlign: "center" }}>
              {(generandoIA || errorIA) && preview && (
                <img src={preview} alt="Tu foto" style={{
                  width: "100%", maxWidth: 280, margin: "0 auto 18px",
                  borderRadius: "var(--r-md)", aspectRatio: "9/16",
                  objectFit: "cover", display: "block",
                  border: "1px solid var(--border)",
                  opacity: generandoIA ? 0.5 : 1,
                }} />
              )}

              {!generandoIA && iaLista && urlResultadoIA && (
                <>
                  <img src={urlResultadoIA} alt="Tu foto transformada con IA" style={{
                    width: "100%", maxWidth: 280, margin: "0 auto 10px",
                    borderRadius: "var(--r-md)", aspectRatio: "9/16",
                    objectFit: "cover", display: "block",
                    border: "1px solid var(--cyan)",
                  }} />
                  <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}
                    onClick={descargarFoto} disabled={descargandoFoto}>
                    <Icon.Download size={14} /> {descargandoFoto ? "Preparando..." : "Descargar"}
                  </button>
                </>
              )}

              {generandoIA && (
                <>
                  <style>{`@keyframes nexoGirar { to { transform: rotate(360deg); } }`}</style>
                  <div style={{
                    width: 46, height: 46, margin: "0 auto 16px", borderRadius: "50%",
                    border: "3px solid rgba(var(--cyan-rgb),0.15)",
                    borderTopColor: "var(--cyan)",
                    animation: "nexoGirar 0.9s linear infinite",
                  }} />
                  <div className="display" style={{ fontSize: 17, marginBottom: 8 }}>
                    Generando con IA<span style={{ display: "inline-block", width: 24, textAlign: "left" }}>{puntosGenerando}</span>
                  </div>
                  <p style={{ color: "var(--cyan)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 6, minHeight: 22 }}>
                    {mensajeGenerando}
                  </p>
                  <p style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.6 }}>
                    Puede tardar hasta 4 minutos. No cierres esta pantalla, te avisamos con un sonido cuando esté lista.
                  </p>

                  <button
                    onClick={() => { prepararAudio(); setJugando(true); }}
                    style={{
                      width: "100%", marginTop: 18, padding: "14px 16px", borderRadius: 14,
                      border: "1px solid rgba(var(--magenta-rgb),0.55)", cursor: "pointer",
                      fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)", color: "#fff",
                      background: "linear-gradient(135deg, rgba(var(--magenta-rgb),0.22), rgba(var(--cyan-rgb),0.14))",
                      boxShadow: "0 0 26px rgba(var(--magenta-rgb),0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{EMOJI_CONTROL}</span>
                    Jugar mientras esperas
                  </button>
                </>
              )}

              {/* Resultado listo, ANTES de usar la foto */}
              {!generandoIA && iaLista && !iaConfirmada && (
                <>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>¿Te gusta el resultado?</h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
                    Intento {intentosIA} de {MAX_INTENTOS_IA}
                  </p>
                  {intentosIA >= MAX_INTENTOS_IA && (
                    <p style={{ color: "var(--warn)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
                      {esSoloEspecial
                        ? `Ya usaste tus ${MAX_INTENTOS_IA} intentos. Puedes usar esta foto o probar con otra selfie.`
                        : `Ya usaste tus ${MAX_INTENTOS_IA} intentos con este modo. Puedes usar esta foto, probar otro modo u otra selfie.`}
                    </p>
                  )}

                  <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}
                    onClick={confirmarFotoIA} disabled={confirmandoIA}>
                    {confirmandoIA ? "Confirmando..." : "Usar esta foto"}
                  </button>

                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }}
                    onClick={volverAGenerar} disabled={intentosIA >= MAX_INTENTOS_IA || confirmandoIA}>
                    Volver a generar
                  </button>

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otraSelfie} disabled={confirmandoIA}>
                      Otra selfie
                    </button>
                    {!esSoloEspecial && (
                      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otroModo} disabled={confirmandoIA}>
                        Otro modo
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Foto ya usada: solo Volver */}
              {!generandoIA && iaLista && iaConfirmada && (
                <>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
                  }}>
                    <Icon.Check size={26} color="var(--cyan)" />
                  </div>
                  <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>¡Listo!</h2>
                  <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                    {textoTrasConfirmar}
                  </p>
                  <button className="btn btn-ghost btn-block" onClick={reiniciar}>Volver</button>
                </>
              )}

              {/* Error */}
              {!generandoIA && errorIA && (
                <>
                  <div className="chip chip-danger" style={{
                    marginBottom: 18, width: "100%", justifyContent: "center",
                    lineHeight: 1.5, textAlign: "center", padding: "10px 14px",
                  }}>
                    {errorIA}
                  </div>

                  {errorReintentable && (
                    <>
                      <button className="btn btn-primary btn-block" onClick={reintentarTrasError}>
                        Intentar de nuevo
                      </button>
                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otraSelfie}>Otra selfie</button>
                        {!esSoloEspecial && (
                          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={otroModo}>Otro modo</button>
                        )}
                      </div>
                    </>
                  )}

                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={reiniciar}>
                    Volver al inicio
                  </button>
                </>
              )}
            </div>
            <Banner />
          </div>
        )}

        {step === "revisar" && (
          <div className="rise">
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Revisa tu foto</div>
              <img src={preview} alt="Vista previa de tu foto" style={{
                width: "100%", borderRadius: "var(--r-md)", aspectRatio: "4/3",
                objectFit: "cover", marginBottom: 18, border: "1px solid var(--border)",
              }} />

              <button
                onClick={() => setAutorizada(!autorizada)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "4px 0",
                  marginBottom: 18, background: "none", border: "none", cursor: "pointer",
                  textAlign: "left", width: "100%",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: autorizada ? "1px solid var(--cyan)" : "1px solid var(--border-strong)",
                  background: autorizada ? "var(--cyan)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {autorizada && <Icon.Check size={14} color="#0a0a0f" />}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Autorizo a NexoLED a usar esta foto con fines publicitarios
                </span>
              </button>

              {error && (
                <div className="chip chip-danger" style={{ marginBottom: 14, width: "100%", justifyContent: "center" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reiniciar} disabled={enviando}>Cambiar</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={enviar} disabled={enviando}>
                  {enviando ? "Enviando..." : "Enviar foto"}
                </button>
              </div>
            </div>
            <Banner />
          </div>
        )}

        {step === "enviada" && (
          <div className="rise">
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: "var(--tint-cyan)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
              }}>
                <Icon.Check size={26} color="var(--cyan)" />
              </div>
              <h2 className="display" style={{ fontSize: 20, marginBottom: 10 }}>Foto enviada</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
                {textoTrasConfirmar}
              </p>
              <button className="btn btn-ghost btn-block" onClick={reiniciar}>Volver</button>
            </div>
            <Banner />
          </div>
        )}
      </div>
    </div>
  );
}

/* Barra superior compacta: flecha para volver (si corresponde),
   logo chico a la izquierda y nombre del evento a la derecha. */
function BarraSuperior({ nombreEvento, onVolver }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
      {onVolver && (
        <button
          onClick={onVolver}
          aria-label="Volver"
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--surface)", border: "1px solid var(--border)",
            color: "var(--text)", cursor: "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}
      <Logo size={11} sub={false} />
      <span className="eyebrow" style={{
        marginLeft: "auto", maxWidth: "45%", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {nombreEvento}
      </span>
    </div>
  );
}

/* Marquesina del inicio: dos cintas de portadas que se mueven sin parar,
   la de arriba hacia la izquierda y la de abajo hacia la derecha.
   Cada portada se mueve por separado (piezas chicas), porque el motor
   del iPhone no dibuja bien una tira muy ancha en movimiento. Cuando una
   portada sale por un lado, reaparece por el otro. Tocarla abre el catálogo. */
function Marquesina({ modos, onClick }) {
  const tarjetasRef = useRef([[], []]);
  const mitad = Math.ceil(modos.length / 2);

  // Cada cinta repite sus portadas hasta cubrir el ancho mínimo.
  const cintas = [modos.slice(0, mitad), modos.slice(mitad)].map((lista) => {
    if (!lista.length) return lista;
    let completa = [...lista];
    while (completa.length * PASO_CINTA < ANCHO_MINIMO_CINTA) completa = completa.concat(lista);
    return completa;
  });

  useEffect(() => {
    const avance = [0, 0];
    let cuadro = 0;
    let anterior = performance.now();

    const paso = (ahora) => {
      // Si la pestaña estuvo oculta, no "salta": máximo 0,1 s por cuadro.
      const dt = Math.min(ahora - anterior, 100) / 1000;
      anterior = ahora;

      tarjetasRef.current.forEach((fila, i) => {
        const total = fila.length * PASO_CINTA;
        if (!total) return;
        const dir = i === 0 ? -1 : 1; // arriba a la izquierda, abajo a la derecha
        avance[i] = (avance[i] + VELOCIDAD_CINTA * dt) % total;
        fila.forEach((el, j) => {
          if (!el) return;
          let x = (j * PASO_CINTA + dir * avance[i]) % total;
          if (x < 0) x += total;
          // Se resta un paso para que la portada que reaparece entre desde fuera de la pantalla.
          el.style.transform = `translate3d(${x - PASO_CINTA}px, 0, 0)`;
        });
      });

      cuadro = requestAnimationFrame(paso);
    };

    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Ver todos los modos"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        position: "relative", overflow: "hidden", cursor: "pointer",
        width: "calc(100% + 32px)", margin: "0 -16px",
      }}
    >
      {cintas.map((lista, i) => (
        <div key={i} style={{ position: "relative", height: ALTO_TARJETA_CINTA, marginTop: i ? 8 : 0 }}>
          {lista.map((modo, j) => (
            <div
              key={`${modo.id}-${j}`}
              ref={(el) => { tarjetasRef.current[i][j] = el; }}
              style={{
                position: "absolute", top: 0, left: 0,
                width: ANCHO_TARJETA_CINTA, height: ALTO_TARJETA_CINTA,
                borderRadius: 10, overflow: "hidden",
                border: "1px solid var(--border)", background: "var(--surface)",
              }}
            >
              <img
                src={`/portadas/${modo.id}.webp`}
                alt=""
                draggable={false}
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Bordes difuminados (degradados encima) */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 48, pointerEvents: "none",
        background: "linear-gradient(90deg, var(--bg) 0%, transparent 100%)",
      }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0, right: 0, width: 48, pointerEvents: "none",
        background: "linear-gradient(270deg, var(--bg) 0%, transparent 100%)",
      }} />
    </div>
  );
}

/* Fila deslizable de modos, con pistas de deslizamiento:
   tarjeta asomada, degradado + flecha que late (se puede tocar en computador),
   empujoncito inicial (solo la primera vez) y flecha que se oculta al final.
   Si la fila está bloqueada (Divertidos en eventos Base), las tarjetas se ven
   con candado y al tocarlas solo aparece un aviso. */
function FilaModos({ idFila, titulo, modos, destacada, bloqueada, indice, onElegir }) {
  const carrilRef = useRef(null);
  const [alFinal, setAlFinal] = useState(false);
  const [avisoBloqueo, setAvisoBloqueo] = useState(false);

  useEffect(() => {
    const carril = carrilRef.current;
    if (!carril) return undefined;

    const revisar = () => {
      setAlFinal(carril.scrollLeft + carril.clientWidth >= carril.scrollWidth - 8);
    };
    revisar();
    carril.addEventListener("scroll", revisar, { passive: true });

    const timers = [];
    const sinMovimiento = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!sinMovimiento && !filasEmpujadas.has(idFila) && carril.scrollWidth > carril.clientWidth) {
      filasEmpujadas.add(idFila);
      timers.push(setTimeout(() => {
        carril.style.scrollSnapType = "none";
        carril.scrollTo({ left: 70, behavior: "smooth" });
        timers.push(setTimeout(() => {
          carril.scrollTo({ left: 0, behavior: "smooth" });
          timers.push(setTimeout(() => { carril.style.scrollSnapType = ""; }, 600));
        }, 650));
      }, 700 + indice * 250));
    }

    return () => {
      carril.removeEventListener("scroll", revisar);
      timers.forEach(clearTimeout);
      carril.style.scrollSnapType = "";
    };
  }, [idFila, indice]);

  const avanzar = () => {
    const carril = carrilRef.current;
    if (carril) carril.scrollBy({ left: carril.clientWidth * 0.8, behavior: "smooth" });
  };

  const alTocar = (modoId) => {
    if (bloqueada) {
      setAvisoBloqueo(true);
      return;
    }
    onElegir(modoId);
  };

  return (
    <div>
      {destacada && (
        <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 4 }}>
          Exclusivo de este evento
        </div>
      )}
      {bloqueada && (
        <div className="eyebrow" style={{ color: "var(--text-faint)", marginBottom: 4 }}>
          {EMOJI_CANDADO} Disponible en eventos Premium
        </div>
      )}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 10, marginBottom: 10,
      }}>
        <span className="display" style={{
          fontSize: 16,
          color: destacada ? "var(--magenta)" : bloqueada ? "var(--text-dim)" : "var(--text)",
        }}>
          {titulo}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
          {modos.length} modos · desliza
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <div ref={carrilRef} className="nexo-carril">
          {modos.map((modo) => (
            <TarjetaModo
              key={modo.id}
              modo={modo}
              destacada={destacada}
              bloqueada={bloqueada}
              onClick={() => alTocar(modo.id)}
            />
          ))}
        </div>

        {/* Degradado del borde derecho */}
        <div style={{
          position: "absolute", top: 0, bottom: 0, right: -16, width: 64,
          background: "linear-gradient(90deg, transparent 0%, var(--bg) 85%)",
          pointerEvents: "none", opacity: alFinal ? 0 : 1, transition: "opacity 0.3s ease",
        }} />

        {/* Flecha que late (en computador se puede tocar para avanzar) */}
        <button
          onClick={avanzar}
          aria-label={`Ver más modos de ${titulo}`}
          className="nexo-flecha"
          style={{
            position: "absolute", top: "50%", right: -4, width: 34, height: 34, marginTop: -17,
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--tint-cyan)", border: "1px solid var(--cyan)", color: "var(--cyan)",
            cursor: "pointer", padding: 0, zIndex: 2,
            opacity: alFinal ? 0 : 1, pointerEvents: alFinal ? "none" : "auto",
            transition: "opacity 0.3s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Aviso al tocar un modo bloqueado */}
      {bloqueada && avisoBloqueo && (
        <div className="card card-tight rise" style={{
          marginTop: 10, display: "flex", alignItems: "center", gap: 12,
          border: "1px solid var(--border-strong)",
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{EMOJI_CANDADO}</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, flex: 1 }}>
            Estos modos vienen incluidos en los eventos Premium de FUNfoto.
          </span>
          <button
            onClick={() => setAvisoBloqueo(false)}
            aria-label="Cerrar aviso"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 4,
              display: "flex", flexShrink: 0,
            }}
          >
            <Icon.X size={16} color="var(--text-faint)" />
          </button>
        </div>
      )}
    </div>
  );
}

/* Tarjeta de un modo con su portada (public/portadas/<id>.webp).
   Carga inmediata (sin "lazy"): el iPhone falla con carga a demanda
   dentro de filas que se deslizan de lado, y las portadas pesan poco.
   Si la portada no carga, queda un fondo oscuro con el nombre.
   Bloqueada: portada atenuada con candado en la esquina. */
function TarjetaModo({ modo, destacada, bloqueada, onClick }) {
  const [sinPortada, setSinPortada] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={bloqueada ? `${modo.nombre}, disponible en eventos Premium` : modo.nombre}
      style={{
        position: "relative", flex: "0 0 136px", aspectRatio: "3 / 4",
        borderRadius: 14, overflow: "hidden", padding: 0, cursor: "pointer",
        scrollSnapAlign: "start", textAlign: "left", fontFamily: "var(--font-body)",
        border: `1px solid ${destacada ? "var(--magenta)" : "var(--border)"}`,
        background: "linear-gradient(160deg, var(--surface), var(--bg))",
      }}
    >
      {!sinPortada && (
        <img
          src={`/portadas/${modo.id}.webp`}
          alt=""
          draggable={false}
          onError={() => setSinPortada(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", display: "block",
            opacity: bloqueada ? 0.4 : 1,
            filter: bloqueada ? "grayscale(0.6)" : "none",
          }}
        />
      )}
      {bloqueada && (
        <span style={{
          position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          background: "rgba(5,5,10,0.75)", border: "1px solid var(--border-strong)",
        }}>
          {EMOJI_CANDADO}
        </span>
      )}
      <span className="display" style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "28px 10px 10px", fontSize: 13, lineHeight: 1.2,
        color: bloqueada ? "var(--text-dim)" : "#fff",
        background: "linear-gradient(180deg, rgba(5,5,10,0) 0%, rgba(5,5,10,0.92) 65%)",
      }}>
        {modo.nombre}
      </span>
    </button>
  );
}

/* Tarjeta destacada del Especial: brillo que pulsa y un destello que la recorre. */
function TarjetaEspecial({ nombre, onClick, compacta }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", overflow: "hidden", width: "100%", cursor: "pointer",
        padding: compacta ? "20px 16px" : "30px 18px",
        borderRadius: 18, border: "1px solid var(--magenta)",
        background: "linear-gradient(135deg, rgba(var(--magenta-rgb),0.30) 0%, rgba(20,10,40,0.95) 45%, rgba(var(--cyan-rgb),0.22) 100%)",
        animation: "nexoPulsoEspecial 2.2s ease-in-out infinite",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        textAlign: "center", fontFamily: "var(--font-body)",
      }}
    >
      {/* Destello que cruza la tarjeta */}
      <span style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: "35%",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
        animation: "nexoBarridoEspecial 3.2s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <span style={{ fontSize: compacta ? 26 : 34, animation: "nexoFlotarEmoji 2.2s ease-in-out infinite" }}>
        {EMOJI_BRILLO}
      </span>
      <span className="eyebrow" style={{ color: "var(--magenta)", position: "relative" }}>
        Especial de la noche
      </span>
      <span className="display" style={{ fontSize: compacta ? 21 : 26, color: "#fff", lineHeight: 1.15, position: "relative" }}>
        {nombre}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", position: "relative" }}>
        Creado exclusivamente para esta noche
      </span>
    </button>
  );
}

/* Ventana del instructivo: aparece una vez por evento y celular. */
function Instructivo({ onAceptar }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(5,5,10,0.72)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "nexoAparecer 0.25s ease both",
    }}>
      <style>{`
        @keyframes nexoAparecer { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nexoSubir { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes nexoItem { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
        @keyframes nexoBrillo {
          0%, 100% { box-shadow: 0 0 22px rgba(var(--magenta-rgb),0.35), 0 0 0 1px rgba(var(--magenta-rgb),0.4); transform: scale(1); }
          50% { box-shadow: 0 0 36px rgba(var(--cyan-rgb),0.45), 0 0 0 1px rgba(var(--cyan-rgb),0.5); transform: scale(1.05); }
        }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 380,
        background: "linear-gradient(160deg, var(--surface-2) 0%, var(--surface) 100%)",
        border: "1px solid rgba(var(--magenta-rgb),0.45)",
        borderRadius: 22, padding: "28px 22px 22px",
        boxShadow: "0 0 60px rgba(var(--magenta-rgb),0.18), 0 20px 50px rgba(0,0,0,0.5)",
        animation: "nexoSubir 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
      }}>
        <div style={{
          width: 66, height: 66, borderRadius: "50%", margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32,
          background: "radial-gradient(circle, rgba(var(--magenta-rgb),0.28), rgba(var(--cyan-rgb),0.08))",
          animation: "nexoBrillo 2.6s ease-in-out infinite",
        }}>
          {EMOJI_BRILLO}
        </div>

        <div className="eyebrow" style={{ textAlign: "center", color: "var(--magenta)", marginBottom: 6 }}>
          FUNfoto IA
        </div>
        <h2 className="display" style={{ textAlign: "center", fontSize: 21, marginBottom: 20 }}>
          Antes de tu FUNfoto
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {CONSEJOS_INSTRUCTIVO.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 14px", borderRadius: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              animation: `nexoItem 0.4s ease ${0.15 + i * 0.1}s both`,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 21,
                background: `rgba(${c.color},0.12)`,
                border: `1px solid rgba(${c.color},0.35)`,
              }}>
                {c.emoji}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--text-dim)" }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{c.fuerte}</span>
                {c.resto}
              </div>
            </div>
          ))}
        </div>

        <button onClick={onAceptar} style={{
          width: "100%", padding: "14px 16px", borderRadius: 14, border: "none",
          cursor: "pointer", fontSize: 15, fontWeight: 700,
          fontFamily: "var(--font-body)", color: "#0a0a0f",
          background: "linear-gradient(90deg, var(--cyan), var(--magenta))",
          boxShadow: "0 0 24px rgba(var(--cyan-rgb),0.25)",
        }}>
          ¡Entendido, vamos!
        </button>
      </div>
    </div>
  );
}

function Banner() {
  return (
    <button
      onClick={() => window.open("https://nexoled.cl", "_blank", "noopener,noreferrer")}
      style={{
        display: "block", width: "100%", marginTop: 22, padding: 0,
        background: "none", border: "none", cursor: "pointer", textAlign: "center",
      }}
    >
      <div style={{
        padding: 18, background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", textAlign: "center",
      }}>
        <div className="display" style={{ fontSize: 15, marginBottom: 6 }}>¿Quieres esto en tu evento?</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.5 }}>
          Pantallas LED para bodas, cumpleaños y eventos en Punta Arenas.
        </div>
        <span className="btn btn-primary btn-sm">Ver NexoLED</span>
      </div>
    </button>
  );
}