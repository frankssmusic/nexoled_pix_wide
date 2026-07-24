import { useState } from "react";
import { supabase } from "../supabase";
import { ADMIN_PASSWORD, validarRut, OP_TERMS } from "../lib";
import { cargarJSZip } from "../cdn";
import Icon from "../components/Icons";
import { Logo, Toast, Stat, Vacio, Modal } from "../components/UI";

/* Clave de sesión por evento: cada evento guarda su propia sesión */
const authKey = (eventoId) => `op_auth_${eventoId}`;

export default function Operador({ evento, fotos, onRefreshFotos, onUpdateEvento }) {
  const leerSesion = () => {
    if (!evento) return false;
    const guardado = localStorage.getItem(authKey(evento.id));
    if (!guardado) return false;
    try {
      const { sv } = JSON.parse(guardado);
      return sv === (evento.session_version || 1);
    } catch { return false; }
  };

  const [loggedIn, setLoggedIn] = useState(leerSesion);
  const [paso, setPaso] = useState(leerSesion() ? "panel" : "login");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [opNombre, setOpNombre] = useState("");
  const [opRut, setOpRut] = useState("");
  const [seleccion, setSeleccion] = useState([]);
  const [toast, setToast] = useState(null);
  const [filtro, setFiltro] = useState("pending");
  const [descargando, setDescargando] = useState(false);
  const [msgEdit, setMsgEdit] = useState(evento?.mensaje_subida || "Subir foto");
  const [msgGuardado, setMsgGuardado] = useState(true);
  const [verTerminos, setVerTerminos] = useState(false);

  if (!evento) {
    return <Vacio titulo="Evento no encontrado" detalle="Revisa el enlace del panel de operador." />;
  }

  const pendientes = fotos.filter((f) => f.status === "pending");
  const visibles = fotos.filter((f) => f.status === filtro);

  const alternar = (id) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const alternarTodo = () => {
    const ids = pendientes.map((f) => f.id);
    setSeleccion((s) => (s.length === ids.length ? [] : ids));
  };

  const cambiarEstado = async (ids, status) => {
    await supabase.from("fotos").update({ status }).in("id", ids);
    onRefreshFotos();
  };

  const aprobarLote = async () => {
    await cambiarEstado(seleccion, "approved");
    setToast(`${seleccion.length} foto(s) aprobadas`);
    setSeleccion([]);
  };
  const rechazarLote = async () => {
    await cambiarEstado(seleccion, "rejected");
    setToast(`${seleccion.length} foto(s) rechazadas`);
    setSeleccion([]);
  };

  const guardarMensaje = async () => {
    const { error: err } = await supabase
      .from("eventos").update({ mensaje_subida: msgEdit }).eq("id", evento.id);
    if (err) { setToast("No se pudo guardar el mensaje"); return; }
    setToast("Mensaje actualizado");
    setMsgGuardado(true);
    onUpdateEvento({ ...evento, mensaje_subida: msgEdit });
  };

  const descargar = async () => {
    const aprobadas = fotos.filter((f) => f.status === "approved");
    if (aprobadas.length === 0) { setToast("No hay fotos aprobadas todavía"); return; }
    // Verificar en tiempo real que la descarga sigue habilitada
    const { data: evActual } = await supabase.from("eventos").select("descarga_habilitada, evento_cerrado").eq("id", evento.id).single();
    if (!evActual?.descarga_habilitada || evActual?.evento_cerrado) {
      setToast("El administrador deshabilitó la descarga");
      return;
    }
    setDescargando(true);
    try {
      const JSZip = await cargarJSZip();
      const zip = new JSZip();
      for (let i = 0; i < aprobadas.length; i++) {
        const resp = await fetch(aprobadas[i].url);
        const blob = await resp.blob();
        const suf = aprobadas[i].autorizada === false ? "_NO_AUTORIZADA" : "";
        zip.file(`foto_${i + 1}${suf}.jpg`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${evento.slug || "evento"}_fotos.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setToast(`${aprobadas.length} fotos descargadas`);
    } catch {
      setToast("No se pudo generar la descarga");
    } finally {
      setDescargando(false);
    }
  };

  const entrar = () => {
    if (evento.evento_cerrado) {
      setError("Este evento está cerrado. Contacta al administrador.");
      return;
    }
    if (pass === ADMIN_PASSWORD) {
      localStorage.setItem(authKey(evento.id), JSON.stringify({ sv: evento.session_version || 1 }));
      setError(""); setLoggedIn(true); setPaso("panel");
    } else if (pass === evento.clave_operador) {
      setError(""); setPaso("terminos");
    } else {
      setError("Clave incorrecta");
    }
  };

  const registrar = async () => {
    if (!opNombre.trim() || !opRut.trim()) { setError("Completa nombre y RUT"); return; }
    const check = validarRut(opRut);
    if (!check.ok) { setError(check.msg); return; }
    const { error: err } = await supabase.from("operadores").insert({
      evento_id: evento.id, nombre: opNombre.trim(), rut: check.clean,
    });
    if (err) { setError("No se pudo registrar. Inténtalo de nuevo."); return; }
    localStorage.setItem(authKey(evento.id), JSON.stringify({ sv: evento.session_version || 1 }));
    setLoggedIn(true); setPaso("panel");
  };

  const salir = () => {
    localStorage.removeItem(authKey(evento.id));
    setLoggedIn(false); setPaso("login"); setPass("");
  };

  /* ---------- LOGIN ---------- */
  if (!loggedIn && paso === "login") {
    return (
      <Centro>
        <div className="card rise">
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <Logo size={22} sub={false} />
            <div className="eyebrow" style={{ marginTop: 8 }}>Panel de operador</div>
          </div>
          <div className="display" style={{ fontSize: 16, marginBottom: 4 }}>{evento.nombre}</div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 18 }}>
            Ingresa la clave del evento para moderar las fotos.
          </p>
          <input
            className="input"
            type="password"
            placeholder="Clave del evento"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
          />
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={entrar}>
            Entrar
          </button>
        </div>
      </Centro>
    );
  }

  /* ---------- TÉRMINOS ---------- */
  if (!loggedIn && paso === "terminos") {
    return (
      <>
        {verTerminos && (
          <Modal titulo="Términos para operadores" onClose={() => setVerTerminos(false)}>
            <pre style={{
              fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-dim)",
              lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{OP_TERMS}</pre>
          </Modal>
        )}
        <Centro>
          <div className="card rise" style={{ textAlign: "center" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "var(--tint-magenta)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <Icon.Scale size={24} color="var(--magenta)" />
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Antes de continuar</div>
            <h2 className="display" style={{ fontSize: 19, marginBottom: 14 }}>
              Tu responsabilidad como operador
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.65, textAlign: "left", marginBottom: 12 }}>
              Moderas las fotos de este evento. Debes rechazar contenido sexual o explícito,
              imágenes que involucren a menores, y cualquier foto que dañe la honra de una persona.
            </p>
            <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.65, textAlign: "left", marginBottom: 18 }}>
              Tu nombre y RUT quedan registrados como respaldo legal del evento.
            </p>
            <button
              onClick={() => setVerTerminos(true)}
              style={{
                background: "none", border: "none", color: "var(--cyan)", fontSize: 13,
                cursor: "pointer", textDecoration: "underline", marginBottom: 18,
                fontFamily: "var(--font-body)",
              }}
            >
              Leer términos completos
            </button>
            <button className="btn btn-primary btn-block" onClick={() => setPaso("registro")}>
              Acepto y continúo
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }}
              onClick={() => { setPaso("login"); setPass(""); setError(""); }}>
              Volver
            </button>
          </div>
        </Centro>
      </>
    );
  }

  /* ---------- REGISTRO ---------- */
  if (!loggedIn && paso === "registro") {
    return (
      <Centro>
        <div className="card rise">
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Logo size={22} sub={false} />
            <div className="eyebrow" style={{ marginTop: 8 }}>Registro de operador</div>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
            Registramos tus datos como respaldo legal del evento.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="label">Nombre completo</label>
              <input className="input" placeholder="Juan Pérez González"
                value={opNombre} onChange={(e) => setOpNombre(e.target.value)} />
            </div>
            <div>
              <label className="label">RUT</label>
              <input className="input" placeholder="12345678-9"
                value={opRut} onChange={(e) => setOpRut(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && registrar()} />
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                Sin puntos, con guión.
              </div>
            </div>
          </div>
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={registrar}>
            Registrarme y entrar
          </button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }}
            onClick={() => { setPaso("login"); setPass(""); setError(""); }}>
            Volver
          </button>
        </div>
      </Centro>
    );
  }

  /* ---------- PANEL ---------- */
  return (
    <div style={{ padding: 16, maxWidth: 940, margin: "0 auto" }}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 22, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <Logo size={17} sub={false} />
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>{evento.nombre}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`chip ${evento.evento_cerrado ? "chip-danger" : "chip-ok"}`}>
            <span className={`dot ${evento.evento_cerrado ? "dot-closed" : "dot-live"}`} />
            {evento.evento_cerrado ? "Cerrado" : "En vivo"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onRefreshFotos} aria-label="Actualizar">
            <Icon.Refresh size={15} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={salir}>
            <Icon.Exit size={15} /> Salir
          </button>
        </div>
      </header>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <Stat label="En espera" value={pendientes.length} color="var(--warn)" />
        <Stat label="Aprobadas" value={fotos.filter((f) => f.status === "approved").length} color="var(--ok)" />
        <Stat label="Rechazadas" value={fotos.filter((f) => f.status === "rejected").length} color="var(--danger)" />
      </div>

      <div className="card card-tight" style={{ marginBottom: 12 }}>
        <label className="label">Mensaje del botón de subida</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" value={msgEdit} placeholder="Subir foto"
            onChange={(e) => { setMsgEdit(e.target.value); setMsgGuardado(false); }} />
          <button className="btn btn-primary btn-sm" onClick={guardarMensaje} disabled={msgGuardado}>
            Guardar
          </button>
        </div>
      </div>

      {evento.descarga_habilitada && (
        <div className="card card-tight" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary btn-block" onClick={descargar}
            disabled={descargando || fotos.filter((f) => f.status === "approved").length === 0}>
            <Icon.Download size={16} />
            {descargando ? "Preparando…" : "Descargar fotos aprobadas"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["pending", "En espera"], ["approved", "Aprobadas"], ["rejected", "Rechazadas"]].map(([k, label]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`chip ${filtro === k ? "chip-cyan" : ""}`}
            style={{
              cursor: "pointer", padding: "7px 14px", fontSize: 13,
              background: filtro === k ? "var(--tint-cyan)" : "transparent",
              border: `1px solid ${filtro === k ? "rgba(0,229,255,0.22)" : "var(--border)"}`,
              color: filtro === k ? "var(--cyan)" : "var(--text-dim)",
              fontFamily: "var(--font-body)",
            }}>
            {label}
          </button>
        ))}
      </div>

      {filtro === "pending" && pendientes.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={alternarTodo}>
            {seleccion.length === pendientes.length ? "Quitar selección" : "Seleccionar todo"}
          </button>
          {seleccion.length > 0 && (
            <>
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{seleccion.length} seleccionadas</span>
              <button className="btn btn-ok btn-sm" onClick={aprobarLote}>
                <Icon.Check size={14} /> Aprobar
              </button>
              <button className="btn btn-danger btn-sm" onClick={rechazarLote}>
                <Icon.X size={14} /> Rechazar
              </button>
            </>
          )}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="card">
          <Vacio icono="inbox" titulo="Nada por aquí"
            detalle={filtro === "pending" ? "Cuando alguien suba una foto, aparece acá." : "No hay fotos en esta categoría."} />
        </div>
      ) : (
        <div className="grid-photos">
          {visibles.map((foto) => {
            const sel = seleccion.includes(foto.id);
            return (
              <div key={foto.id}
                onClick={() => filtro === "pending" && alternar(foto.id)}
                style={{
                  borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)",
                  border: `1px solid ${sel ? "var(--cyan)" : "var(--border)"}`,
                  boxShadow: sel ? "0 0 0 3px var(--tint-cyan)" : "none",
                  cursor: filtro === "pending" ? "pointer" : "default",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  position: "relative",
                }}>
                <img src={foto.url} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                {filtro === "pending" && (
                  <div style={{
                    position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%",
                    border: sel ? "none" : "1px solid rgba(255,255,255,0.55)",
                    background: sel ? "var(--cyan)" : "rgba(0,0,0,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {sel && <Icon.Check size={14} color="#0a0a0f" />}
                  </div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className={`chip chip-${foto.status === "pending" ? "warn" : foto.status === "approved" ? "ok" : "danger"}`}>
                      {foto.status === "pending" ? "En espera" : foto.status === "approved" ? "Aprobada" : "Rechazada"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {new Date(foto.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {foto.autorizada === false && (
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                      Sin autorización publicitaria
                    </div>
                  )}
                  {filtro === "pending" && !sel && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button className="btn btn-ok btn-sm" style={{ flex: 1, padding: "8px" }}
                        onClick={(e) => { e.stopPropagation(); cambiarEstado([foto.id], "approved"); setToast("Foto aprobada"); }}>
                        <Icon.Check size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ flex: 1, padding: "8px" }}
                        onClick={(e) => { e.stopPropagation(); cambiarEstado([foto.id], "rejected"); setToast("Foto rechazada"); }}>
                        <Icon.X size={14} />
                      </button>
                    </div>
                  )}
                  {(filtro === "approved" || filtro === "rejected") && (
                    <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 10 }}
                      onClick={(e) => { e.stopPropagation(); cambiarEstado([foto.id], "pending"); setToast("Enviada a revisión"); }}>
                      <Icon.Undo size={14} /> Revertir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Centro({ children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>{children}</div>
    </div>
  );
}

function ErrorMsg({ children }) {
  return (
    <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}