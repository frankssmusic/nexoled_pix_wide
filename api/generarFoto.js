// api/generarFoto.js
//
// PASO 1 del flujo de 2 pasos. Esta función SOLO crea la tarea en WaveSpeed
// y devuelve el taskId de inmediato, no espera el resultado. Así nunca se
// acerca al límite de 60s de Vercel, sin importar cuánto tarde WaveSpeed en
// generar la imagen.
//
// El frontend, después de recibir el taskId, llama repetidamente a
// api/consultarFoto.js (cada ~3 seg) hasta que la imagen esté lista.
//
// RUTEO POR MOTOR (Sept 2026):
// - Simpsons y Barbie SIEMPRE usan Seedream 4.5, sin importar el tier del
//   evento (4.5 logra el look caricaturesco/plástico que 5.0 no consigue,
//   porque 5.0 fuerza demasiado realismo).
// - Los modos del bloque DIVERTIDOS SIEMPRE usan GPT Image 2 (medium) y
//   solo están disponibles en eventos premium. Si un evento base intenta
//   usarlos, el servidor rechaza la solicitud.
// - Todo lo demás usa evento.motor_ia: 'base' -> Seedream 5.0 Pro (1k),
//   'premium' -> GPT Image 2 (medium).
// - Cada motor tiene su propio formato de body (Seedream 4.5 usa "size" en
//   formato antiguo, Seedream 5.0 y GPT Image usan "aspect_ratio" + "resolution").
//
// CUOTA (Sept 2026):
// - Se cuentan TODAS las fotos IA generadas del evento (confirmadas o no),
//   porque cada generación le cuesta a WaveSpeed.
// - Si el evento no tiene cuota definida (eventos antiguos), se aplica un
//   tope de seguridad para que nunca genere sin límite.
// - El bloqueo ocurre ANTES de llamar a WaveSpeed: si la cuota está llena,
//   no se crea la tarea y no hay cobro.

const { createClient } = require('@supabase/supabase-js');
const { getPromptAleatorio, DOMINIO_BASE } = require('../lib/prompts');

// ---------------------------------------------------------------------------
// Configuración de motores: endpoint + body específico de cada uno.
// Agregar un motor nuevo en el futuro es solo sumar una entrada acá.
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
// Motivo: 4.5 logra mejor el look caricaturesco/plástico que 5.0, que fuerza
// un realismo que no sirve para estos modos.
const MODOS_FIJOS_SEEDREAM_45 = ['simpsons', 'barbie'];

// Bloque DIVERTIDOS: filtros tipo Snapchat. SIEMPRE usan GPT Image y SOLO
// están disponibles en eventos premium.
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

// Tope de seguridad para eventos sin cuota definida (eventos antiguos).
const TOPE_SEGURIDAD_SIN_CUOTA = 30;

// Mensaje cuando el evento llega a su cuota. Debe contener la palabra
// "límite": el Asistente la usa para no mostrar el botón "Intentar de nuevo".
const MENSAJE_CUOTA_AGOTADA =
  'Este evento llegó a su límite de fotos. Consulta con el organizador para seguir usando FUNfoto IA.';

// Decide qué motor usar según el modo pedido y el tier contratado por el evento.
function resolverMotor(modo, motorDelEvento) {
  if (MODOS_FIJOS_SEEDREAM_45.includes(modo)) {
    return 'seedream_4_5';
  }
  if (MODOS_DIVERTIDOS.includes(modo)) {
    return 'gpt_image_medium';
  }
  return motorDelEvento === 'premium' ? 'gpt_image_medium' : 'seedream_5_0';
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
  // Control de acceso: IA habilitada + motor contratado + cuota del evento.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('cuota_ia, ia_habilitada, motor_ia')
    .eq('id', eventoId)
    .single();

  if (errorEvento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  if (evento?.ia_habilitada === false) {
    return res.status(403).json({
      error: 'FUNfoto IA no está disponible para este evento',
    });
  }

  // Los modos DIVERTIDOS solo están incluidos en el plan premium.
  if (MODOS_DIVERTIDOS.includes(modo) && evento?.motor_ia !== 'premium') {
    return res.status(403).json({
      error: 'Este modo solo está disponible en el plan premium',
    });
  }

  // Cuota: si el evento no tiene una definida, se usa el tope de seguridad.
  const cuotaEfectiva =
    evento?.cuota_ia !== null && evento?.cuota_ia !== undefined && evento.cuota_ia > 0
      ? evento.cuota_ia
      : TOPE_SEGURIDAD_SIN_CUOTA;

  const { count, error: errorConteo } = await supabase
    .from('fotos')
    .select('id', { count: 'exact', head: true })
    .eq('evento_id', eventoId)
    .eq('es_ia', true);

  if (errorConteo) {
    return res.status(500).json({ error: 'No se pudo verificar la cuota de fotos IA' });
  }

  if (count >= cuotaEfectiva) {
    return res.status(403).json({ error: MENSAJE_CUOTA_AGOTADA });
  }

  // Resuelve qué motor usar (Simpsons y Barbie fuerzan 4.5, DIVERTIDOS fuerzan GPT;
  // el resto sigue motor_ia).
  const motorId = resolverMotor(modo, evento.motor_ia);
  const motor = MOTORES[motorId];

  try {
    // ---------------------------------------------------------------------
    // Solo CREA la tarea, no espera el resultado.
    // ---------------------------------------------------------------------
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
      motorUsado: motorId, // se le pasa a consultarFoto.js para guardarlo en la fila de fotos
    });
  } catch (error) {
    console.error('Error en generarFoto:', error);
    return res.status(500).json({
      error: error.message || 'Error creando la generación con IA',
    });
  }
}