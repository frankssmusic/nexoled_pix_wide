// lib/promptsNinos.js
//
// Prompts del MODO NIÑOS de selfiA. Se suman al catálogo principal desde
// lib/prompts.js, así que funcionan igual que los modos de adultos:
// cada modo es un ARRAY de variantes (string, u objeto { prompt, refFija }).
//
// Las referencias (refFija) se leen de public/referencias/.
// Los Divertidos del modo niños (cabezones, cara_aplastada,
// chimuela_cachetona) reusan los prompts de adultos: no van aquí.

// ───────── Bloques compartidos (iguales a los probados en playground) ─────────

const INTRO =
  'Use the reference photo ONLY as the identity source for every person: do NOT copy its framing, background or lighting.';

const INTRO_POSE =
  'Use the reference photo ONLY as the identity source for every person: do NOT copy its pose, framing, background or lighting.';

const INTRO_PERSONAJE =
  'Photo A is the reference selfie. Photo B is the character reference. Use Photo A ONLY as the identity source for every person: do NOT copy its pose, framing, background or lighting. Use Photo B ONLY for the character\'s appearance: do NOT copy its pose, framing or background.';

const TOP =
  'TOP PRIORITY: every face must be immediately recognizable as the exact same person from the reference: same face shape and width, same cheeks, same eyes and eye color, same eyebrows, same nose, same lips, same skin tone, same hairline and hairstyle. Keep glasses, freckles and moles. Never mix facial features between people.';

const TOP_A =
  'TOP PRIORITY: every face must be immediately recognizable as the exact same person from Photo A: same face shape and width, same cheeks, same eyes and eye color, same eyebrows, same nose, same lips, same skin tone, same hairline and hairstyle. Keep glasses, freckles and moles. Never mix facial features between people.';

const EDAD =
  'AGE RULE: every child stays exactly the same age, with a child\'s face, child size and child proportions; never make a child look older or adult-like. If an adult is in the reference, the adult stays an adult. Include ONLY the people in the reference, the same number of people: do not add, duplicate or remove anyone.';

const IDENTIDAD =
  'IDENTITY RULE: each person keeps exactly their real age, height and build from the reference photo. Include ONLY the people in the reference, the same number of people: do not add, duplicate or remove anyone. Everyone keeps their own hair color and hairstyle exactly as in the reference. The people always stay photorealistic and appear only once.';

const IDENTIDAD_ROPA =
  'IDENTITY RULE: each person keeps exactly their real age, height and build from the reference photo. Include ONLY the people in the reference, the same number of people: do not add, duplicate or remove anyone. Everyone keeps their own clothes, hair color and hairstyle exactly as in the reference. The people always stay photorealistic and appear only once.';

const IDENTIDAD_A_ROPA =
  'IDENTITY RULE: each person keeps exactly their real age, height and build from Photo A. Include ONLY the people in Photo A, the same number of people: do not add, duplicate or remove anyone. Everyone keeps exactly their own clothes from Photo A, including the same pants, plus their own hair color and hairstyle. The people always stay photorealistic and appear only once.';

const ROPA_PIXEL =
  'CLOTHES: everyone keeps their own clothes from the reference, with the same colors and the same design, but the fabric is transformed into the blocky video game style: a pixelated texture made of small visible square pixels and slightly blocky edges, as if the clothes belonged to the cube world. ONLY the clothes are pixelated: faces, skin, hair, eyes and hands stay fully photorealistic and natural.';

const ROPA_JUEGO =
  'CLOTHES: everyone keeps their own clothes from the reference, with the same colors and the same design, but the fabric looks like a vibrant stylized 3D video game outfit: brighter saturated colors, clean smooth shading and slightly cartoon-like folds. ONLY the clothes are stylized: faces, skin, hair, eyes and hands stay fully photorealistic and natural.';

const ROPA_PLASTICO =
  'CLOTHES: everyone keeps their own clothes from the reference, with the same colors and the same design, but the fabric looks like smooth, glossy plastic from a blocky toy-like video game, with simple flat colors and clean edges. ONLY the clothes are stylized: faces, skin, hair, eyes and hands stay fully photorealistic and natural.';

const ARMAS_ESPALDA =
  'GEAR: each person carries one stylized cartoon weapon from a colorful battle royale video game, strapped diagonally across their back with a strap over the chest: chunky exaggerated proportions, smooth cartoon 3D shading, glossy painted parts and a soft glowing rarity aura around it, clearly a video game prop and not a real firearm. Each person gets a different one: a stylized assault rifle with a blue glow, a stylized pump shotgun with a purple glow, a stylized burst rifle with a golden glow. The barrel and stock peek out over one shoulder. Hands stay relaxed and do not hold anything.';

const INTEGRACION =
  'LIGHTING INTEGRATION: the people must look genuinely photographed inside this world, not cut out and pasted onto it.';

const CIERRE_LUZ =
  'Shallow depth of field: the people are sharp and the world behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the world. Discard the original lighting of the reference completely.';

// Encuadre de cintura hacia arriba: gente abajo, mundo arriba.
function encuadreCintura(arriba, sonrisa, unaPersona) {
  return `FRAMING: camera at eye level, vertical 9:16 shot. The bottom edge of the frame cuts everyone at the waist. The people are shown from the waist up and fill the lower half of the frame; the upper half shows ${arriba}. Faces clear and well defined, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: ${unaPersona || 'a solo portrait in a relaxed, happy pose'}. ${sonrisa}, a small change from their natural face.`;
}

// ───────────────────────────── Modos niño ─────────────────────────────

const PROMPTS_NINOS = {

// ===== SPIDER KID (Spider-Man) =====
  k_spider: [
    {
      refFija: 'spider_kid_reference.webp',
      prompt: `Photo A is the reference selfie. Photo B is the costume reference. Use Photo A ONLY as the identity source for every person: do NOT copy its pose, framing, background or lighting. Use Photo B ONLY for the costume design: do NOT copy its pose, framing, background or the mask.

TOP PRIORITY: every face must be immediately recognizable as the exact same person from Photo A: same face shape and width, same cheeks, same eyes and eye color, same eyebrows, same nose, same lips, same skin tone, same hairline and hairstyle. Keep glasses, freckles and moles. Never mix facial features between people.

AGE RULE: every child stays exactly the same age, with a child's face, child body size and child proportions; never make a child look older or adult-like. If an adult is in Photo A, the adult stays an adult. Include ONLY the people in Photo A, the same number of people: do not add, duplicate or remove anyone. The people appear only once.

COSTUME: every person wears the exact suit from Photo B, sized to their own body: same red and blue colors, same black web lines, same chest emblem, red gloves and boots. NO mask on anyone: the head is uncovered and the whole face and hair are fully visible.

POSE: an action hero movie poster moment. Arrange the group naturally and freely, like a team of young heroes: relaxed and asymmetric, at slightly different depths and heights, some standing, some leaning or crouching, never stiff and never in a straight line. Only one person stretches an arm toward the camera shooting a thin white web line that streaks past the camera; the hand stays to the side of the faces and never covers any face. Everyone else chooses a simple, natural hero pose. Every face is fully visible, nobody hides behind anyone. With only one person: a solo hero portrait shooting the web toward the camera. Everyone looks at the camera with a proud, happy hero smile, a small change from their natural face. Each person keeps their real height.

SCENE: a city rooftop at sunset, the edge of the rooftop at the bottom of the frame, old water towers and tall buildings with lit windows softly out of focus behind them, a glowing golden sky with soft clouds. Thin white spider webs stretch across the foreground in the lower corners, softly blurred, never covering any face.

FRAMING: low camera angle looking slightly up at the people for a heroic feel, vertical shot, the whole group fully inside the frame with generous space on both sides, everyone from the knees up, faces clear and sharp; the city and the sky fill the top. With a big group, the camera steps back a little so nobody is cut off.

LIGHTING: dramatic warm sunset backlight behind the people with a golden glowing rim light on their hair and shoulders, a gentle lens flare, and a soft warm front light on every face so all faces stay bright, clear and natural; discard the original lighting of Photo A. Tiny floating golden light particles drift in the air, never covering any face. Strong depth: blurred foreground webs, sharp people, a softly blurred background, a sense of wind in the hair. Rich cinematic color grading, fine film grain. No cut-out look, no glowing outlines. Photorealistic human skin, real fabric texture, no plastic or doll look. No text, no logos.`,
    },
  ],

// ===== TOY HISTORIA (Toy Story) — variantes A y B =====
k_toy: [
`${INTRO}

${TOP}

${EDAD}

COSTUME: the default outfit for everyone is the Woody cowboy outfit from Toy Story: yellow and red plaid shirt, black and white cow-print vest, a red bandana and a brown cowboy hat pushed slightly back. ONLY people who are clearly feminine-presenting girls or women wear the Jessie cowgirl outfit instead: white shirt with yellow cuffs and collar, a red cowboy hat pushed slightly back. Boys and men ALWAYS wear the Woody outfit, even if they have long or curly hair. If there is any doubt, use the Woody outfit. Everyone keeps their own real hair color and hairstyle exactly as in the reference: no braids, no red hair added. The whole face stays visible under the hat.

COMPANION: exactly one Buzz Lightyear toy, a small 3D animated toy figure in the Pixar style, about 30 cm tall, standing on a wooden shelf on the wall to one side of the group, fully visible inside the frame, proud pose. It is clearly a small toy. Only one Buzz, no other characters.

SCENE: a child's bedroom with the famous wallpaper of white fluffy clouds on a light blue sky, warm and cozy, softly out of focus. Camera at eye level, vertical medium shot, faces large in the frame. A candid, natural group hug like friends at a birthday party: relaxed and asymmetric, heads at slightly different angles, nobody stiff, nobody posing in a straight line. With only one person, a solo portrait in a relaxed, proud pose. Each person keeps their real height. A happy, playful smile, a small change from their natural face.

LIGHTING: warm afternoon sunlight from a window on the left of the photo, soft shadows, the same light on every face; discard the original lighting of the reference. No cut-out look. Photorealistic skin and real fabric, only the toy is animated.`,
`${INTRO}

${TOP}

${EDAD}

COSTUME: every person wears the Buzz Lightyear space ranger suit from Toy Story: white suit with green and purple panels, a chest control panel with colorful buttons and a purple hood-collar around the neck. NO helmet: the head is uncovered and the whole face and hair are fully visible. Everyone keeps their own real hair color and hairstyle exactly as in the reference.

COMPANION: exactly one Woody toy, a small 3D animated toy figure in the Pixar style, about 30 cm tall, sitting on a wooden shelf on the wall to one side of the group, fully visible inside the frame, waving with his cowboy hat on. It is clearly a small toy. Only one Woody, no other characters.

SCENE: a child's bedroom with the famous wallpaper of white fluffy clouds on a light blue sky, toy rockets and planets hanging from the ceiling, warm and cozy, softly out of focus. Camera at eye level, vertical medium shot, faces large in the frame. A candid, natural group hug like friends at a birthday party: relaxed and asymmetric, heads at slightly different angles, nobody stiff, nobody posing in a straight line. With only one person, a solo portrait in a relaxed, proud pose. Each person keeps their real height. A proud, excited smile, a small change from their natural face.

LIGHTING: warm afternoon sunlight from a window on the left of the photo, soft shadows, the same light on every face; discard the original lighting of the reference. No cut-out look. Photorealistic skin and real fabric, only the toy is animated.`,
],

// ===== RAYO MC-KID (Cars) =====
k_cars: [
`${INTRO}

${TOP}

${EDAD}

COSTUME: every person wears a bright red racing driver suit with yellow lightning bolt stripes and the number 95 on the chest. NO helmet: the head is uncovered and the whole face and hair are fully visible. Everyone keeps their own real hair color and hairstyle exactly as in the reference.

CHARACTER: Lightning McQueen, the red race car from the Pixar movie Cars, a 3D animated car with big friendly eyes on the windshield and a wide smile, parked on the race track a few meters behind the people, clearly visible in the background, the number 95 and the lightning bolt on his side. Only one car character, no other characters.

SCENE: the pit lane of a race track on a sunny day, checkered flags and tire stacks softly out of focus. Camera at eye level, vertical medium shot, faces large in the frame. A candid, natural group hug like friends at a birthday party: relaxed and asymmetric, heads at slightly different angles, nobody stiff, nobody posing in a straight line. With only one person, a solo portrait in a relaxed, proud pose. Each person keeps their real height. A happy, playful smile, a small change from their natural face.

LIGHTING: bright afternoon sun from the left of the photo, soft shadows, the same light on every face and on the car; discard the original lighting of the reference. No cut-out look. Photorealistic skin and real fabric, only the car is animated.`,
],

// ===== AMIGO AZUL (Stitch) — no se nombra al personaje =====
k_stitch: [
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

IDENTITY RULE: each person keeps exactly their real age, height and build from Photo A; nobody looks older or younger. Include ONLY the people in Photo A, the same number of people: do not add, duplicate or remove anyone.

COSTUME: every person wears a colorful Hawaiian shirt with tropical flowers. Everyone keeps their own real hair color and hairstyle exactly as in Photo A.

CHARACTER: the animated character from Photo B, with the same design and colors, about the size of a small dog, rendered in 3D with volume and soft shadows, sitting on top of a carved wooden tiki post to one side of the group, waving at the camera with a big happy smile. Only one character, no other characters.

SCENE: a Hawaiian luau party in a tropical garden, tiki torches, hibiscus flowers, string lights and palm trees, a table with a colorful cake, softly out of focus. Camera at eye level, vertical medium shot, faces large in the frame. With two or more people: a candid group photo like friends at a party, relaxed and asymmetric, heads at slightly different angles. With only one person: a solo portrait in a relaxed, happy pose. A happy, playful smile, a small change from their natural face.

LIGHTING: warm golden late-afternoon sun from the left of the photo, soft shadows, the same light on every face and on the character; discard the original lighting of Photo A. No cut-out look. Photorealistic skin and real fabric, only the character is animated.`,
refFija: 'stitch_reference.webp',
},
],

// ===== ESTRELLAS K-POP (KPop Demon Hunters) =====
k_kpop: [
`${INTRO}

${TOP}

IDENTITY RULE: each person keeps exactly their real age, height and build from the reference photo; nobody looks older or younger than in the reference. Include ONLY the people in the reference, the same number of people: do not add, duplicate or remove anyone.

COSTUME: every person from the reference wears a long-sleeved sparkly purple jacket, zipped up, over a black t-shirt, with black pants. Their outfit is completely different from the singers' outfits. Everyone keeps their own real hair color and hairstyle exactly as in the reference.

SINGERS: right behind the group stand the three singers of Huntrix from KPop Demon Hunters, as live-action real young women, photorealistic, seen from the waist up behind the group, each in her signature look: the leader with a very long purple braid wears a short yellow jacket with colorful patches over a white t-shirt; the singer with long red hair in a high ponytail wears a black graphic band t-shirt and a silver chain necklace; the singer with short black hair in two buns wears a turquoise top. All three smile at the camera and pose together with the group, like a fan meet-and-greet photo after the show. Only these three singers, nobody else.

SCENE: backstage at a huge K-pop concert, purple and pink neon lights, a glowing stage and sparkling confetti softly out of focus behind them. Camera at eye level, vertical medium shot, all faces large and clear in the frame. A candid, happy group photo, relaxed and asymmetric, heads at slightly different angles. An excited, happy smile, a small change from their natural face.

LIGHTING: purple and pink neon glow from behind as rim light on hair and shoulders, plus a soft warm front light on every face so all faces stay clear and natural; discard the original lighting of the reference. No cut-out look. Photorealistic skin and real fabric for everyone.`,
],

// ===== SUPER M (Super Mario) — sin personajes ni nombres =====
k_mario: [
`${INTRO}

${TOP}

IDENTITY RULE: each person keeps exactly their real age, height and build from the reference photo. Include ONLY the people in the reference, the same number of people: do not add, duplicate or remove anyone. Everyone keeps their own clothes, hair color and hairstyle exactly as in the reference.

SCENE: the people stand inside a bright, colorful platform game world on a sunny day, everything around them rendered in a 3D animated movie style: a shiny golden block floating just above their heads, bursting with spinning gold coins; tall green tubes coming out of the grass; floating brown brick platforms high up in the background; two small round brown mushroom creatures with funny faces standing on top of the floating brick platforms or jumping between them, always in the background behind the people and never covering them; rolling green hills, a fairy-tale castle with red roofs in the distance and a smiling golden star in the blue sky. Camera at eye level, vertical medium shot, faces large in the frame, the whole group fully inside the frame with space on both sides. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose. An excited, happy smile, a small change from their natural face, as if they just found the coins.

LIGHTING: bright cheerful sunlight from the left of the photo, soft shadows, warm golden reflections from the coins on every face, the same light on everyone; discard the original lighting of the reference. No cut-out look. The people are photorealistic with real skin and real clothes; only the game world and its creatures are animated.`,
],

// ===== SONIK (Sonic) — variantes A (largada) y B (póster) =====
k_sonic: [
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

${IDENTIDAD_A_ROPA}

CHARACTER: the animated character exactly as shown in Photo B, with the same design, face and colors; it is not any of the people from Photo A. Rendered in 3D animated movie style with volume and soft shadows, as tall as the tallest person in the group, standing at one end of the row one step apart from the group, in a ready-to-run stance, winking at the camera with a confident smile. Only one character.

SCENE: the starting line of a race in a bright video game world on a sunny day, rendered in a 3D animated movie style: a white starting line painted on the track, a checkered start banner above, green grassy hills with brown and tan checkered soil, a giant loop-de-loop track in the distance, shiny gold rings floating in the air, palm trees and a blue sky. Camera at eye level, vertical medium shot, faces large in the frame, the whole group fully inside the frame with space on both sides. Everyone looks at the camera, excited and ready to race. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose. An excited, happy smile, a small change from their natural face.

LIGHTING: bright cheerful sunlight from the left of the photo, soft shadows, the same light on everyone and on the character; discard the original lighting of Photo A. No cut-out look. The people are photorealistic with real skin and real clothes; only the game world and the character are animated.`,
refFija: 'sonic_reference.webp',
},
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

${IDENTIDAD_A_ROPA}

CHARACTER: the animated character exactly as shown in Photo B, with the same design, face and colors; it is not any of the people from Photo A. Rendered in 3D animated movie style with volume and soft shadows, as tall as the tallest person in the group, standing at the end of the row, side by side with the people on the same line and at the same distance from the camera, never in front of anyone and never covering anyone, arms crossed, with a confident smirk. Only one character.

POSE: a promotional movie poster shot. Everyone stands confidently with arms crossed, bodies turned slightly at a three-quarter angle, heads facing the camera with a confident, proud smile, a small change from their natural face. With two or more people: they stand side by side like a team on a movie poster, slightly staggered, asymmetric. With only one person: a solo poster portrait in the same confident pose.

SCENE: an epic animated movie poster set in a video game world, rendered in a 3D animated movie style behind them: a dramatic sunset sky glowing gold and deep blue, a big checkered start banner above, green hills with brown and tan checkered soil, a giant loop-de-loop track, palm trees. Swirling streaks of electric blue energy and speed trails curve behind the group, sparkles and glowing gold rings float in the air, and bright sun rays burst from behind them. Camera at eye level, vertical full-body shot: everyone, including the character, visible from head to toe, standing on the same ground line, the whole group fully inside the frame with space on both sides.

LIGHTING: cinematic movie poster lighting: a bright, soft key light on every face from the front so all faces stay clear and natural, a strong warm golden rim light from behind outlining hair, shoulders and the character, a sun lens flare and volumetric light rays behind the group, rich cinematic color grading with warm skin tones and teal shadows, high contrast background with clean, well-lit faces; discard the original lighting of Photo A. No cut-out look. The people are photorealistic with real skin and real clothes; only the game world, the effects and the character are animated.`,
refFija: 'sonic_reference.webp',
},
],

// ===== MUNDO DE BLOQUES (Minecraft) — ideas 1, 2 y 4 =====
k_minecraft: [
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_PIXEL}

SCENE: the people stand on a grassy hill in a sunny blocky voxel world where everything is made of perfect cubes with pixelated textures, rendered like a high-quality 3D animated movie with real depth and soft global illumination: grass blocks with dirt sides, square trees with cube leaves, tall blocky mountains, a square sun in a bright blue sky with cube-shaped clouds, no water anywhere. Right behind the group, very close and slightly to the right of center, a tall green blocky creature with a mottled pixel texture and a dark pixel face with a sad frowning mouth peeks out between two of the people's heads as a funny surprise, its big square face clearly visible at the height of the tallest person. It stays behind them and never covers any face. The people do not notice it.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up and fill the lower half of the frame; the upper half shows the blocky world: the sky, the square sun, the cube clouds, the trees and the mountains. Faces clear and well defined, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose, with the creature peeking out over one shoulder. A happy, carefree smile, a small change from their natural face.

${INTEGRACION} The warm afternoon sun from the left of the photo physically hits their skin, hair and clothes, with a warm key light on one side of each face and soft natural shadows on the other side; a subtle green bounce light from the grass on the lower part of their clothes and chins; a soft cool blue fill from the sky on the shadow side; a warm golden rim light on hair and shoulders. Each person casts a real soft shadow on the grass blocks. Shallow depth of field: the people are sharp and the blocky world behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the world. Discard the original lighting of the reference completely. Faces, skin and hair are photorealistic; the clothes, the blocky world and the creature are in video game style.`,
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_PIXEL}

SCENE: the people stand inside a huge underground cave in a blocky voxel world where everything is made of perfect cubes with pixelated textures, rendered like a high-quality 3D animated movie with real depth and soft global illumination: grey stone block walls and ceiling, many glowing light-blue diamond ore blocks sparkling in the walls around them, wooden torches mounted on the walls, a few hanging vines, and far away in the deep background a warm orange glow of lava between the blocks, no water anywhere. Small sparkles of light float in the air.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up and fill the lower half of the frame; the upper half shows the cave: the walls full of glowing diamonds, the torches and the deep glowing background. Faces clear and well defined, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose. An amazed, happy smile, a small change from their natural face, as if they just found a treasure.

LIGHTING INTEGRATION: the people must look genuinely photographed inside this cave, not cut out and pasted onto it. A cool light-blue glow from the diamond blocks hits one side of each face, hair and clothes, and a warm orange light from the torches hits the other side, with soft natural shadows; a gentle warm front fill keeps every face clear and natural; sparkling blue reflections on hair and shoulders. Each person casts a soft shadow on the stone floor. Shallow depth of field: the people are sharp and the cave behind them falls off into a gentle natural blur with glowing out-of-focus light points. The same color grading, contrast, saturation, white balance and fine film grain across the people and the cave. Discard the original lighting of the reference completely. Faces, skin and hair are photorealistic; the clothes and the blocky world are in video game style.`,
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_PIXEL}

SCENE: a birthday party in a sunny blocky voxel world where everything is made of perfect cubes with pixelated textures, rendered like a high-quality 3D animated movie with real depth and soft global illumination. In front of the group, at the bottom of the frame, a square wooden table holds a big blocky birthday cake made of cubes, white frosting with red pixel dots, with small lit pixel candles on top. Around them: a small pink blocky pig, a small fluffy white blocky sheep, and a small blocky grey wolf dog with a red collar sitting happily next to the group, all small, cute and friendly. Colorful square balloons and pixel garlands hang between square trees with cube leaves, a square sun in a bright blue sky with cube-shaped clouds, no water anywhere.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up behind the table, filling the middle of the frame; the cake is in front of them and the blocky party world fills the space above. Faces clear and well defined and never covered by the cake or the candles, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose. A big happy birthday smile, a small change from their natural face.

${INTEGRACION} The warm afternoon sun from the left of the photo physically hits their skin, hair and clothes, with a warm key light on one side of each face and soft natural shadows on the other side; a soft warm glow from the candles on their chins and cheeks; a soft cool blue fill from the sky on the shadow side; a warm golden rim light on hair and shoulders. Shallow depth of field: the people and the cake are sharp and the blocky world behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the world. Discard the original lighting of the reference completely. Faces, skin and hair are photorealistic; the clothes, the cake, the animals and the blocky world are in video game style.`,
],

// ===== BATALLA REAL (Fortnite) — ideas 1, 2 y 3 =====
k_fortnite: [
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_JUEGO}

${ARMAS_ESPALDA}

SCENE: the people have just landed on a colorful cartoon battle island in a bright 3D animated video game style on a sunny day: green grassy hills, a few colorful houses and trees, a purple glowing storm wall far away on the horizon. High in the blue sky above them flies a big blue flying school bus hanging from a giant hot-air balloon, and colorful gliders and parachutes float down in the distance. No water anywhere.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up and fill the lower half of the frame; the upper half shows the sky with the flying bus and the falling gliders. Faces clear and well defined, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like a team that just landed, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, confident pose. An excited, ready-for-action smile, a small change from their natural face.

${INTEGRACION} The bright afternoon sun from the left of the photo physically hits their skin, hair and clothes, with a warm key light on one side of each face and soft natural shadows on the other side; a soft cool blue fill from the sky on the shadow side; a warm golden rim light on hair and shoulders; each person casts a soft shadow on the grass. ${CIERRE_LUZ} Faces, skin and hair are photorealistic; the clothes, the cartoon weapons and the game world are in stylized video game style.`,
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_JUEGO}

${ARMAS_ESPALDA}

SCENE: the victory moment at the end of a match on a colorful cartoon battle island, rendered in a bright 3D animated video game style at golden sunset: rolling green hills, colorful houses and trees, colorful confetti falling through the air. Behind the group, an open golden treasure chest glows brightly with beams of light and sparkles coming out of it. To one side of the group, standing on top of a wooden crate at chest height, a small cute purple and blue papier-mâché llama piñata with a happy face and colorful details, clearly a party piñata, fully visible. No water anywhere, no text anywhere.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up and fill the lower half of the frame; the upper half shows the glowing chest, the confetti and the sunset sky. Faces clear and well defined, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like a winning team celebrating, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, proud pose. A proud, happy winner smile, a small change from their natural face.

${INTEGRACION} Warm golden sunset light from the left of the photo physically hits their skin, hair and clothes, with a warm key light on one side of each face and soft natural shadows on the other side; a bright golden glow from the treasure chest behind them creates a strong warm rim light on hair and shoulders; a soft cool purple fill from the sky on the shadow side. ${CIERRE_LUZ} Faces, skin and hair are photorealistic; the clothes, the cartoon weapons, the llama and the game world are in stylized video game style.`,
`${INTRO_POSE}

${TOP}

${IDENTIDAD}

${ROPA_JUEGO}

GEAR: each person holds one stylized cartoon weapon from a colorful battle royale video game in front of their body, resting diagonally across the chest with the barrel pointing down toward the ground, in a relaxed ready pose, both hands holding it naturally with five well-formed fingers. Chunky exaggerated proportions, smooth cartoon 3D shading, glossy painted parts and a soft glowing rarity aura, clearly a video game prop and not a real firearm. Each person gets a different one: a stylized assault rifle with a blue glow, a stylized pump shotgun with a purple glow, a stylized burst rifle with a golden glow.

SCENE: the pre-match lobby screen of a colorful battle royale video game, rendered in a bright 3D animated video game style: the team stands side by side, each person on their own round glowing platform on the floor, in front of a vibrant gradient background of purple, blue and pink with soft light beams, floating sparkles and blurred colorful shapes. Above each person's head floats a small glowing star-shaped icon, without any text. No words, letters or numbers anywhere in the image.

FRAMING: camera at eye level, vertical 9:16 shot, everyone shown from the knees up, standing in a line like a squad ready to enter the match, slightly staggered and asymmetric, the whole group fully inside the frame with space on both sides. Everyone looks at the camera with a confident, ready-for-action smile, a small change from their natural face. With only one person: a solo portrait on one glowing platform in the same ready pose.

LIGHTING INTEGRATION: the people must look genuinely photographed inside this lobby, not cut out and pasted onto it. A bright soft key light from the front keeps every face clear and natural; colorful purple and blue rim lights from behind outline hair, shoulders and the weapons; the glowing platforms cast a soft colored light upward on their legs and clothes; the weapons' glow reflects softly on hands and chests. The same color grading, contrast, saturation and fine film grain across the people and the background. Discard the original lighting of the reference completely. Faces, skin and hair are photorealistic; the clothes, the cartoon weapons and the lobby are in stylized video game style.`,
],

// ===== EL IMPOSTOR (Among Us) — ideas 1 y 2 =====
k_amongus: [
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_JUEGO}

SCENE: the cafeteria of a cartoon spaceship in a bright 3D animated video game style: round tables, metal floor, colorful walls and glowing panels. Around the group stand several small cute bean-shaped astronaut characters in bright colors (cyan, yellow, green, pink, orange), each with a big glass visor, a small backpack and no visible face, waving happily, about knee to waist height. Behind the group, a red bean-shaped astronaut peeks out of a floor vent with a suspicious look, as a funny surprise; it stays behind the people and never covers any face. The people do not notice it. No text anywhere.

${encuadreCintura('the spaceship and the little astronauts', 'A happy, carefree smile')}

${INTEGRACION} A soft cool white ceiling light from above-left of the photo hits their skin, hair and clothes, with soft natural shadows; the colorful glowing panels add cyan and purple rim light on hair and shoulders; a warm front fill keeps every face clear and natural. ${CIERRE_LUZ} Faces, skin and hair are photorealistic; the clothes, the little astronauts and the spaceship are in stylized video game style.`,
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_JUEGO}

SCENE: an emergency meeting inside a cartoon spaceship in a bright 3D animated video game style. The people stand behind a round metal table with a big glowing red emergency button in the center, under a glass dome. On both sides of the table sit several small cute bean-shaped astronaut characters in bright colors (red, cyan, yellow, green, pink), each with a big glass visor, a small backpack and no visible face, looking at each other as if wondering who is suspicious. Red alarm lights glow on the walls. No text anywhere.

FRAMING: camera at eye level, vertical 9:16 shot. The people are shown from the waist up behind the table, filling the middle of the frame; the table and the button are in front of them and the spaceship fills the space above. Faces clear and well defined and never covered by the table or the button, the whole group fully inside the frame with space on both sides. Everyone looks at the camera. With two or more people: a candid group photo like friends at a birthday party, relaxed and asymmetric. With only one person: a solo portrait in a relaxed, happy pose. A playful, slightly suspicious smile, a small change from their natural face.

${INTEGRACION} The glowing red button casts a warm red light up on their chins and chests; the red alarm lights create a red rim light on hair and shoulders; a soft white front fill keeps every face clear and natural. ${CIERRE_LUZ} Faces, skin and hair are photorealistic; the clothes, the little astronauts and the spaceship are in stylized video game style.`,
],

// ===== ROBLOMUNDO (Roblox, Steal a Brainrot) =====
k_roblox: [
`${INTRO}

${TOP}

${IDENTIDAD}

${ROPA_PLASTICO}

SCENE: the people stand inside their own base in a blocky toy-like 3D video game world where everything looks like smooth glossy plastic: a bright green studded floor, grey block walls, a glowing red laser beam across the base entrance, and blue sky with simple clouds. Behind the group, on round glowing pedestals, stands their funny collection of meme creatures in the same blocky plastic game style, each on its own pedestal with a soft golden glow: a yellow banana with a small monkey peeking out of the peel; a tall smiling wooden log with big round eyes, thin arms and legs; a blue shark wearing big sneakers; a ballerina with a cappuccino cup as her head and a pink tutu. The creatures are smaller than the people, stay behind them and never cover any face. No text, letters or numbers anywhere.

${encuadreCintura('the base and the creatures on their pedestals', 'A proud, mischievous smile')}

${INTEGRACION} The afternoon sun from the left of the photo hits their skin, hair and clothes, with a warm key light on one side of each face and soft natural shadows on the other side; the golden glow of the pedestals creates a warm rim light on hair and shoulders; a soft red glow from the laser touches one side; glossy highlights shine on the plastic clothes. ${CIERRE_LUZ} Faces, skin and hair are photorealistic; the clothes, the creatures and the game world are in blocky plastic video game style.`,
],

// ===== BRAINROT ITALIANO (alta definición, ropa real) =====
k_brainrot: [
`${INTRO}

${TOP}

${IDENTIDAD_ROPA}

SCENE: a sunny, cheerful Italian village square with colorful old houses, a stone fountain, flower pots and little flags hanging across the street. Behind the group, a funny crew of famous internet meme creatures, rendered as highly detailed, realistic 3D characters with friendly, comical expressions, each one smaller than the people, standing behind them and never covering any face: a tall wooden log with big round cartoon eyes, a wide smile and thin arms and legs; a blue shark standing on two legs wearing big blue sneakers; a ballerina with a cappuccino cup as her head, wearing a pink tutu; a yellow banana with a small monkey peeking out of the peel. They look cheerful and silly, not scary. No text anywhere.

${encuadreCintura('the square and the creatures', 'A happy, amused smile')}

${INTEGRACION} Warm afternoon Italian sunlight from the left of the photo hits the people and the creatures, with a warm key light on one side of each face and soft natural shadows on the other side; a warm bounce light from the colorful walls; a golden rim light on hair and shoulders. ${CIERRE_LUZ} The people are photorealistic with real skin and real clothes; only the creatures are high-definition 3D characters.`,
],

// ===== AMIGOS AMARILLOS (Minions) — referencia, sin nombrar, sin plátano =====
k_minions: [
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

${IDENTIDAD_A_ROPA}

CHARACTERS: several of the little animated characters from Photo B, with the same design and colors, rendered in 3D animated movie style with volume and soft shadows, cheerful and waving at the camera. They are smaller than the people, stand behind the group and at both sides at shoulder height, and never cover any face.

SCENE: a colorful birthday party in a bright room: yellow and blue balloons, paper garlands, confetti in the air and a big birthday cake on a table behind the group. No text anywhere.

${encuadreCintura('the party and the characters', 'A happy, amused smile')}

${INTEGRACION} A soft warm key light from the front-left of the photo hits their skin, hair and clothes, with soft natural shadows; a golden rim light on hair and shoulders; a soft yellow bounce light from the balloons and the characters. Shallow depth of field: the people are sharp and the party behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of Photo A completely. The people are photorealistic with their own clothes; only the characters are in 3D animated style.`,
refFija: 'minions_reference.webp',
},
],

// ===== PATRULLA CANINA (Paw Patrol) — referencia con los 6 cachorros =====
k_paw: [
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

${IDENTIDAD_A_ROPA}

CHARACTERS: the cute animated puppy characters from Photo B, with the same design, colors and outfits, rendered in 3D animated movie style with soft fur, volume and soft shadows, calm and happy, some waving a paw at the camera. They sit on the table behind the group at shoulder height, smaller than the people, and never cover any face.

SCENE: a simple, cozy birthday party at home: a few balloons in red, blue and yellow, a paper garland with little paw prints on the wall, and a birthday cake decorated with paw prints on the table behind the group. Natural and warm, like a real family celebration. No text anywhere.

${encuadreCintura('the puppies, the balloons and the decorations', 'A natural, happy smile')}

${INTEGRACION} Soft warm indoor window light from the left of the photo hits their faces, clothes and the puppies' fur, with gentle natural shadows; a soft warm rim light on hair and shoulders. Shallow depth of field: the people are sharp and the room behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of Photo A completely. The people are photorealistic with their own clothes; only the puppies are in 3D animated style.`,
refFija: 'paw_patrol_reference.webp',
},
],

// ===== POKEMODO (Pokémon) — grilla 2x2 de referencia =====
k_pokemon: [
{
prompt: `${INTRO_PERSONAJE}

${TOP_A}

${IDENTIDAD_A_ROPA}

PROPS: each person proudly holds one small round capture ball in one hand at chest height, toward the camera: top half bright red, bottom half white, a black band around the middle and a round white button in the center, glossy and toy-like. Natural, relaxed hands with five well-formed fingers.

CHARACTERS: the cute little creatures from Photo B, with the same design and colors, rendered in 3D animated movie style with volume and soft shadows, happy and curious, some waving at the camera. They sit on top of a wooden fence behind the group at shoulder height, smaller than the people, and never cover any face.

SCENE: a sunny, peaceful meadow at the start of an adventure: tall green grass, wildflowers, a few trees, rolling hills in the distance and a bright blue sky with fluffy clouds. Simple and natural. No water anywhere, no text anywhere.

${encuadreCintura('the creatures on the fence and the meadow', 'A natural, excited smile')}

${INTEGRACION} Warm afternoon sunlight from the left of the photo hits the people and the creatures, with a warm key light on one side of each face and soft natural shadows on the other side; a soft green bounce light from the grass; a golden rim light on hair and shoulders; small glossy highlights on the capture balls. Shallow depth of field: the people are sharp and the meadow behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of Photo A completely. The people are photorealistic with their own clothes; only the creatures are in 3D animated style.`,
refFija: 'pokemon_reference.webp',
},
],

// ===== EN EL ESPACIO (Astronauta, sin marca) =====
k_astronauta: [
`${INTRO}

${TOP}

${IDENTIDAD}

COSTUME: every person wears a white astronaut space suit sized to their own body, with orange and blue details, a small mission patch without text on the chest and a chest control panel with small lights. NO helmet anywhere in the image: the head is uncovered and the whole face and hair are fully visible.

SCENE: on the surface of the Moon, with a tall white rocket standing behind the group, a black sky full of stars and a huge bright blue planet Earth glowing in the sky. No text anywhere.

${encuadreCintura('the rocket, the stars and the big blue Earth', 'A proud, amazed smile')}

${INTEGRACION} Strong white sunlight from the left of the photo hits their skin, hair and suits with crisp shadows; a cool blue glow from the Earth works as fill and rim light; a gentle front fill keeps every face clear and natural. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of the reference completely. Photorealistic skin and real fabric, cinematic and realistic.`,
],

// ===== MUNDO PIRATA (Pirata, sin marca) =====
k_pirata: [
`${INTRO}

${TOP}

${IDENTIDAD}

COSTUME: every person wears a fun pirate costume sized to their own body: a loose white shirt with puffy sleeves, a brown leather vest, a red sash around the waist and a red bandana tied on the head above the forehead, never covering the eyes or the face. No swords, no weapons.

SCENE: on the wooden deck of a big pirate ship at golden sunset: tall sails, ropes and rigging, a black flag with a white skull and crossbones waving high on the mast, an open treasure chest full of glowing gold coins behind the group, and the sea far away on the horizon. A small colorful parrot with red, blue and yellow feathers sits on the wooden railing to one side of the group at shoulder height. No text anywhere.

${encuadreCintura('the sails, the flag and the sunset sky', 'An adventurous, happy smile')}

${INTEGRACION} Warm golden sunset light from the left of the photo hits their skin, hair and clothes, with soft natural shadows; the golden glow of the treasure chest works as a warm rim light on hair and shoulders; a cool evening sky fill on the shadow side. Shallow depth of field: the people are sharp and the ship behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of the reference completely. Photorealistic skin and real fabric, cinematic and realistic.`,
],

// ===== EXPLORADOR JURÁSICO (Explorador de dinosaurios, sin marca) =====
k_explorador: [
`${INTRO}

${TOP}

${IDENTIDAD}

COSTUME: every person wears an explorer outfit sized to their own body: a khaki shirt, a safari vest with many pockets and a wide-brim explorer hat pushed back on the head, never covering the eyes or the face.

SCENE: a lush green prehistoric valley on a sunny day: giant ferns and tall palm trees, misty mountains in the distance, and in the background a peaceful herd of huge long-necked dinosaurs eating leaves from the tops of the trees, calm and gentle, far behind the group. To one side of the group, on top of a mossy rock at shoulder height, a cute baby dinosaur with big round eyes peeks out of its cracked egg, small and friendly. No text anywhere.

${encuadreCintura('the valley and the giant dinosaurs', 'An amazed, happy smile')}

${INTEGRACION} Warm golden afternoon sunlight from the left of the photo hits their skin, hair and clothes, with soft natural shadows; a soft green bounce light from the plants; a golden rim light on hair and shoulders. Shallow depth of field: the people are sharp and the valley behind them falls off into a gentle natural blur. The same color grading, contrast, saturation, white balance and fine film grain across the people and the scene. Discard the original lighting of the reference completely. Photorealistic skin and real fabric, cinematic and realistic.`,
],

};

// Lista de ids de modos niño (la usa generarFoto para forzar Flare).
const MODOS_NINOS = Object.keys(PROMPTS_NINOS);

module.exports = { PROMPTS_NINOS, MODOS_NINOS };