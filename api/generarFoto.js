// api/generarFoto.js
//
// Función serverless de Vercel. Se ejecuta en el servidor, nunca en el navegador
// del invitado. Vercel la expone automáticamente en:
//   https://wide.nexoled.cl/api/generarFoto
//
// Qué hace, paso a paso:
//   1. Recibe la foto del invitado + el modo elegido + el evento
//   2. Revisa la cuota de fotos IA del evento (si tiene límite)
//   3. Arma el prompt correspondiente al modo
//   4. Llama a WaveSpeed para transformar la foto
//   5. Espera el resultado (WaveSpeed procesa de forma asíncrona)
//   6. Sube la foto resultante a Supabase Storage
//   7. Crea el registro en la tabla `fotos` como pendiente de moderación
//   8. Devuelve la URL final al frontend

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Catálogo de prompts por modo.
// Solo "game_of_thrones" está activo por ahora. Los demás se agregan a medida
// que se van probando y aprobando uno por uno.
// ---------------------------------------------------------------------------
const PROMPTS_POR_MODO = {
  game_of_thrones:
    "Close-up POV selfie perspective, the figure stands impossibly close to the camera, face bathed in soft, cinematic light — fair or pale skin, delicate features, neutral yet warmly confident expression, eyes slightly tilted upward as if gazing into a hidden power. They wear dark, heavy medieval robes with luxurious fur trim along the collar and cuffs, layered beneath a hooded cloak that drapes naturally, textured and worn with elegant, faded embroidery. Gender-neutral, androgynous features suggest non-binary presence — smooth, balanced, without overt gender cues. To their right, a colossal dragon head dominates the frame — massive, ancient, and unblinking — one glowing amber eye pulses gently, radiating mystical energy. Its scales shimmer with moisture, dark and intricately textured, smoke curling richly from its nostrils. Behind them, a blurred stone hall with monumental arches, flickering torchlight, and deep shadows — warm orange glows contrast with cold, stone textures — amplifying the tension between the human and the primordial beast. No armor, no weapons — just powerful, unguarded presence. Cinematic, photorealistic, hyper-detailed, Game of Thrones-inspired atmosphere — dynamic lighting, shallow depth of field, emphasizing scale, intimacy, and ancestral weight.",
};

const COSTO_USD_POR_FOTO = 0.045;

// Nota de mantenimiento: cada intento descartado por el invitado (cuando
// prueba de nuevo o cambia de foto) queda como fila "borrador" en la tabla
// `fotos`, sin limpiarse. No afecta el funcionamiento ni se ve en ningún
// panel, pero con el tiempo acumula filas "basura". Si más adelante quieres
// una limpieza automática, se puede armar un cron job en Vercel que borre
// filas con status='borrador' más viejas que, por ejemplo, 24 horas.

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

  const prompt = PROMPTS_POR_MODO[modo];
  if (!prompt) {
    return res.status(400).json({
      error: `El modo "${modo}" todavía no está disponible`,
    });
  }

  // ---------------------------------------------------------------------
  // Cliente de Supabase (server-side, usa la key con permisos completos)
  // ---------------------------------------------------------------------
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // ---------------------------------------------------------------------
  // 1. Control de cuota: revisamos si el evento tiene límite y si ya se
  //    alcanzó, cortamos ANTES de gastar la llamada a WaveSpeed.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('cuota_ia')
    .eq('id', eventoId)
    .single();

  if (errorEvento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  if (evento?.cuota_ia !== null && evento?.cuota_ia !== undefined) {
    const { count, error: errorConteo } = await supabase
      .from('fotos')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId)
      .eq('es_ia', true);

    if (errorConteo) {
      return res.status(500).json({ error: 'No se pudo verificar la cuota de fotos IA' });
    }

    if (count >= evento.cuota_ia) {
      return res.status(403).json({
        error: 'Se alcanzó el límite de fotos IA disponibles para este evento',
      });
    }
  }

  try {
    // ---------------------------------------------------------------------
    // 2. Llamada a WaveSpeed — crea la tarea de transformación
    // ---------------------------------------------------------------------
    const creacion = await fetch(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          images: [fotoUrl],
          prompt: prompt,
        }),
      }
    );

    if (!creacion.ok) {
      const textoError = await creacion.text();
      throw new Error(`WaveSpeed rechazó la solicitud: ${textoError}`);
    }

    const tareaCreada = await creacion.json();
    const taskId = tareaCreada?.data?.id || tareaCreada?.id;

    if (!taskId) {
      throw new Error('WaveSpeed no devolvió un ID de tarea válido');
    }

    // ---------------------------------------------------------------------
    // 3. Polling — WaveSpeed procesa en segundo plano, hay que preguntar
    //    cada cierto tiempo si ya terminó. Máximo ~45 segundos de espera.
    // ---------------------------------------------------------------------
    let urlResultado = null;
    const maxIntentos = 15;
    const esperaMs = 3000;

    for (let intento = 0; intento < maxIntentos; intento++) {
      await new Promise((resolve) => setTimeout(resolve, esperaMs));

      const estado = await fetch(
        `https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
          },
        }
      );

      const estadoJson = await estado.json();
      const status = estadoJson?.data?.status || estadoJson?.status;

      if (status === 'completed' || status === 'succeeded') {
        urlResultado =
          estadoJson?.data?.outputs?.[0] ||
          estadoJson?.outputs?.[0] ||
          estadoJson?.data?.output;
        break;
      }

      if (status === 'failed') {
        throw new Error('WaveSpeed no pudo generar la imagen');
      }
      // si sigue "processing" o "pending", el for vuelve a intentar
    }

    if (!urlResultado) {
      throw new Error('WaveSpeed demoró demasiado en responder, intenta de nuevo');
    }

    // ---------------------------------------------------------------------
    // 4. Descargar la imagen resultante y subirla a Supabase Storage
    // ---------------------------------------------------------------------
    const imagenDescargada = await fetch(urlResultado);
    const imagenBuffer = await imagenDescargada.arrayBuffer();

    const nombreArchivo = `ia_${modo}_${eventoId}_${Date.now()}.jpg`;

    const { error: errorSubida } = await supabase.storage
      .from('fotos')
      .upload(nombreArchivo, Buffer.from(imagenBuffer), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (errorSubida) {
      throw new Error(`No se pudo subir la imagen a Supabase: ${errorSubida.message}`);
    }

    const { data: urlPublica } = supabase.storage
      .from('fotos')
      .getPublicUrl(nombreArchivo);

    // ---------------------------------------------------------------------
    // 5. Registrar la foto en la tabla `fotos` como BORRADOR.
    //    "borrador" no es "pending"/"approved"/"rejected", así que el
    //    operador no la ve todavía — solo se vuelve visible si el invitado
    //    confirma con "Usar esta foto" (eso lo hace el frontend, cambiando
    //    el status a "pending").
    // ---------------------------------------------------------------------
    const { data: fotoCreada, error: errorInsert } = await supabase
      .from('fotos')
      .insert({
        evento_id: eventoId,
        url: urlPublica.publicUrl,
        status: 'borrador',
        autorizada: false,
        es_ia: true,
        modo_ia: modo,
      })
      .select()
      .single();

    if (errorInsert) {
      throw new Error(`No se pudo registrar la foto: ${errorInsert.message}`);
    }

    return res.status(200).json({
      success: true,
      foto: fotoCreada,
      costoAprox: COSTO_USD_POR_FOTO,
    });
  } catch (error) {
    console.error('Error en generarFoto:', error);
    return res.status(500).json({
      error: error.message || 'Error generando la foto con IA',
    });
  }
}