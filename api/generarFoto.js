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
// RUTEO POR MOTOR (Oct 2026):
// - Simpsons y Barbie SIEMPRE usan Seedream 4.5, sin importar el tier del
//   evento.
// - Futbol Fan Argentina (futbol_fan_4) SIEMPRE usa Seedream 5.0, sin
//   importar el tier del evento.
// - Los modos del bloque DIVERTIDOS SIEMPRE usan GPT Image 2 (medium) y
//   solo estan disponibles en eventos premium. Si un evento base intenta
//   usarlos, el servidor rechaza la solicitud.
// - Todo lo demas usa evento.motor_ia: 'base' -> Seedream 5.0 Pro (1k),
//   'premium' -> GPT Image 2 (medium).
//
// CUOTA (Oct 2026):
// - El contador vive en eventos.ia_usadas, no en la tabla fotos. Asi borrar
//   fotos o borradores no reinicia la cuota.
// - Antes de llamar a WaveSpeed se RESERVA el cupo con la funcion SQL
//   reservar_foto_ia, que suma 1 solo si queda espacio, todo de una vez.
//   Esto evita que varias personas generando al mismo tiempo se pasen.
// - Si el evento no tiene cuota definida, la funcion SQL aplica un tope
//   de seguridad de 30.
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

// Modos que SIEMPRE usan Seedream 4.5, sin importar el tier contratado.
const MODOS_FIJOS_SEEDREAM_45 = ['simpsons', 'barbie'];

// Modos que SIEMPRE usan Seedream 5.0, sin importar el tier contratado.
const MODOS_FIJOS_SEEDREAM_50 = ['futbol_fan_4'];

// Bloque DIVERTIDOS: SIEMPRE usan GPT Image y SOLO en eventos premium.
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
  'Este evento llegó a su límite de fotos. Consulta con el organizador para seguir usando FUNfoto IA.';

// Decide que motor usar segun el modo pedido y el tier contratado.
function resolverMotor(modo, motorDelEvento) {
  if (MODOS_FIJOS_SEEDREAM_45.includes(modo)) {
    return 'seedream_4_5';
  }
  if (MODOS_FIJOS_SEEDREAM_50.includes(modo)) {
    return 'seedream_5_0';
  }
  if (MODOS_DIVERTIDOS.includes(modo)) {
    return 'gpt_image_medium';
  }
  return motorDelEvento === 'premium' ? 'gpt_image_medium' : 'seedream_5_0';
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

  const variante = getPromptAleatorio(modo);
  if (!variante) {
    return res.status(400).json({
      error: `El modo "${modo}" todavía no está disponible`,
    });
  }

  const { prompt, refFija } = variante;

  const imagenesParaWaveSpeed = refFija
    ? [fotoUrl, `${DOMINIO_BASE}/referencias/${refFija}`]
    : [fotoUrl];

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // ---------------------------------------------------------------------
  // Control de acceso: IA habilitada + motor contratado.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('ia_habilitada, motor_ia')
    .eq('id', eventoId)
    .single();

  if (errorEvento || !evento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  if (evento.ia_habilitada === false) {
    return res.status(403).json({
      error: 'FUNfoto IA no está disponible para este evento',
    });
  }

  // Los modos DIVERTIDOS solo estan incluidos en el plan premium.
  if (MODOS_DIVERTIDOS.includes(modo) && evento.motor_ia !== 'premium') {
    return res.status(403).json({
      error: 'Este modo solo está disponible en el plan premium',
    });
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
  const motorId = resolverMotor(modo, evento.motor_ia);
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