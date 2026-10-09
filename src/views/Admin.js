import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../supabase";
import { generarSlug, sufijoCorto, urlsDe } from "../lib";
import { cargarJSZip, cargarXLSX } from "../cdn";
import Icon from "../components/Icons";
import { LogoTitulo, Toast, Stat, Vacio, Modal } from "../components/UI";

// Costos por foto IA de respaldo (US$). Los reales se editan en el Admin
// (tabla configuracion).
// base -> Seedream 5.0 Pro 1k | pro -> GPT Image 2.5 Flare medium
// (caso de 2 imágenes) | premium -> GPT Image 2 medium
const COSTOS_RESPALDO = { base: 0.045, pro: 0.054, premium: 0.08 };

const URL_PRECIOS_WAVESPEED = "https://wavespeed.ai/models";

// Dólar de respaldo si no se puede obtener el del día desde mindicador.cl.
const CLP_POR_USD_RESPALDO = 950;

// Precio sugerido: costo x 1,4 (40% de utilidad sobre el costo) x 1,19 (IVA).
const FACTOR_UTILIDAD = 1.4;
const TASA_IVA = 0.19;

// Tope de seguridad para eventos sin cuota (debe coincidir con la función SQL).
const TOPE_SEGURIDAD_SIN_CUOTA = 30;

// Los archivos huérfanos solo se borran si tienen más de estas horas.
const HORAS_MINIMAS_HUERFANO = 24;

// Tiers (modelo de generación). El modelo va entre paréntesis.
const TIERS = [
  { id: "base", nombre: "Base (Seedream 5)" },
  { id: "pro", nombre: "Pro (GPT Flare)" },
  { id: "premium", nombre: "Premium (GPT Image 2)" },
];

const NOMBRE_TIER = { base: "Base", pro: "Pro", premium: "Premium" };

const DETALLE_TIER = {
  base: "Base: motor Seedream 5, sin modos Divertidos ni Especial.",
  pro: "Pro: motor GPT Image 2.5 Flare, rápido. Incluye Divertidos y Especial.",
  premium: "Premium: motor GPT Image 2, máxima calidad y más lento. Incluye Divertidos y Especial.",
};

// Contenido IA del evento. "Grilla normal" es el Especial apagado.
const OPCIONES_CONTENIDO = [
  { id: "grilla", nombre: "Grilla normal" },
  { id: "especial_grilla", nombre: "Especial + grilla" },
  { id: "solo_especial", nombre: "Solo Especial" },
];

const DETALLE_CONTENIDO = {
  grilla: "Sin Especial. El invitado ve la grilla de modos según el tier.",
  especial_grilla: "Especial destacado + grilla completa con Divertidos. Requiere Pro o Premium.",
  solo_especial: "El invitado va directo al Especial, sin grilla. Requiere Pro o Premium.",
};

const MENSAJE_BLOQUEO_ESPECIAL = "Con Especial el evento va en Pro o Premium";

// Planes de fotos por persona.
const PLANES_FOTOS = [
  { id: "estandar", nombre: "Estándar", fotos: 2 },
  { id: "funplus", nombre: "FunPlus", fotos: 4 },
  { id: "maxfun", nombre: "MaxFun", fotos: 15 },
];

const OPCIONES_PLAN = PLANES_FOTOS.map((p) => ({ id: p.id, nombre: `${p.nombre} (${p.fotos})` }));

const planPorId = (id) => PLANES_FOTOS.find((p) => p.id === id) || PLANES_FOTOS[0];
const clp = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const MENSAJE_FALTAN_INVITADOS = "Ingresa el número de invitados para calcular la cuota y el precio";

// Tier válido guardado en el evento (valores antiguos o vacíos -> base).
const tierNormalizado = (motor) => (["base", "pro", "premium"].includes(motor) ? motor : "base");

// El Especial necesita Pro o Premium.
const tieneEspecialContenido = (contenido) => !!contenido && contenido !== "grilla";

// Si hay Especial y el tier es Base, se sube a Pro.
const tierConEspecial = (tier, conEspecial) => (conEspecial && tier === "base" ? "pro" : tier);

// Costo por foto según el tier y los precios cargados.
const costoDeTier = (tier, costos) => costos[tier] ?? costos.base;

// Precio sugerido (con IVA) de N fotos IA según el tier, los precios y el dólar.
const precioSugerido = (n, tier, dolar, costos) =>
  n * costoDeTier(tier, costos) * dolar * FACTOR_UTILIDAD * (1 + TASA_IVA);

// Redondea a múltiplos de 5, mínimo 5.
const redondear5 = (x) => Math.max(5, Math.round(x / 5) * 5);

// Sugerencias para "Agregar cuota": +1 por persona, ~25% y ~50% de la cuota.
const sugerenciasCuota = (ev) => {
  const lista = [];
  if (ev.invitados > 0) lista.push({ etiqueta: "+1 por persona", n: ev.invitados });
  const cuota = ev.cuota_ia || 0;
  if (cuota > 0) {
    const n25 = redondear5(cuota * 0.25);
    const n50 = redondear5(cuota * 0.5);
    lista.push({ etiqueta: `+${n25}`, n: n25 });
    lista.push({ etiqueta: `+${n50}`, n: n50 });
  }
  const vistos = new Set();
  return lista.filter((s) => {
    if (vistos.has(s.n)) return false;
    vistos.add(s.n);
    return true;
  });
};

/* ---------- Ayudantes de almacenamiento (bucket fotos) ---------- */

// Borra archivos del bucket en lotes de 100.
async function borrarEnLotes(nombres) {
  for (let i = 0; i < nombres.length; i += 100) {
    const lote = nombres.slice(i, i + 100);
    const { error } = await supabase.storage.from("fotos").remove(lote);
    if (error) throw error;
  }
}

// Lista todos los archivos de la raíz del bucket (pagina de a 1000).
async function listarRaizBucket(busqueda) {
  const todos = [];
  let offset = 0;
  for (;;) {
    const opciones = { limit: 1000, offset, sortBy: { column: "name", order: "asc" } };
    if (busqueda) opciones.search = busqueda;
    const { data, error } = await supabase.storage.from("fotos").list("", opciones);
    if (error) throw error;
    const lote = data || [];
    todos.push(...lote);
    if (lote.length < 1000) break;
    offset += 1000;
  }
  // Las carpetas vienen con id null: se ignoran.
  return todos.filter((a) => a.id);
}

// Nombres de archivo que están en uso: fotos de la tabla y referencias del Especial.
async function nombresReferenciados() {
  const usados = new Set();
  const agregar = (url) => {
    const nombre = (url || "").split("/fotos/")[1];
    if (nombre) usados.add(nombre);
  };
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("fotos").select("url").range(desde, desde + 999);
    if (error) throw error;
    const lote = data || [];
    lote.forEach((f) => agregar(f.url));
    if (lote.length < 1000) break;
    desde += 1000;
  }
  const { data: evs, error: errEv } = await supabase
    .from("eventos").select("especial_ref_url, especial_ref_url_2");
  if (errEv) throw errEv;
  (evs || []).forEach((e) => {
    agregar(e.especial_ref_url);
    agregar(e.especial_ref_url_2);
  });
  return usados;
}

// Borra los archivos de la raíz que empiezan con un prefijo.
async function borrarPorPrefijo(prefijo) {
  const archivos = await listarRaizBucket(prefijo);
  const nombres = archivos.map((a) => a.name).filter((n) => n.startsWith(prefijo));
  if (nombres.length) await borrarEnLotes(nombres);
  return nombres.length;
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [eventos, setEventos] = useState([]);
  const [conteos, setConteos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [verCerrados, setVerCerrados] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoMotor, setNuevoMotor] = useState("base");
  const [nuevoContenido, setNuevoContenido] = useState("grilla");
  const [nuevoPlan, setNuevoPlan] = useState("estandar");
  const [nuevosInvitados, setNuevosInvitados] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [editando, setEditando] = useState({});      // { [eventoId]: { nombre, clave, invitados, plan } }
  const [guardando, setGuardando] = useState(null);  // eventoId que está guardando
  const [extraInput, setExtraInput] = useState({});  // { [eventoId]: "50" }
  const [confirmarReinicio, setConfirmarReinicio] = useState(null); // eventoId
  const [huerfanos, setHuerfanos] = useState(null);  // { nombres: [], bytes: 0 }
  const [buscandoHuerfanos, setBuscandoHuerfanos] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [operadores, setOperadores] = useState([]);
  const [verOps, setVerOps] = useState(false);
  const [opsSel, setOpsSel] = useState([]);
  const [dolar, setDolar] = useState({ valor: CLP_POR_USD_RESPALDO, fecha: null, oficial: false });
  const [costos, setCostos] = useState(COSTOS_RESPALDO);
  const [costosEdit, setCostosEdit] = useState({ base: "", pro: "", premium: "" });
  const [costosActualizado, setCostosActualizado] = useState(null);
  const [guardandoCostos, setGuardandoCostos] = useState(false);

  /* ---------- Sesión de Supabase Auth ---------- */
  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setLoggedIn(!!data?.session);
      setVerificandoSesion(false);
    });
    const { data: escucha } = supabase.auth.onAuthStateChange((_evento, session) => {
      setLoggedIn(!!session);
    });
    return () => {
      activo = false;
      escucha?.subscription?.unsubscribe();
    };
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setPass("");
  };

  /* ---------- Dólar del día (mindicador.cl, dólar observado Banco Central) ---------- */
  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const r = await fetch("https://mindicador.cl/api/dolar");
        const d = await r.json();
        const ultimo = d?.serie?.[0];
        if (ultimo?.valor) {
          setDolar({ valor: ultimo.valor, fecha: ultimo.fecha, oficial: true });
        }
      } catch {
        // Si falla, queda el valor de respaldo.
      }
    })();
  }, [loggedIn]);

  /* ---------- Precios de IA (tabla configuracion) ---------- */
  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("configuracion").select("clave, valor, actualizado")
        .in("clave", ["costo_base_usd", "costo_pro_usd", "costo_premium_usd"]);
      if (err || !data) return;
      const mapa = {};
      let ultima = null;
      data.forEach((f) => {
        mapa[f.clave] = Number(f.valor);
        if (!ultima || f.actualizado > ultima) ultima = f.actualizado;
      });
      const nuevos = {
        base: mapa.costo_base_usd > 0 ? mapa.costo_base_usd : COSTOS_RESPALDO.base,
        pro: mapa.costo_pro_usd > 0 ? mapa.costo_pro_usd : COSTOS_RESPALDO.pro,
        premium: mapa.costo_premium_usd > 0 ? mapa.costo_premium_usd : COSTOS_RESPALDO.premium,
      };
      setCostos(nuevos);
      setCostosEdit({ base: String(nuevos.base), pro: String(nuevos.pro), premium: String(nuevos.premium) });
      setCostosActualizado(ultima);
    })();
  }, [loggedIn]);

  const guardarCostos = async () => {
    const leer = (v) => parseFloat(String(v).replace(",", "."));
    const base = leer(costosEdit.base);
    const pro = leer(costosEdit.pro);
    const premium = leer(costosEdit.premium);
    const valido = (x) => x > 0 && x < 2;
    if (!valido(base) || !valido(pro) || !valido(premium)) {
      setToast("Revisa los precios: deben ser mayores que 0 y menores que 2 dólares");
      return;
    }
    setGuardandoCostos(true);
    const ahora = new Date().toISOString();
    const { error: err } = await supabase.from("configuracion").upsert([
      { clave: "costo_base_usd", valor: base, actualizado: ahora },
      { clave: "costo_pro_usd", valor: pro, actualizado: ahora },
      { clave: "costo_premium_usd", valor: premium, actualizado: ahora },
    ]);
    setGuardandoCostos(false);
    if (err) { setToast("No se pudieron guardar los precios"); return; }
    setCostos({ base, pro, premium });
    setCostosActualizado(ahora);
    setToast("Precios de IA actualizados");
  };

  /* ---------- Cargar eventos + conteo de fotos ---------- */
  const cargarEventos = useCallback(async () => {
    const { data } = await supabase
      .from("eventos").select("*").order("created_at", { ascending: false });
    const lista = data || [];
    setEventos(lista);

    const { data: fotosAll } = await supabase.from("fotos").select("evento_id, status");
    const mapa = {};
    (fotosAll || []).forEach((f) => {
      if (!mapa[f.evento_id]) mapa[f.evento_id] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      mapa[f.evento_id].total++;
      mapa[f.evento_id][f.status]++;
    });
    setConteos(mapa);
    setCargando(false);
  }, []);

  useEffect(() => { if (loggedIn) cargarEventos(); }, [loggedIn, cargarEventos]);

  /* Refresco automático mientras hay eventos en vivo */
  useEffect(() => {
    if (!loggedIn) return;
    const t = setInterval(cargarEventos, 20000);
    return () => clearInterval(t);
  }, [loggedIn, cargarEventos]);

  /* ---------- Crear evento con slug único ---------- */
  const limpiarFormularioCrear = () => {
    setNuevoNombre("");
    setNuevoMotor("base");
    setNuevoContenido("grilla");
    setNuevoPlan("estandar");
    setNuevosInvitados("");
  };

  const cancelarCrear = () => {
    limpiarFormularioCrear();
    setMostrarCrear(false);
  };

  const crearEvento = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) { setToast("Escribe un nombre para el evento"); return; }

    const invitadosNum = parseInt(nuevosInvitados, 10);
    if (!invitadosNum || invitadosNum <= 0) { setToast(MENSAJE_FALTAN_INVITADOS); return; }

    setCreando(true);
    try {
      let slug = generarSlug(nombre);
      const { data: existe } = await supabase.from("eventos").select("id").eq("slug", slug).maybeSingle();
      if (existe) slug = `${slug}-${sufijoCorto()}`;

      const plan = planPorId(nuevoPlan);
      const conEspecial = tieneEspecialContenido(nuevoContenido);
      const motor = tierConEspecial(nuevoMotor, conEspecial);

      const clave = Math.random().toString(36).slice(2, 8);
      const { error: err } = await supabase.from("eventos").insert({
        nombre,
        slug,
        clave_operador: clave,
        activo: true,
        evento_cerrado: false,
        descarga_habilitada: false,
        mensaje_subida: "Subir foto",
        session_version: 1,
        ia_habilitada: true,
        motor_ia: motor,
        contenido_ia: nuevoContenido,
        especial_habilitado: conEspecial,
        cuota_plan: plan.id,
        fotos_por_persona: plan.fotos,
        invitados: invitadosNum,
        cuota_ia: invitadosNum * plan.fotos,
      });
      if (err) throw err;
      limpiarFormularioCrear();
      setMostrarCrear(false);
      setVerCerrados(false);
      setToast(conEspecial
        ? `Evento creado: ${slug}. Recuerda configurar el Especial.`
        : `Evento creado: ${slug}`);
      cargarEventos();
    } catch {
      setToast("No se pudo crear el evento");
    } finally {
      setCreando(false);
    }
  };

  /* ---------- Acciones por evento ---------- */
  const actualizar = async (ev, campos, mensaje) => {
    const { error: err } = await supabase.from("eventos").update(campos).eq("id", ev.id);
    if (err) { setToast("No se pudo guardar"); return; }
    setToast(mensaje);
    cargarEventos();
  };

  const alternarCerrado = (ev) => {
    if (ev.evento_cerrado) {
      actualizar(ev, {
        evento_cerrado: false,
        clave_operador: Math.random().toString(36).slice(2, 8),
        descarga_habilitada: false,
        session_version: (ev.session_version || 1) + 1,
      }, "Evento reabierto con clave nueva");
    } else {
      actualizar(ev, {
        evento_cerrado: true,
        descarga_habilitada: false,
        session_version: (ev.session_version || 1) + 1,
      }, "Evento cerrado");
    }
  };

  /* Borra las fotos del evento (archivos + filas) y las selfies originales.
     No toca el contador de IA usadas ni las referencias del Especial. */
  const borrarArchivosDeEvento = async (ev) => {
    const { data: fs } = await supabase.from("fotos").select("url").eq("evento_id", ev.id);
    if (fs?.length) {
      const paths = fs.map((f) => (f.url || "").split("/fotos/")[1]).filter(Boolean);
      if (paths.length) await borrarEnLotes(paths);
    }
    await supabase.from("fotos").delete().eq("evento_id", ev.id);
    await borrarPorPrefijo(`original_${ev.id}_`);
  };

  const borrarFotos = async (ev) => {
    if (!window.confirm(`¿Borrar todas las fotos de "${ev.nombre}"? También se borran las selfies originales. La cuota de IA no cambia.`)) return;
    try {
      await borrarArchivosDeEvento(ev);
      setToast("Fotos borradas");
    } catch {
      setToast("No se pudieron borrar todas las fotos");
    }
    cargarEventos();
  };

  const eliminarEvento = async (ev) => {
    if (!window.confirm(`¿Eliminar "${ev.nombre}" y todo su contenido? Esto no se puede deshacer.`)) return;
    try {
      await borrarArchivosDeEvento(ev);
      await borrarPorPrefijo(`especial_${ev.id}_`);
      await supabase.from("operadores").delete().eq("evento_id", ev.id);
      await supabase.from("eventos").delete().eq("id", ev.id);
      setToast(`"${ev.nombre}" eliminado`);
    } catch {
      setToast("No se pudo eliminar todo el contenido");
    }
    cargarEventos();
  };

  const descargarFotos = async (ev) => {
    const { data: fs } = await supabase
      .from("fotos").select("*").eq("evento_id", ev.id).eq("status", "approved");
    if (!fs?.length) { setToast("No hay fotos aprobadas"); return; }
    setToast("Preparando descarga...");
    try {
      const JSZip = await cargarJSZip();
      const zip = new JSZip();
      for (let i = 0; i < fs.length; i++) {
        const blob = await (await fetch(fs[i].url)).blob();
        const suf = fs[i].autorizada === false ? "_NO_AUTORIZADA" : "";
        zip.file(`foto_${i + 1}${suf}.jpg`, blob);
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${ev.slug || "evento"}_fotos.zip`; a.click();
      URL.revokeObjectURL(url);
      setToast(`${fs.length} fotos descargadas`);
    } catch { setToast("No se pudo generar la descarga"); }
  };

  /* Fotos extra agregadas a mano: lo que la cuota guardada tiene por
     sobre invitados x fotos por persona. Así no se pierden al recalcular. */
  const calcularExtra = (ev) => {
    const fpp = ev.fotos_por_persona || planPorId(ev.cuota_plan).fotos;
    const base = (ev.invitados || 0) * fpp;
    return Math.max(0, (ev.cuota_ia || 0) - base);
  };

  /* Inicializa los campos de edición al expandir un evento */
  const abrirExpandido = (ev) => {
    const abierto = expandido === ev.id;
    setExpandido(abierto ? null : ev.id);
    setConfirmarReinicio(null);
    if (!abierto) {
      setEditando((prev) => ({
        ...prev,
        [ev.id]: {
          nombre: ev.nombre,
          clave: ev.clave_operador,
          invitados: ev.invitados ?? "",
          plan: ev.cuota_plan || "estandar",
        },
      }));
    }
  };

  const guardarConfig = async (ev) => {
    const campos = editando[ev.id];
    if (!campos?.nombre?.trim()) { setToast("El nombre no puede estar vacío"); return; }

    const invitadosNum = parseInt(campos.invitados, 10);
    if (!invitadosNum || invitadosNum <= 0) { setToast(MENSAJE_FALTAN_INVITADOS); return; }

    setGuardando(ev.id);

    const plan = planPorId(campos.plan);
    const extra = calcularExtra(ev);
    const cuotaCalculada = invitadosNum * plan.fotos + extra;

    const { error: err } = await supabase.from("eventos").update({
      nombre: campos.nombre.trim(),
      clave_operador: campos.clave.trim() || ev.clave_operador,
      invitados: invitadosNum,
      cuota_plan: plan.id,
      fotos_por_persona: plan.fotos,
      cuota_ia: cuotaCalculada,
    }).eq("id", ev.id);
    setGuardando(null);
    if (err) { setToast("No se pudo guardar"); return; }
    setToast("Configuración guardada");
    cargarEventos();
  };

  /* Suma N fotos a la cuota actual (no la reemplaza). */
  const sumarCuota = (ev, n) => {
    if (!n || n <= 0) { setToast("Escribe cuántas fotos agregar"); return false; }
    if (ev.cuota_ia === null || ev.cuota_ia === undefined) {
      setToast("Primero define los invitados y guarda la configuración");
      return false;
    }
    const nueva = ev.cuota_ia + n;
    actualizar(ev, { cuota_ia: nueva }, `Se agregaron ${n} fotos. Cuota total: ${nueva}`);
    return true;
  };

  const agregarCuota = (ev) => {
    const n = parseInt(extraInput[ev.id], 10);
    if (sumarCuota(ev, n)) {
      setExtraInput((prev) => ({ ...prev, [ev.id]: "" }));
    }
  };

  const agregarSugerencia = (ev, n) => {
    const total = (ev.cuota_ia || 0) + n;
    if (!window.confirm(`¿Agregar ${n} fotos? La cuota queda en ${total}.`)) return;
    sumarCuota(ev, n);
  };

  /* Deja el contador de IA usadas en 0. Solo para pruebas. */
  const reiniciarContador = (ev) => {
    setConfirmarReinicio(null);
    actualizar(ev, { ia_usadas: 0 }, "Contador de IA reiniciado");
  };

  const regenerarClave = async (ev) => {
    const nueva = Math.random().toString(36).slice(2, 8);
    await actualizar(ev, {
      clave_operador: nueva,
      session_version: (ev.session_version || 1) + 1,
    }, "Clave regenerada, sesiones anteriores expiradas");
    setEditando((prev) => ({ ...prev, [ev.id]: { ...prev[ev.id], clave: nueva } }));
  };

  const cambiarTier = (ev, motor) => {
    if (tierNormalizado(ev.motor_ia) === motor) return;
    if (tieneEspecialContenido(ev.contenido_ia) && motor === "base") {
      setToast(MENSAJE_BLOQUEO_ESPECIAL);
      return;
    }
    actualizar(ev, { motor_ia: motor }, `Evento cambiado a ${NOMBRE_TIER[motor]}`);
  };

  const cambiarContenido = (ev, valor) => {
    if ((ev.contenido_ia || "grilla") === valor) return;
    const conEspecial = tieneEspecialContenido(valor);
    const campos = { contenido_ia: valor, especial_habilitado: conEspecial };
    const tierActual = tierNormalizado(ev.motor_ia);
    const tierNuevo = tierConEspecial(tierActual, conEspecial);
    if (tierNuevo !== tierActual) campos.motor_ia = tierNuevo;
    const mensajes = {
      grilla: "Especial apagado",
      especial_grilla: `Especial + grilla activado (${NOMBRE_TIER[tierNuevo]})`,
      solo_especial: `Solo Especial activado (${NOMBRE_TIER[tierNuevo]})`,
    };
    actualizar(ev, campos, mensajes[valor]);
  };

  const abrirEspecial = (ev) => {
    window.location.href = urlsDe(ev.slug).especial;
  };

  const copiar = (texto, etiqueta) => {
    navigator.clipboard.writeText(texto);
    setToast(`${etiqueta} copiado`);
  };

  /* ---------- Mantenimiento: archivos huérfanos ---------- */
  const buscarHuerfanos = async () => {
    setBuscandoHuerfanos(true);
    try {
      const [archivos, usados] = await Promise.all([listarRaizBucket(), nombresReferenciados()]);
      const limite = Date.now() - HORAS_MINIMAS_HUERFANO * 60 * 60 * 1000;
      const lista = archivos.filter((a) =>
        !usados.has(a.name) && a.created_at && new Date(a.created_at).getTime() < limite);
      if (!lista.length) {
        setToast("No hay archivos huérfanos para borrar");
        setHuerfanos(null);
      } else {
        const bytes = lista.reduce((s, a) => s + (a.metadata?.size || 0), 0);
        setHuerfanos({ nombres: lista.map((a) => a.name), bytes });
      }
    } catch {
      setToast("No se pudo revisar el almacenamiento");
    } finally {
      setBuscandoHuerfanos(false);
    }
  };

  const limpiarHuerfanos = async () => {
    if (!huerfanos?.nombres?.length) return;
    setLimpiando(true);
    try {
      await borrarEnLotes(huerfanos.nombres);
      setToast(`${huerfanos.nombres.length} archivos borrados (${mb(huerfanos.bytes)})`);
      setHuerfanos(null);
    } catch {
      setToast("No se pudieron borrar todos los archivos");
    } finally {
      setLimpiando(false);
    }
  };

  /* ---------- Operadores ---------- */
  const cargarOperadores = async () => {
    const { data } = await supabase
      .from("operadores").select("*, eventos(nombre)").order("created_at", { ascending: false });
    setOperadores(data || []);
    setOpsSel([]);
  };

  const borrarOps = async () => {
    if (!opsSel.length || !window.confirm(`¿Eliminar ${opsSel.length} registro(s)?`)) return;
    await supabase.from("operadores").delete().in("id", opsSel);
    setToast("Registros eliminados");
    cargarOperadores();
  };

  const exportarOps = async () => {
    if (!operadores.length) { setToast("No hay operadores para exportar"); return; }
    try {
      const XLSX = await cargarXLSX();
      const data = operadores.map((op) => ({
        Nombre: op.nombre,
        RUT: op.rut,
        Fecha: new Date(op.created_at).toLocaleDateString("es-CL"),
        Hora: new Date(op.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        Evento: op.eventos?.nombre || "Evento eliminado",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 26 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Operadores");
      XLSX.writeFile(wb, "operadores_nexopix.xlsx");
      setToast(`${operadores.length} registros exportados`);
    } catch { setToast("No se pudo exportar"); }
  };

  /* ---------- VERIFICANDO SESIÓN ---------- */
  if (verificandoSesion) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  /* ---------- LOGIN (Supabase Auth) ---------- */
  if (!loggedIn) {
    const intentar = async () => {
      if (!email.trim() || !pass) { setError("Escribe tu correo y tu clave"); return; }
      setEntrando(true);
      setError("");
      const { error: errAuth } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });
      setEntrando(false);
      if (errAuth) {
        setError("Correo o clave incorrectos");
        return;
      }
      setPass("");
    };
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="card rise">
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <LogoTitulo titulo="Panel de administración" centrado />
            </div>
            <input className="input" type="email" placeholder="Correo"
              autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input" type="password" placeholder="Clave"
              autoComplete="current-password"
              style={{ marginTop: 10 }}
              value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && intentar()} />
            {error && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }}
              onClick={intentar} disabled={entrando}>
              {entrando ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activos = eventos.filter((e) => !e.evento_cerrado);
  const cerrados = eventos.filter((e) => e.evento_cerrado);
  const listaVisible = verCerrados ? cerrados : activos;

  const opsPorEvento = operadores.reduce((acc, op) => {
    const k = op.evento_id;
    if (!acc[k]) acc[k] = { nombre: op.eventos?.nombre || "Evento eliminado", ops: [] };
    acc[k].ops.push(op);
    return acc;
  }, {});

  // Vista previa de la cotización para el evento que se está creando
  const planNuevo = planPorId(nuevoPlan);
  const invNuevoNum = parseInt(nuevosInvitados, 10) || 0;
  const cuotaNueva = invNuevoNum * planNuevo.fotos;
  const nuevoConEspecial = tieneEspecialContenido(nuevoContenido);
  const motorNuevoVista = tierConEspecial(nuevoMotor, nuevoConEspecial);

  return (
    <div style={{ padding: "20px 16px 60px", maxWidth: 900, margin: "0 auto" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {qrModal && (
        <Modal titulo={qrModal.nombre} onClose={() => setQrModal(null)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ background: "#fff", padding: 16, borderRadius: 14, display: "inline-block", marginBottom: 18 }}>
              <QRCodeSVG value={urlsDe(qrModal.slug).subir} size={230} bgColor="#ffffff" fgColor="#0a0a0f" level="H" />
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, wordBreak: "break-all" }}>
              {urlsDe(qrModal.slug).subir}
            </div>
            <button className="btn btn-ghost btn-block"
              onClick={() => copiar(urlsDe(qrModal.slug).subir, "Enlace")}>
              <Icon.Copy size={15} /> Copiar enlace
            </button>
          </div>
        </Modal>
      )}

      <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <LogoTitulo titulo="Panel de administración" />
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>
            {dolar.oficial
              ? `Dólar observado hoy: ${clp(dolar.valor)} (mindicador.cl)`
              : `Dólar referencial: ${clp(dolar.valor)} (no se pudo obtener el del día)`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={cargarEventos} title="Actualizar estado">
            <Icon.Refresh size={16} /> Actualizar
          </button>
          {!mostrarCrear && (
            <button className="btn btn-primary btn-sm" onClick={() => setMostrarCrear(true)}>
              <Icon.Plus size={16} /> Nuevo evento
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={cerrarSesion} title="Cerrar sesión">
            <Icon.Exit size={15} /> Salir
          </button>
        </div>
      </header>

      {/* ===================== CREAR EVENTO (desplegable) ===================== */}
      {mostrarCrear && (
        <div className="card rise" style={{
          marginBottom: 28,
          border: "1px solid var(--magenta)",
          background: "linear-gradient(135deg, rgba(var(--magenta-rgb),0.07), rgba(var(--cyan-rgb),0.03))",
          boxShadow: "0 0 30px rgba(var(--magenta-rgb),0.10)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 4 }}>Crear evento</div>
              <div className="display" style={{ fontSize: 18 }}>Nuevo evento</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={cancelarCrear}>Cancelar</button>
          </div>

          <label className="label">Nombre del evento *</label>
          <input className="input"
            placeholder="Boda Paola y Javier"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)} />
          {nuevoNombre.trim() && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>
              Dirección: /subir/{generarSlug(nuevoNombre)}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label className="label">Contenido IA</label>
            <SelectorPills opciones={OPCIONES_CONTENIDO} valor={nuevoContenido}
              onChange={setNuevoContenido} destacado={nuevoConEspecial ? nuevoContenido : null} />
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
              {DETALLE_CONTENIDO[nuevoContenido]}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label className="label">Modelo de generación (tier)</label>
            <SelectorPills opciones={TIERS} valor={motorNuevoVista}
              onChange={(m) => {
                if (nuevoConEspecial && m === "base") {
                  setToast(MENSAJE_BLOQUEO_ESPECIAL);
                  return;
                }
                setNuevoMotor(m);
              }}
              destacado="premium" />
            <div style={{ fontSize: 11, color: nuevoConEspecial ? "var(--magenta)" : "var(--text-faint)", marginTop: 6 }}>
              {nuevoConEspecial
                ? "Con Especial el mínimo es Pro. Puedes elegir Pro o Premium."
                : DETALLE_TIER[motorNuevoVista]}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label className="label">Plan de fotos por persona</label>
            <SelectorPills opciones={OPCIONES_PLAN} valor={nuevoPlan} onChange={setNuevoPlan} />
          </div>

          <div style={{ marginTop: 14 }}>
            <label className="label">N° aproximado de invitados *</label>
            <input className="input" type="number" min="1"
              placeholder="Ej: 100"
              value={nuevosInvitados}
              onChange={(e) => setNuevosInvitados(e.target.value)} />
          </div>

          {cuotaNueva > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Cotizacion
                cuota={cuotaNueva}
                extra={0}
                invitados={invNuevoNum}
                fotosPorPersona={planNuevo.fotos}
                tier={motorNuevoVista}
                costos={costos}
                dolar={dolar.valor}
              />
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
              Ingresa los invitados para ver la cuota y la cotización.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={cancelarCrear} disabled={creando}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={crearEvento} disabled={creando}>
              <Icon.Plus size={16} /> {creando ? "Creando..." : "Crear evento"}
            </button>
          </div>
        </div>
      )}

      {/* ===================== TUS EVENTOS ===================== */}
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Tus eventos</div>
        <div className="display" style={{ fontSize: 20 }}>
          {verCerrados ? "Eventos cerrados" : "Eventos en vivo"}
        </div>
      </div>

      {/* Conmutador activos / cerrados */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[[false, `En vivo (${activos.length})`], [true, `Cerrados (${cerrados.length})`]].map(([val, label]) => (
          <button key={String(val)} onClick={() => setVerCerrados(val)}
            style={{
              cursor: "pointer", padding: "8px 16px", borderRadius: 100, fontSize: 13,
              fontFamily: "var(--font-body)", fontWeight: 500,
              background: verCerrados === val ? "var(--tint-cyan)" : "transparent",
              border: `1px solid ${verCerrados === val ? "rgba(var(--cyan-rgb),0.22)" : "var(--border)"}`,
              color: verCerrados === val ? "var(--cyan)" : "var(--text-dim)",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Lista de eventos */}
      {cargando ? (
        <div className="card"><Vacio titulo="Cargando eventos..." /></div>
      ) : listaVisible.length === 0 ? (
        <div className="card">
          <Vacio icono="screen"
            titulo={verCerrados ? "Sin eventos cerrados" : "Sin eventos en vivo"}
            detalle={verCerrados ? "Los eventos que cierres aparecen acá." : "Toca \"Nuevo evento\" para crear el primero."} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listaVisible.map((ev) => {
            const c = conteos[ev.id] || { total: 0, pending: 0, approved: 0, rejected: 0 };
            const abierto = expandido === ev.id;
            const urls = urlsDe(ev.slug);
            const camposEd = editando[ev.id] || {};
            const tierEv = tierNormalizado(ev.motor_ia);
            const contenidoEv = ev.contenido_ia || "grilla";
            const tieneEspecial = tieneEspecialContenido(contenidoEv);
            const tierCot = tierConEspecial(tierEv, tieneEspecial);

            const planVista = planPorId(camposEd.plan ?? ev.cuota_plan);
            const planGuardado = planPorId(ev.cuota_plan);
            const extra = calcularExtra(ev);
            const invitadosVista = camposEd.invitados ?? (ev.invitados ?? "");
            const invNum = parseInt(invitadosVista, 10) || 0;
            const cuotaVista = invNum ? invNum * planVista.fotos + extra : (ev.cuota_ia || 0);
            const sugerencias = sugerenciasCuota(ev);

            return (
              <div key={ev.id} className="card">
                {/* Cabecera del evento */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="display" style={{ fontSize: 18 }}>{ev.nombre}</span>
                      <span className={`chip ${ev.evento_cerrado ? "chip-danger" : "chip-ok"}`}>
                        <span className={`dot ${ev.evento_cerrado ? "dot-closed" : "dot-live"}`} />
                        {ev.evento_cerrado ? "Cerrado" : "En vivo"}
                      </span>
                      {tierEv === "pro" && (
                        <span className="chip" style={{ color: "var(--cyan)", borderColor: "var(--cyan)" }}>
                          Pro
                        </span>
                      )}
                      {tierEv === "premium" && (
                        <span className="chip" style={{ color: "var(--magenta)", borderColor: "var(--magenta)" }}>
                          Premium
                        </span>
                      )}
                      {tieneEspecial && (
                        <span className="chip" style={{ color: "#fff", borderColor: "var(--magenta)", background: "rgba(var(--magenta-rgb),0.18)" }}>
                          {contenidoEv === "solo_especial" ? "Solo Especial" : "Especial"}
                        </span>
                      )}
                      <span className="chip">{planGuardado.nombre}</span>
                      {!ev.cuota_ia && (
                        <span className="chip chip-warn">Sin cuota</span>
                      )}
                      {c.pending > 0 && !ev.evento_cerrado && (
                        <span className="chip chip-warn">{c.pending} por revisar</span>
                      )}
                      {ev.ia_habilitada === false && (
                        <span className="chip chip-danger">IA desactivada</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                      /{ev.slug} · clave {ev.evento_cerrado ? "expirada" : ev.clave_operador}
                      {ev.cuota_ia ? ` · cuota ${ev.cuota_ia} fotos IA` : " · define los invitados para fijar la cuota"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setQrModal(ev)}>
                      <Icon.QR size={15} /> QR
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirExpandido(ev)}>
                      <Icon.Settings size={15} />
                    </button>
                  </div>
                </div>

                {/* Conteos */}
                <div className="grid-stats" style={{ marginTop: 16 }}>
                  <Stat label="Total" value={c.total} color="var(--cyan)" />
                  <Stat label="Aprobadas" value={c.approved} color="var(--ok)" />
                  <Stat label="En espera" value={c.pending} color="var(--warn)" />
                </div>

                {/* Contador de IA usadas */}
                {ev.ia_habilitada !== false && (
                  <ContadorIA usadas={ev.ia_usadas || 0} cuota={ev.cuota_ia} />
                )}

                {/* Panel expandido */}
                {abierto && (
                  <div className="rise" style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                    {/* Configuración */}
                    <div className="label">Configuración</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      <div>
                        <label className="label">Nombre del evento</label>
                        <input
                          className="input"
                          value={editando[ev.id]?.nombre ?? ev.nombre}
                          onChange={(e) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], nombre: e.target.value },
                          }))}
                          placeholder="Nombre del evento"
                        />
                      </div>
                      <div>
                        <label className="label">Clave del operador</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            className="input"
                            value={editando[ev.id]?.clave ?? ev.clave_operador}
                            onChange={(e) => setEditando((prev) => ({
                              ...prev,
                              [ev.id]: { ...prev[ev.id], clave: e.target.value },
                            }))}
                            placeholder="Clave"
                            style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => copiar(editando[ev.id]?.clave ?? ev.clave_operador, "Clave")}
                            title="Copiar clave"
                          >
                            <Icon.Copy size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => regenerarClave(ev)}
                            title="Generar clave nueva"
                          >
                            <Icon.Refresh size={14} />
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          El botón de refrescar genera una clave nueva y expira las sesiones activas.
                        </div>
                      </div>

                      {/* --- Contenido IA (Especial) --- */}
                      <div>
                        <label className="label">Contenido IA</label>
                        <SelectorPills opciones={OPCIONES_CONTENIDO} valor={contenidoEv}
                          onChange={(valor) => cambiarContenido(ev, valor)}
                          destacado={tieneEspecial ? contenidoEv : null} />
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          {DETALLE_CONTENIDO[contenidoEv]} Se guarda al tocarlo.
                        </div>
                        {tieneEspecial && (
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                            marginTop: 10, padding: "10px 12px", borderRadius: "var(--r-sm)",
                            border: "1px solid var(--magenta)", background: "rgba(var(--magenta-rgb),0.06)", flexWrap: "wrap",
                          }}>
                            <div style={{ fontSize: 13, color: "var(--text)" }}>
                              {ev.especial_label
                                ? <>Tarjeta: <b>{ev.especial_label}</b></>
                                : "Falta configurar el Especial"}
                              {!ev.especial_prompt && (
                                <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 3 }}>
                                  Sin prompt: el Especial no funcionará hasta configurarlo.
                                </div>
                              )}
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => abrirEspecial(ev)}>
                              <Icon.Settings size={14} /> Configurar Especial
                            </button>
                          </div>
                        )}
                      </div>

                      {/* --- Tier contratado --- */}
                      <div>
                        <label className="label">Modelo de generación (tier)</label>
                        <SelectorPills opciones={TIERS} valor={tierEv}
                          onChange={(motor) => cambiarTier(ev, motor)} destacado="premium" />
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          {DETALLE_TIER[tierEv]}
                          {tieneEspecial ? " Con Especial el mínimo es Pro." : ""}
                          {" "}Se guarda al tocarlo.
                        </div>
                      </div>

                      {/* --- Plan de fotos --- */}
                      <div>
                        <label className="label">Plan de fotos por persona</label>
                        <SelectorPills
                          opciones={OPCIONES_PLAN}
                          valor={planVista.id}
                          onChange={(id) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], plan: id },
                          }))}
                        />
                      </div>

                      {/* --- Invitados --- */}
                      <div>
                        <label className="label">N° aproximado de invitados *</label>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          value={invitadosVista}
                          onChange={(e) => setEditando((prev) => ({
                            ...prev,
                            [ev.id]: { ...prev[ev.id], invitados: e.target.value },
                          }))}
                          placeholder="Ej: 100"
                        />
                      </div>

                      {/* --- Cuota y cotización --- */}
                      {cuotaVista ? (
                        <Cotizacion
                          cuota={cuotaVista}
                          extra={extra}
                          invitados={invNum}
                          fotosPorPersona={planVista.fotos}
                          tier={tierCot}
                          costos={costos}
                          dolar={dolar.valor}
                        />
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          Ingresa el número de invitados para calcular la cuota y la cotización.
                        </div>
                      )}

                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => guardarConfig(ev)}
                        disabled={guardando === ev.id}
                        style={{ marginTop: 4 }}
                      >
                        {guardando === ev.id ? "Guardando..." : "Guardar cambios"}
                      </button>

                      {/* --- Agregar cuota (se guarda al tiro) --- */}
                      <div style={{ marginTop: 8 }}>
                        <label className="label">Agregar cuota extra</label>
                        {ev.cuota_ia ? (
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
                            Cuota actual: {ev.cuota_ia} fotos · usadas {ev.ia_usadas || 0}
                          </div>
                        ) : null}

                        {sugerencias.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                            {sugerencias.map((s) => (
                              <button
                                key={s.n}
                                onClick={() => agregarSugerencia(ev, s.n)}
                                style={{
                                  flex: 1, minWidth: 140, cursor: "pointer", textAlign: "left",
                                  padding: "10px 12px", borderRadius: "var(--r-sm)",
                                  background: "var(--bg)", border: "1px solid var(--border)",
                                  fontFamily: "var(--font-body)",
                                }}
                              >
                                <div style={{ fontSize: 13, color: "var(--cyan)", fontWeight: 600 }}>
                                  {s.etiqueta}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text)", marginTop: 3 }}>
                                  +{s.n} fotos · total {(ev.cuota_ia || 0) + s.n}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                                  ~{clp(precioSugerido(s.n, tierCot, dolar.valor, costos))} con IVA
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            className="input"
                            type="number"
                            min="1"
                            value={extraInput[ev.id] ?? ""}
                            onChange={(e) => setExtraInput((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                            placeholder="Otra cantidad"
                          />
                          <button className="btn btn-ghost btn-sm" onClick={() => agregarCuota(ev)}>
                            <Icon.Plus size={14} /> Agregar
                          </button>
                        </div>
                        {parseInt(extraInput[ev.id], 10) > 0 && (
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
                            Total {(ev.cuota_ia || 0) + parseInt(extraInput[ev.id], 10)} · ~
                            {clp(precioSugerido(parseInt(extraInput[ev.id], 10), tierCot, dolar.valor, costos))} con IVA
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          Suma fotos a la cuota actual sin reemplazarla. Úsalo para vender extensiones durante el evento.
                        </div>
                      </div>

                      {/* --- Reiniciar contador (doble confirmación) --- */}
                      <div style={{ marginTop: 8 }}>
                        <label className="label">Contador de IA</label>
                        {confirmarReinicio === ev.id ? (
                          <div style={{
                            padding: 12, border: "1px solid var(--danger)",
                            borderRadius: "var(--r-sm)", background: "var(--bg)",
                          }}>
                            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, marginBottom: 10 }}>
                              ¿Seguro? El evento recupera toda su cuota
                              ({ev.cuota_ia || TOPE_SEGURIDAD_SIN_CUOTA} fotos). Úsalo solo para pruebas.
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                                onClick={() => setConfirmarReinicio(null)}>
                                Cancelar
                              </button>
                              <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                                onClick={() => reiniciarContador(ev)}>
                                Sí, reiniciar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmarReinicio(ev.id)}>
                            <Icon.Refresh size={14} /> Reiniciar contador ({ev.ia_usadas || 0} usadas)
                          </button>
                        )}
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                          Solo para pruebas. Para vender más fotos usa "Agregar cuota extra".
                        </div>
                      </div>

                      {/* --- Interruptor de FUNfoto IA --- */}
                      <Fila
                        titulo="FUNfoto IA"
                        detalle={ev.ia_habilitada === false
                          ? "Desactivada: el botón no aparece para los invitados"
                          : "Activada: los invitados pueden generar fotos con IA"}
                        activo={ev.ia_habilitada !== false}
                        onToggle={() => actualizar(ev, { ia_habilitada: ev.ia_habilitada === false },
                          ev.ia_habilitada === false ? "IA activada" : "IA desactivada")}
                      />
                    </div>

                    {/* Enlaces */}
                    <div className="label">Enlaces del evento</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {[["Asistente", urls.subir], ["Operador", urls.operador], ["Pantalla", urls.pantalla]].map(([nom, u]) => (
                        <button key={nom} onClick={() => copiar(u, nom)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                            padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)",
                            borderRadius: "var(--r-sm)", cursor: "pointer", textAlign: "left", width: "100%",
                            fontFamily: "var(--font-body)",
                          }}>
                          <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 70 }}>{nom}</span>
                          <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.replace(window.location.origin, "")}
                          </span>
                          <Icon.Copy size={14} color="var(--text-faint)" />
                        </button>
                      ))}
                    </div>

                    {/* Controles: distintos según estado */}
                    {ev.evento_cerrado ? (
                      <>
                        <div className="label">Acciones</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button className="btn btn-primary btn-block" onClick={() => descargarFotos(ev)}>
                            <Icon.Download size={15} /> Descargar fotos aprobadas ({conteos[ev.id]?.approved || 0})
                          </button>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => alternarCerrado(ev)}>
                              <Icon.Unlock size={14} /> Reabrir evento
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => borrarFotos(ev)}>
                              <Icon.Trash size={14} /> Borrar fotos
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => eliminarEvento(ev)}>
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="label">Controles</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Fila
                            titulo="Descarga de fotos"
                            detalle="El operador puede bajar las fotos aprobadas"
                            activo={ev.descarga_habilitada}
                            onToggle={() => actualizar(ev, { descarga_habilitada: !ev.descarga_habilitada },
                              ev.descarga_habilitada ? "Descarga desactivada" : "Descarga activada")}
                          />
                          <Fila
                            titulo={ev.evento_cerrado ? "Evento cerrado" : "Evento en vivo"}
                            detalle={ev.evento_cerrado
                              ? "Al reabrir se genera una clave nueva"
                              : "Al cerrar expira la clave y se cierran las sesiones"}
                            activo={ev.evento_cerrado}
                            onToggle={() => alternarCerrado(ev)}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => descargarFotos(ev)}>
                            <Icon.Download size={14} /> Descargar
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => borrarFotos(ev)}>
                            <Icon.Trash size={14} /> Borrar fotos
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => eliminarEvento(ev)}>
                            Eliminar evento
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Precios de IA */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon.Settings size={17} color="var(--text-dim)" />
            <span className="display" style={{ fontSize: 16 }}>Precios de IA</span>
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => window.open(URL_PRECIOS_WAVESPEED, "_blank", "noopener,noreferrer")}>
            Ver precios en WaveSpeed
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 14 }}>
          <div>
            <label className="label">Base (Seedream 5) · US$ por foto</label>
            <input className="input" type="number" step="0.001" min="0"
              value={costosEdit.base}
              onChange={(e) => setCostosEdit((p) => ({ ...p, base: e.target.value }))} />
          </div>
          <div>
            <label className="label">Pro (GPT Image 2.5 Flare) · US$ por foto</label>
            <input className="input" type="number" step="0.001" min="0"
              value={costosEdit.pro}
              onChange={(e) => setCostosEdit((p) => ({ ...p, pro: e.target.value }))} />
          </div>
          <div>
            <label className="label">Premium (GPT Image 2) · US$ por foto</label>
            <input className="input" type="number" step="0.001" min="0"
              value={costosEdit.premium}
              onChange={(e) => setCostosEdit((p) => ({ ...p, premium: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
            Se usan en todas las cotizaciones y en el registro de costos de cada foto.
            En Pro conviene usar el costo con 2 imágenes (US$0,054) para no quedarse corto.
            {costosActualizado
              ? ` Última actualización: ${new Date(costosActualizado).toLocaleDateString("es-CL")}.`
              : ""}
          </div>
          <button className="btn btn-primary btn-sm" onClick={guardarCostos} disabled={guardandoCostos}>
            {guardandoCostos ? "Guardando..." : "Guardar precios"}
          </button>
        </div>
      </div>

      {/* Mantenimiento del almacenamiento */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon.Trash size={17} color="var(--text-dim)" />
            <span className="display" style={{ fontSize: 16 }}>Limpiar almacenamiento</span>
          </div>
          {!huerfanos && (
            <button className="btn btn-ghost btn-sm" onClick={buscarHuerfanos} disabled={buscandoHuerfanos}>
              {buscandoHuerfanos ? "Buscando..." : "Buscar archivos huérfanos"}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
          Busca archivos que no pertenecen a ninguna foto ni a un Especial (por ejemplo, selfies originales
          usadas para la IA) con más de {HORAS_MINIMAS_HUERFANO} horas. No lo uses en medio de un evento de varios días.
        </div>
        {huerfanos && (
          <div style={{
            marginTop: 14, padding: 12, border: "1px solid var(--danger)",
            borderRadius: "var(--r-sm)", background: "var(--bg)",
          }}>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, marginBottom: 10 }}>
              Se encontraron {huerfanos.nombres.length} archivos huérfanos ({mb(huerfanos.bytes)}).
              ¿Borrarlos? No se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                onClick={() => setHuerfanos(null)} disabled={limpiando}>
                Cancelar
              </button>
              <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                onClick={limpiarHuerfanos} disabled={limpiando}>
                {limpiando ? "Borrando..." : "Sí, borrar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial de operadores */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon.User size={17} color="var(--text-dim)" />
            <span className="display" style={{ fontSize: 16 }}>Operadores registrados</span>
          </div>
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setVerOps(!verOps); if (!verOps) cargarOperadores(); }}>
            {verOps ? "Ocultar" : "Ver registros"}
          </button>
        </div>

        {verOps && (
          <div style={{ marginTop: 16 }}>
            {operadores.length === 0 ? (
              <Vacio icono="inbox" titulo="Sin registros" detalle="Los operadores que se registren aparecen acá." />
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setOpsSel((s) => s.length === operadores.length ? [] : operadores.map((o) => o.id))}>
                    {opsSel.length === operadores.length ? "Quitar selección" : "Seleccionar todo"}
                  </button>
                  {opsSel.length > 0 && (
                    <button className="btn btn-danger btn-sm" onClick={borrarOps}>
                      <Icon.Trash size={14} /> Eliminar ({opsSel.length})
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={exportarOps}>
                    <Icon.Sheet size={14} /> Exportar Excel
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {Object.entries(opsPorEvento).map(([eid, grupo]) => (
                    <div key={eid}>
                      <div className="eyebrow" style={{ color: "var(--magenta)", marginBottom: 8 }}>
                        {grupo.nombre} · {grupo.ops.length}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {grupo.ops.map((op) => {
                          const sel = opsSel.includes(op.id);
                          return (
                            <button key={op.id}
                              onClick={() => setOpsSel((s) => s.includes(op.id) ? s.filter((x) => x !== op.id) : [...s, op.id])}
                              style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                                padding: "10px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
                                background: sel ? "var(--tint-cyan)" : "var(--bg)",
                                border: `1px solid ${sel ? "rgba(var(--cyan-rgb),0.3)" : "var(--border)"}`,
                                textAlign: "left", width: "100%", fontFamily: "var(--font-body)",
                              }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                                <span style={{
                                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                  border: sel ? "none" : "1px solid var(--border-strong)",
                                  background: sel ? "var(--cyan)" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {sel && <Icon.Check size={13} color="#0a0a0f" />}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 14, color: "var(--text)" }}>{op.nombre}</div>
                                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{op.rut}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "right", flexShrink: 0 }}>
                                {new Date(op.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                                <br />
                                {new Date(op.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Barra de IA usadas / cuota. Se pone roja desde el 75%. */
function ContadorIA({ usadas, cuota }) {
  const conCuota = cuota !== null && cuota !== undefined && cuota > 0;
  const tope = conCuota ? cuota : TOPE_SEGURIDAD_SIN_CUOTA;
  const pct = Math.min(100, Math.round((usadas / tope) * 100));
  const alerta = pct >= 75;
  const color = alerta ? "var(--danger)" : "var(--cyan)";
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span style={{ color: "var(--text-dim)" }}>IA usadas</span>
        <span style={{ color, fontWeight: 600 }}>
          {usadas} / {tope}{conCuota ? "" : " (tope de seguridad)"}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 100, background: "var(--border)", marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

/* Cuadro de cuota y cotización (se usa al crear y al editar un evento) */
function Cotizacion({ cuota, extra, invitados, fotosPorPersona, tier, costos, dolar }) {
  const costoPorFoto = costoDeTier(tier, costos);
  const costoUsd = cuota * costoPorFoto;
  const costoClp = costoUsd * dolar;
  const precioNeto = costoClp * FACTOR_UTILIDAD;
  const ivaClp = precioNeto * TASA_IVA;
  const precioTotal = precioNeto + ivaClp;

  return (
    <div style={{
      padding: 12, background: "var(--bg)",
      border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    }}>
      <FilaMonto etiqueta="Cuota de fotos IA" valor={`${cuota} fotos`} color="var(--cyan)" />
      {extra > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", margin: "-2px 0 6px" }}>
          Incluye {extra} fotos extra agregadas a mano.
        </div>
      )}
      <FilaMonto etiqueta="Costo máximo IA" valor={`${clp(costoClp)} (US$${costoUsd.toFixed(2)})`} />
      <div style={{ borderTop: "1px dashed var(--border)", margin: "8px 0" }} />
      <FilaMonto etiqueta="Precio neto (+40%)" valor={clp(precioNeto)} />
      <FilaMonto etiqueta="IVA (19%)" valor={clp(ivaClp)} />
      <FilaMonto etiqueta="Total sugerido" valor={clp(precioTotal)} color="var(--ok)" fuerte />
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
        Negocia entre el costo máximo y el total. Cálculo: {invitados || "?"} invitados x {fotosPorPersona} fotos
        {extra > 0 ? ` + ${extra} extra` : ""}, a US${costoPorFoto} por foto (tier {NOMBRE_TIER[tier] || tier}), dólar {clp(dolar)}.
        {" "}Solo cubre el costo de IA, no el arriendo de la pantalla.
      </div>
    </div>
  );
}

/* Selector de pastillas (tier, contenido o plan de fotos) */
function SelectorPills({ opciones, valor, onChange, destacado }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {opciones.map((o) => {
        const activo = valor === o.id;
        const esDestacado = destacado && o.id === destacado;
        const colorActivo = esDestacado ? "var(--magenta)" : "var(--cyan)";
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1, minWidth: 90, cursor: "pointer", padding: "10px 12px", borderRadius: 100, fontSize: 13,
              fontFamily: "var(--font-body)", fontWeight: 500,
              background: activo ? (esDestacado ? "rgba(var(--magenta-rgb),0.12)" : "var(--tint-cyan)") : "transparent",
              border: `1px solid ${activo ? colorActivo : "var(--border)"}`,
              color: activo ? colorActivo : "var(--text-dim)",
            }}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}

/* Fila de monto dentro de la cotización */
function FilaMonto({ etiqueta, valor, color, fuerte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: "var(--text-dim)" }}>{etiqueta}</span>
      <span style={{ color: color || "var(--text)", fontWeight: fuerte ? 600 : 400 }}>{valor}</span>
    </div>
  );
}

/* Fila con interruptor */
function Fila({ titulo, detalle, activo, onToggle }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
      padding: "12px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text)" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.5 }}>{detalle}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={activo}
        aria-label={titulo}
        style={{
          width: 44, height: 25, borderRadius: 100, flexShrink: 0, cursor: "pointer",
          border: "none", padding: 0, position: "relative",
          background: activo ? "var(--cyan)" : "var(--border-strong)",
          transition: "background 0.18s ease",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: activo ? 22 : 3,
          width: 19, height: 19, borderRadius: "50%", background: "#fff",
          transition: "left 0.18s ease",
        }} />
      </button>
    </div>
  );
}