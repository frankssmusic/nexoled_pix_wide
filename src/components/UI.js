import { useEffect } from "react";
import Icon from "./Icons";

/* Logo selfiA en monocromo (oct 2026).
   "self" y "A" son las letras de la tipografía Syne ExtraBold convertidas a
   trazos vectoriales (no dependen de que cargue la fuente). La "i" es una
   personita: el punto es la cabeza y el bracito sostiene un teléfono.
   Usa el color del texto (var(--text)), así se adapta al fondo. */
const SELFIA_VIEWBOX = "30 -815 4500 840";
const SELFIA_PROPORCION = 4500 / 840;
const SELFIA_LETRAS =
  "M40 -176H261Q275 -150 314 -140Q354 -130 428 -130Q485 -130 512 -136Q540 -142 548 -152Q557 -162 557 -173Q557 -190 538 -196Q520 -203 476 -204Q432 -206 355 -206Q282 -206 224 -212Q167 -219 127 -234Q87 -248 66 -274Q45 -300 45 -339Q45 -387 76 -420Q107 -452 160 -470Q213 -489 282 -497Q352 -505 428 -505Q554 -505 634 -480Q714 -454 752 -411Q790 -368 789 -314H574Q563 -340 532 -350Q502 -360 428 -360Q358 -360 326 -350Q295 -339 295 -316Q295 -301 310 -294Q326 -286 370 -283Q413 -280 497 -280Q555 -280 610 -276Q666 -272 710 -259Q755 -246 781 -219Q807 -192 807 -145Q807 -88 760 -52Q714 -17 629 -1Q544 15 428 15Q327 15 258 2Q188 -11 144 -32Q100 -54 76 -80Q53 -105 46 -130Q38 -156 40 -176Z " +
  "M1543 -176H1779Q1770 -118 1722 -75Q1673 -32 1580 -8Q1488 15 1345 15Q1194 15 1084 -9Q975 -33 916 -90Q857 -147 857 -244Q857 -340 914 -398Q972 -455 1081 -480Q1190 -505 1345 -505Q1497 -505 1594 -478Q1691 -451 1737 -390Q1783 -330 1781 -227H1101Q1106 -201 1130 -179Q1153 -157 1202 -144Q1252 -130 1335 -130Q1421 -130 1476 -142Q1532 -154 1543 -176ZM1335 -360Q1229 -360 1174 -337Q1118 -314 1108 -291H1548Q1541 -317 1492 -338Q1443 -360 1335 -360Z " +
  "M1856 -690H2096V0H1856Z " +
  "M2156 -460H2790V-310H2156ZM2559 -690H2790V-530H2659Q2619 -531 2598 -526Q2576 -521 2568 -506Q2559 -491 2559 -460V0H2319V-510Q2319 -570 2342 -610Q2364 -650 2416 -670Q2469 -690 2559 -690Z " +
  "M3604 -97V-247H4288V-97ZM3380 0 3809 -640H4087L4520 0H4245L3874 -573H4023L3655 0Z";

/* Dibujo del logo. El tamaño lo define el estilo que recibe. */
function SelfiaSVG({ style }) {
  return (
    <svg
      viewBox={SELFIA_VIEWBOX}
      role="img"
      aria-label="selfiA"
      style={{ display: "block", color: "var(--text)", ...style }}
    >
      <g fill="currentColor">
        <path d={SELFIA_LETRAS} />
        {/* La "i" personita: cuerpo, cabeza, brazo y teléfono */}
        <rect x="2930" y="-500" width="180" height="500" rx="40" />
        <circle cx="3020" cy="-680" r="110" />
        <line x1="3090" y1="-400" x2="3240" y2="-590"
          stroke="currentColor" strokeWidth="70" strokeLinecap="round" />
        <rect x="3200" y="-780" width="110" height="190" rx="25"
          transform="rotate(18 3255 -685)" />
      </g>
    </svg>
  );
}

/* Logo de tamaño fijo. "size" define el alto (alto = size x 2 píxeles).
   "sub" se mantiene por compatibilidad, pero ya no muestra texto extra. */
// eslint-disable-next-line no-unused-vars
export function Logo({ size = 22, sub = true }) {
  const alto = Math.round(size * 2);
  return (
    <div style={{ lineHeight: 1, display: "inline-flex", flexShrink: 0 }}>
      <SelfiaSVG style={{
        height: alto, width: Math.round(alto * SELFIA_PROPORCION), maxWidth: "80vw",
      }} />
    </div>
  );
}

/* Logo + título: el logo mide exactamente lo mismo de ancho que el título.
   Truco: la caja del logo tiene ancho 0 (no empuja) y ancho mínimo 100%,
   así el ancho lo define solo el texto y el logo se estira a ese ancho. */
export function LogoTitulo({ titulo, centrado = false }) {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column",
      alignItems: centrado ? "center" : "flex-start", maxWidth: "100%",
    }}>
      <div style={{ width: 0, minWidth: "100%" }}>
        <SelfiaSVG style={{ width: "100%", height: "auto", aspectRatio: `${SELFIA_PROPORCION}` }} />
      </div>
      <div className="eyebrow" style={{ marginTop: 8, whiteSpace: "nowrap" }}>
        {titulo}
      </div>
    </div>
  );
}

export function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast" role="status">{msg}</div>;
}

export function Stat({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "14px 10px", textAlign: "center",
    }}>
      <div className="display" style={{ fontSize: 24, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export function Spinner({ texto }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 18,
    }}>
      <div className="spinner" />
      {texto && <div className="eyebrow">{texto}</div>}
    </div>
  );
}

/* Pantalla de estado vacío / error, con acción opcional */
export function Vacio({ icono = "alert", titulo, detalle, children }) {
  const Ico = icono === "alert" ? Icon.Alert : icono === "inbox" ? Icon.Inbox : Icon.Screen;
  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 14,
    }}>
      <Ico size={34} color="var(--text-faint)" />
      <div className="display" style={{ fontSize: 19 }}>{titulo}</div>
      {detalle && (
        <div style={{ color: "var(--text-dim)", fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
          {detalle}
        </div>
      )}
      {children}
    </div>
  );
}

export function Modal({ titulo, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, maxHeight: "85vh", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-lg)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span className="eyebrow">{titulo}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
          >
            <Icon.X size={18} color="var(--text-dim)" />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}