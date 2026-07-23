/* ==========================================================
   ICONOS — SVG inline, trazo 1.5–2 como en nexoled.cl
   Reemplazan los emojis de NexoPix normal.
   Uso: <Icon.Camera size={20} color="var(--cyan)" />
   ========================================================== */

const base = (size, color) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

const Icon = {
  Camera: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),

  Check: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}><path d="M20 6L9 17l-5-5" /></svg>
  ),

  X: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}><path d="M18 6L6 18M6 6l12 12" /></svg>
  ),

  Undo: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),

  Download: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),

  Trash: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  ),

  Lock: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),

  Unlock: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),

  User: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),

  Settings: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.3.6.9 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),

  Refresh: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  ),

  Exit: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),

  Screen: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),

  QR: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17.5 20.5v.01" />
    </svg>
  ),

  Link: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),

  Plus: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}><path d="M12 5v14M5 12h14" /></svg>
  ),

  Alert: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),

  Scale: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M12 3v18M8 21h8M3 7l4-4 4 4M3 7l4 6 4-6M13 7l4-4 4 4M13 7l4 6 4-6" />
    </svg>
  ),

  Sheet: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  ),

  Folder: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),

  Inbox: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),

  Sparkle: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
      <path d="M19 15l.7 2.1L21.8 18l-2.1.7L19 21l-.7-2.3L16.2 18l2.1-.9z" />
    </svg>
  ),

  Copy: ({ size = 20, color = "currentColor" }) => (
    <svg {...base(size, color)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
};

export default Icon;
