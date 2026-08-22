// api/generarFoto.js
//
// Función serverless de Vercel. Se ejecuta en el servidor, nunca en el navegador
// del invitado. Vercel la expone automáticamente en:
//   https://wide.nexoled.cl/api/generarFoto
//
// Qué hace, paso a paso:
//   1. Recibe la foto del invitado + el modo elegido + el evento
//   2. Revisa la cuota de fotos IA del evento (si tiene límite)
//   3. Arma el prompt correspondiente al modo (algunos modos usan una
//      segunda imagen de referencia FIJA, ej: Fútbol Fan)
//   4. Llama a WaveSpeed para transformar la foto
//   5. Espera el resultado (WaveSpeed procesa de forma asíncrona)
//   6. Sube la foto resultante a Supabase Storage
//   7. Crea el registro en la tabla `fotos` como pendiente de moderación
//   8. Devuelve la URL final al frontend

const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Dominio base donde viven las imágenes de referencia FIJAS (las que suben
// a /public/referencias en el proyecto, no las que sube el invitado).
// Cámbialo si en algún momento el dominio de producción cambia.
// ---------------------------------------------------------------------------
const DOMINIO_BASE = 'https://wide.nexoled.cl';

// ---------------------------------------------------------------------------
// Catálogo de prompts por modo. Cada modo trae:
//   - prompt: el texto que se le manda a WaveSpeed
//   - refFija (opcional): nombre del archivo en /public/referencias que se
//     agrega como SEGUNDA imagen en el array `images`. Solo lo usan los
//     modos que necesitan una segunda persona de referencia (Fútbol Fan).
// ---------------------------------------------------------------------------
const PROMPTS_POR_MODO = {
  game_of_thrones:
    "Extreme close-up POV selfie, camera held very close to the face — the figure fills the left third of frame from the shoulders up, face bathed in soft, cinematic light, looking directly into the camera — fair or pale skin, delicate features, neutral yet warmly confident expression. They wear dark, heavy medieval robes with luxurious fur trim along the collar and cuffs, layered beneath a hooded cloak that drapes naturally, textured and worn with elegant, faded embroidery. Gender-neutral, androgynous features suggest non-binary presence — smooth, balanced, without overt gender cues. Filling the right two-thirds of the frame at extremely close range, a colossal dragon head looms in massive scale — ancient and unblinking, also looking directly into the camera alongside them — one glowing amber eye pulses gently at close range, radiating mystical energy, filling a large portion of the frame. Its scales shimmer with moisture, dark and intricately textured, smoke curling richly from its nostrils just behind the figure's shoulder. Behind them, softly out of focus, the silhouette of the Iron Throne — jagged shapes of countless fused swords catching flickers of torchlight — barely legible in the shallow depth of field, hinting at the seat of power without pulling focus from the two close subjects. Warm orange torchlight glows against cold dark stone and iron. No armor, no weapons — just powerful, unguarded presence. Cinematic, photorealistic, hyper-detailed, Game of Thrones-inspired atmosphere — extreme close-up framing, shallow depth of field, emphasizing intimacy and scale.",

  peaky_style:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin texture, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Dark navy or black three-piece suit, long black wool overcoat, flat cap (newsboy style) worn low, waistcoat with visible pocket watch and chain, slicked back hair with undercut, muted moody color palette (dark navy, black, charcoal — no brown tweed tones). Background: gritty 1920s Birmingham cobblestone street with brick buildings, overcast desaturated lighting, cinematic haze. Same number of people as reference, each recognizable by face.",

  breaking_bad:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Bright yellow chemical hazmat suit, hood down, face fully visible. Gas mask held in one hand at side, empty object only — no face/eyes/reflection inside the lens. Background: rundown desert RV mobile lab, blue-tinted chemical glassware, desert light through windows. Same number of people as reference, each recognizable by face.",

  viejitos:
    "Use the face(s) from the reference photo as the identity source — preserve core facial identity and recognizability. Photorealistic skin texture with realistic aging. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Age each person to approximately 60-70 years old: white/gray hair, deep wrinkles, age spots, looser skin texture. Keep clothing style and lighting consistent with original. Same number of people as reference, no cartoon effect.",

  harry_magic:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Black school robe with house-colored tie and trim, holding a wand. Background: great hall of a magic school, floating candles, stone archways, warm magical lighting. Same number of people as reference, each recognizable by face.",

  super_hero:
    "Use the face from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. The generated body must have completely photorealistic human skin texture and tone matching the reference face — no plastic, doll-like, toy, or 3D-render appearance anywhere on the body, hands, or neck. Generate a medium-shot composition (waist-up or wider) with realistic, anatomically correct human proportions — the head-to-body ratio must match a normal adult (head roughly 1/7th to 1/8th of total body height, not oversized). Outfit: for a feminine look, a warrior-style superheroine — sleeveless red and gold bustier-style top, blue star-patterned bottom, gold tiara-style headband, gold wrist cuffs, confident powerful stance. For a masculine look, a blue-and-silver super-soldier suit with a star emblem on the chest, round shield nearby. Background: dramatic city skyline at dusk with energy/light effects, cinematic superhero movie lighting. Keep the same number of people as in the reference photo, each clearly recognizable by face.",

  grease:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Masculine: black leather jacket, white t-shirt, slicked hair. Feminine: strapless black off-shoulder top, voluminous curly tousled hair, smoky eye makeup, red lipstick. Background: retro diner or drive-in at dusk, neon signs, classic cars. Same number of people as reference, each recognizable by face.",

  jurassic_park:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Khaki safari-style outfit: tan vest or shirt, wide-brim hat optional. Background: dense jungle with a large realistic dinosaur visible, misty adventure lighting. Same number of people as reference, each recognizable by face.",

  simpsons:
    "Keep the person's face, hands, body proportions, and body size 100% identical to the original reference photo — do not enlarge, stretch, or resize the real person's body or head in any way, regardless of the size of the surrounding cartoon characters. Keep the same number of people as in the original photo. Place them sitting on a solid brown leather-style couch (classic Simpsons living room sofa), yellow-toned living room walls, a small framed painting of a sailboat on the wall behind them. Include the full Simpsons family rendered as 3D Pixar-style cartoon characters with yellow skin (not flat 2D) sitting and standing naturally around them on the same couch, sized appropriately to fit the scene without altering the real person: Homer and Marge (tall blue beehive hair) standing behind the couch, Bart sitting on the couch, Lisa sitting on the couch playing her saxophone with both hands, and Maggie — same yellow Simpsons skin tone, tiny infant proportions, single blue hair tuft, blue onesie, pacifier in mouth, sitting on the floor in front of the couch. The real human person(s) must remain fully photorealistic, unchanged, and at their original body proportions.",

  princesa_disney:
    "Use the face(s) from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. Photorealistic human skin, no plastic/doll/3D-render look. Medium-shot composition (waist-up or wider), realistic anatomical proportions (head 1/7-1/8 of body height). Feminine: elegant pastel ballgown, delicate tiara, romantic hairstyle. Masculine: royal prince-style jacket with gold trim, epaulettes. Background: castle ballroom or enchanted garden at golden hour, sparkling light particles. Same number of people as reference, each recognizable by face.",

  disco_70s:
    "Use the face from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. The generated body must have completely photorealistic human skin texture and tone matching the reference face — no plastic, doll-like, toy, or 3D-render appearance anywhere on the body, hands, or neck. Generate a new half-body composition with realistic, anatomically correct human proportions — the head-to-body ratio must match a normal adult (head is roughly 1/7th to 1/8th of total body height, not oversized). Outfit: 1970s disco style — for a feminine look, a shimmering sequined or metallic wrap top/dress in gold, silver, or jewel tones, glossy voluminous hair. For a masculine look, an open-collar satin shirt with gold chain, flared trousers. Background: retro 1970s disco club interior, mirror ball overhead, colorful dance floor light tiles, vibrant neon lighting. Keep the same number of people as in the reference photo, each clearly recognizable by face.",

  barbie:
    "Use the face from the reference photo as the identity source — preserve exact facial features, skin tone, and likeness. The generated body must have completely photorealistic human skin texture and tone matching the reference face — no plastic, doll-like, toy, or 3D-render appearance anywhere on the body, hands, or neck. Generate a medium-shot composition (waist-up or wider) with realistic, anatomically correct human proportions — the head-to-body ratio must match a normal adult (head roughly 1/7th to 1/8th of total body height, not oversized). Outfit: for a feminine look, a bright pink glamorous top or dress with glossy styled hair, confident pose. For a masculine look, Ken-style fitted white or pastel polo shirt, styled hair, confident pose. Background: pink plastic-looking dream house interior with visible furniture and decor, or a pink convertible car with palm trees, bold pink and pastel color palette, glossy toy-like lighting on the environment only (not on the person's skin). Keep the same number of people as in the reference photo, each clearly recognizable by face.",

  // --- Fútbol Fan: 4 submodos, cada uno con su propia foto de referencia
  // fija (jugador genérico/ficticio, sin parecido buscado a nadie real) ---
  futbol_fan_1: {
    prompt:
      "This is a two-reference composition. Reference Photo A is the main subject — keep their face 100% photorealistic, keep the same framing and distance as a normal casual selfie (not extreme close-up, not overly zoomed). Reference Photo noticeably taller than the person in Photo A (at least a head taller), athletic build, wearing a plain generic sports jersey (no real team logos or colors). The player leans in naturally next to Photo A, arm around their shoulder, relaxed genuine smile, looking at camera. Background: subtle stadium atmosphere — softly blurred floodlights and crowd tones, not a sharp wide view of the field. Raw casual phone-selfie look, natural skin texture, soft ambient lighting, not overly cinematic or staged.",
    refFija: 'futbol1.jpg',
  },
  futbol_fan_2: {
    prompt:
     "This is a two-reference composition. Reference Photo A is the main subject — keep their face 100% photorealistic, keep the same framing and distance as a normal casual selfie (not extreme close-up, not overly zoomed). Reference Photo noticeably taller than the person in Photo A (at least a head taller), athletic build, wearing a plain generic sports jersey (no real team logos or colors). The player leans in naturally next to Photo A, arm around their shoulder, relaxed genuine smile, looking at camera. Background: subtle stadium atmosphere — softly blurred floodlights and crowd tones, not a sharp wide view of the field. Raw casual phone-selfie look, natural skin texture, soft ambient lighting, not overly cinematic or staged.",
    refFija: 'futbol2.jpg',
  },
  futbol_fan_3: {
    prompt:
      "This is a two-reference composition. Reference Photo A is the main subject — keep their face 100% photorealistic, keep the same framing and distance as a normal casual selfie (not extreme close-up, not overly zoomed). Reference Photo noticeably taller than the person in Photo A (at least a head taller), athletic build, wearing a plain generic sports jersey (no real team logos or colors). The player leans in naturally next to Photo A, arm around their shoulder, relaxed genuine smile, looking at camera. Background: subtle stadium atmosphere — softly blurred floodlights and crowd tones, not a sharp wide view of the field. Raw casual phone-selfie look, natural skin texture, soft ambient lighting, not overly cinematic or staged.",
    refFija: 'futbol3.jpg',
  },
  futbol_fan_4: {
    prompt:
      "This is a two-reference composition. Reference Photo A is the main subject — keep their face 100% photorealistic, keep the same framing and distance as a normal casual selfie (not extreme close-up, not overly zoomed). Reference Photo noticeably taller than the person in Photo A (at least a head taller), athletic build, wearing a plain generic sports jersey (no real team logos or colors). The player leans in naturally next to Photo A, arm around their shoulder, relaxed genuine smile, looking at camera. Background: subtle stadium atmosphere — softly blurred floodlights and crowd tones, not a sharp wide view of the field. Raw casual phone-selfie look, natural skin texture, soft ambient lighting, not overly cinematic or staged.",
    refFija: 'futbol4.jpg',
  },
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

  const configModo = PROMPTS_POR_MODO[modo];
  if (!configModo) {
    return res.status(400).json({
      error: `El modo "${modo}" todavía no está disponible`,
    });
  }

  // Algunos modos son solo un string (prompt), otros son un objeto
  // { prompt, refFija } cuando necesitan una segunda imagen fija.
  const prompt = typeof configModo === 'string' ? configModo : configModo.prompt;
  const refFija = typeof configModo === 'string' ? null : configModo.refFija;

  // Armamos el array de imágenes que se manda a WaveSpeed. Si el modo
  // trae una imagen fija de referencia, va como segunda imagen.
  const imagenesParaWaveSpeed = refFija
    ? [fotoUrl, `${DOMINIO_BASE}/referencias/${refFija}`]
    : [fotoUrl];

  // ---------------------------------------------------------------------
  // Cliente de Supabase (server-side, usa la key con permisos completos)
  // ---------------------------------------------------------------------
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  // ---------------------------------------------------------------------
  // 1. Control de acceso: revisamos que la IA esté habilitada para este
  //    evento, y si tiene cuota, que no se haya alcanzado. Cortamos ANTES
  //    de gastar la llamada a WaveSpeed en cualquiera de los dos casos.
  // ---------------------------------------------------------------------
  const { data: evento, error: errorEvento } = await supabase
    .from('eventos')
    .select('cuota_ia, ia_habilitada')
    .eq('id', eventoId)
    .single();

  if (errorEvento) {
    return res.status(500).json({ error: 'No se pudo verificar el evento' });
  }

  if (evento?.ia_habilitada === false) {
    return res.status(403).json({
      error: 'FUNphoto IA no está disponible para este evento',
    });
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
          images: imagenesParaWaveSpeed,
          prompt: prompt,
          size: '1080*1920',
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