// api/generarFoto.js
//
// PASO 1 del flujo de 2 pasos. Esta funcion SOLO crea la tarea en WaveSpeed
// y devuelve el taskId de inmediato, no espera el resultado. Asi nunca se
// acerca al limite de 60s de Vercel, sin importar cuanto tarde WaveSpeed en
// generar la imagen.
//
// El frontend, despues de recibir el taskId, llama repetidamente a
// api/consultarFoto.js (cada ~3 seg) hasta que la imagen este lista.
//
// TIERS (Oct 2026): evento.motor_ia puede ser 'base', 'pro' o 'premium'.
// - base    -> Seedream 5.0 Pro (1k)
// - pro     -> GPT Image 2.5 Flare (medium)
// - premium -> GPT Image 2 (medium)
//
// RUTEO POR MOTOR:
// - ESPECIAL: usa el prompt y hasta 2 imagenes de referencia guardados en el
//   evento. Pro -> Flare, Premium -> GPT Image 2. Si el evento quedara en
//   Base, se usa Flare (el Especial parte desde Pro).
//   Orden de imagenes: selfie, ref 1, ref 2.
// - Simpsons y Barbie SIEMPRE usan Seedream 4.5.
// - Futbol Fan Argentina (futbol_fan_4) SIEMPRE usa Seedream 5.0.
// - Los modos DIVERTIDOS solo estan disponibles en Pro y Premium:
//   Pro -> Flare, Premium -> GPT Image 2.
// - Todo lo demas usa el motor del tier.
//
// CONTENIDO IA DEL EVENTO:
// - 'grilla': sin Especial.
// - 'especial_grilla': Especial + grilla.
// - 'solo_especial': solo se permite el Especial.
//
// CUOTA (Oct 2026):
// - Una sola cuota sumada para todo (grilla y Especial), en eventos.ia_usadas.
// - Antes de llamar a WaveSpeed se RESERVA el cupo con reservar_foto_ia.
// - Si WaveSpeed rechaza la tarea, se devuelve el cupo con liberar_foto_ia.

const { createClient } = require('@supabase/supabase-js');
const { getPromptAleatorio, DOMINIO_BASE } = require('../lib/prompts');

// ---------------------------------------------------------------------------
// Configuracion de motores: endpoint + body especifico de cada uno.
// ---------------------------------------------------------------------------
const MOTORES = {
  seedream_4_5: {
    endpoint: 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit',
    armarBody: (images, prompt) => ({
      images,
      prompt,
      size: '1080*1920',
    }),
  },
  seedream_5_0: {
    endpoint: 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v5.0-pro/edit',
    armarBody: (images, prompt) => ({
      images,
      prompt,
      aspect_ratio: '9:16',
      resolution: '1k',
      output_format: 'jpeg',
    }),
  },
  gpt_image_flare: {
    endpoint: 'https://api.wavespeed.ai/api/v3/openai/gpt-image-2.5-flare/edit',
    armarBody: (images, prompt) => ({
      images,
      prompt,
      aspect_ratio: '9:16',
      resolution: '1k',
      quality: 'medium',
      output_format: 'jpeg',
    }),
  },
  gpt_image_medium: {
    endpoint: 'https://api.wavespeed.ai/api/v3/openai/gpt-image-2/edit',
    armarBody: (images, prompt) => ({
      images,
      prompt,
      aspect_ratio: '9:16',
      resolution: '1k',
      quality: 'medium',
    }),
  },
};

// Motor principal de cada tier.
const MOTOR_POR_TIER = {
  base: 'seedream_5_0',
  pro: 'gpt_image_flare',
  premium: 'gpt_image_medium',
};

// Tiers que incluyen los modos Divertidos.
const TIERS_CON_DIVERTIDOS = ['pro', 'premium'];

const MODO_ESPECIAL = 'especial';

// Modos que SIEMPRE usan Seedream 4.5, sin importar el tier contratado.
const MODOS_FIJOS_SEEDREAM_45 = ['simpsons', 'barbie'];

// Modos que SIEMPRE usan Seedream 5.0, sin importar el tier contratado.
const MODOS_FIJOS_SEEDREAM_50 = ['futbol_fan_4'];

// Bloque DIVERTIDOS: solo en eventos Pro y Premium.
const MODOS_DIVERTIDOS = [
  'ojos_saltones',
  'maquillaje_tia',
  'chimuela_cachetona',
  'cambio_genero',
  'cara_pescado',
  'cara_bebe',
  'cabezones',
  'cara_aplastada',
];

// Mensaje cuando el evento llega a su cuota. Debe contener la palabra
// "límite": el Asistente la usa para no mostrar el boton "Intentar de nuevo".
const MENSAJE_CUOTA_AGOTADA =
  'Este evento llegó a su límite de fotos. Consulta con el organizador para seguir creando selfies con IA.';

// Los mensajes con "no está disponible" tampoco muestran "Intentar de nuevo".
const MENSAJE_ESPECIAL_NO_ACTIVO = 'El Especial no está disponible en este evento';
const MENSAJE_ESPECIAL_SIN_PROMPT = 'El Especial de este evento no está disponible todavía. Avisa al organizador.';
const MENSAJE_SOLO_ESPECIAL = 'Este modo no está disponible en este evento';
// Debe contener "plan premium" para que el Asistente no muestre "Intentar de nuevo".
const MENSAJE_DIVERTIDOS_BLOQUEADOS = 'Este modo solo está disponible en el plan Pro o en el plan premium';

// Normaliza el tier guardado en el evento (valores antiguos o vacios -> base).
function tierDelEvento(motorIa) {
  return MOTOR_POR_TIER[motorIa] ? motorIa : 'base';
}

// Decide que motor usar segun el modo pedido y el tier contratado.
function resolverMotor(modo, tier) {
  if (modo === MODO_ESPECIAL) {
    return tier === 'premium' ? 'gpt_image_medium' : 'gpt_image_flare';
  }
  if (MODOS_FIJOS_SEEDREAM_45.includes(modo)) {
    return 'seedream_4_5';
  }
  if (MODOS_FIJOS_SEEDREAM_50.includes(modo)) {
    return 'seedream_5_0';
  }
  return MOTOR_POR_TIER[tier];
}

// Devuelve un cupo reservado. Si falla, solo se registra en el log.
async function liberarCupo(supabase, eventoId) {
  const { error } = await supabase.rpc('liberar_foto_ia', { p_evento: eventoId });
  if (error) {
    console.error('No se pudo liberar el cupo IA:', error);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { fotoUrl, modo, eventoId } = req.body || {};

  if (!fotoUrl || !modo || !eventoId) {
    return res.status(400).json({
      error: 'Faltan datos: se requiere fotoUrl, modo y eventoId',
    });
  }

  const esEspecial = modo === MODO_ESPECIAL;

  // Para los modos de la grilla, el prompt sale del catalogo (lib/prompts.js).
  let prompt = null;
  let imagenesParaWaveSpeed = null;

  if (!esEspecial) {
    const variante = getPromptAleatorio(modo);
    if (!variante) {
      return res.status(400).json({
        error: `El modo "${modo}" todavía no está disponible`,
      });
    }
    prompt = variante.prompt;
    imagenesParaWaveSpeed = variante.refFija
      ? [fotoUrl, `${DOMINIO_BASE}/referencias/${variante.refFija}`]
      : [fotoUrl];
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // ---------------------------------------------------------------------
  // Control de acceso: IA habilitada, contenido del evento y tier.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('ia_habilitada, motor_ia, contenido_ia, especial_prompt, especial_ref_url, especial_ref_url_2')
    .eq('id', eventoId)
    .single();

  if (errorEvento || !evento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  // Debe contener "no está disponible" para que no aparezca "Intentar de nuevo".
  if (evento.ia_habilitada === false) {
    return res.status(403).json({
      error: 'La selfie con IA no está disponible en este evento',
    });
  }

  const tier = tierDelEvento(evento.motor_ia);
  const contenido = evento.contenido_ia || 'grilla';

  if (esEspecial) {
    if (contenido === 'grilla') {
      return res.status(403).json({ error: MENSAJE_ESPECIAL_NO_ACTIVO });
    }
    if (!evento.especial_prompt || !evento.especial_prompt.trim()) {
      return res.status(403).json({ error: MENSAJE_ESPECIAL_SIN_PROMPT });
    }
    prompt = evento.especial_prompt;
    imagenesParaWaveSpeed = [fotoUrl, evento.especial_ref_url, evento.especial_ref_url_2].filter(Boolean);
  } else if (contenido === 'solo_especial') {
    return res.status(403).json({ error: MENSAJE_SOLO_ESPECIAL });
  }

  // Los modos DIVERTIDOS solo estan incluidos en Pro y Premium.
  if (MODOS_DIVERTIDOS.includes(modo) && !TIERS_CON_DIVERTIDOS.includes(tier)) {
    return res.status(403).json({ error: MENSAJE_DIVERTIDOS_BLOQUEADOS });
  }

  // ---------------------------------------------------------------------
  // Cuota: reservar un cupo ANTES de llamar a WaveSpeed.
  // ---------------------------------------------------------------------
  const { data: hayCupo, error: errorCupo } = await supabase.rpc('reservar_foto_ia', {
    p_evento: eventoId,
  });

  if (errorCupo) {
    console.error('Error reservando cupo IA:', errorCupo);
    return res.status(500).json({ error: 'No se pudo verificar la cuota de fotos IA' });
  }

  if (hayCupo !== true) {
    return res.status(403).json({ error: MENSAJE_CUOTA_AGOTADA });
  }

  // Desde aqui el cupo ya esta descontado. Si algo falla al crear la tarea,
  // se devuelve en el catch.
  const motorId = resolverMotor(modo, tier);
  const motor = MOTORES[motorId];

  try {
    const creacion = await fetch(motor.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
      },
      body: JSON.stringify(motor.armarBody(imagenesParaWaveSpeed, prompt)),
    });

    if (!creacion.ok) {
      const textoError = await creacion.text();
      throw new Error(`WaveSpeed rechazó la solicitud: ${textoError}`);
    }

    const tareaCreada = await creacion.json();
    const taskId = tareaCreada?.data?.id || tareaCreada?.id;

    if (!taskId) {
      throw new Error('WaveSpeed no devolvió un ID de tarea válido');
    }

    return res.status(200).json({
      success: true,
      taskId,
      modo,
      eventoId,
      motorUsado: motorId,
    });
  } catch (error) {
    console.error('Error en generarFoto:', error);
    await liberarCupo(supabase, eventoId);
    return res.status(500).json({
      error: error.message || 'Error creando la generación con IA',
    });
  }
};