/* ════════════════════════════════════════════════════════
   GENERADOR EDITORIAL – app.js
   Flujo: Imagen referencia → GPT-4o Vision (Análisis Limpio) → DALL-E 3 (Regeneración HD Limpia) → Canvas HD
   Objetivo: Re-hacer la imagen con alta calidad y SIN marcas de agua, luego superponer texto dinámico.
   ════════════════════════════════════════════════════════ */

"use strict";

// ─── CONFIG ───────────────────────────────────────────────
const CANVAS_W  = 1080;
const CANVAS_H  = 1350;
const PHOTO_PCT = 0.70;   // 70 % del canvas para la foto
const CYAN      = "#22B8FF";

// ─── STATE ───────────────────────────────────────────────
let state = {
  apiKey     : localStorage.getItem("oai_key") || "",
  imageFile  : null,
  imageB64   : null,
  imageMime  : "image/jpeg",
  busy       : false,
};

// ─── DOM REFS ─────────────────────────────────────────────
const apiKeyInput  = document.getElementById("apiKey");
const saveKeyBtn   = document.getElementById("saveKeyBtn");
const dropzone     = document.getElementById("dropzone");
const fileInput    = document.getElementById("fileInput");
const dzInner      = document.getElementById("dzInner");
const thumbImg     = document.getElementById("thumbImg");
const generateBtn  = document.getElementById("generateBtn");
const statusBox    = document.getElementById("statusBox");
const downloadBtn  = document.getElementById("downloadBtn");
const leftImg      = document.getElementById("leftImg");
const rightHint    = document.getElementById("rightHint");
const outputCanvas = document.getElementById("outputCanvas");
const ctx          = outputCanvas.getContext("2d");

// ─── INIT ─────────────────────────────────────────────────
if (!isUsableApiKey(state.apiKey) && state.apiKey) {
  // A previously saved masked key cannot be used as an Authorization header.
  localStorage.removeItem("oai_key");
  state.apiKey = "";
}

// ─── API KEY ──────────────────────────────────────────────
saveKeyBtn.addEventListener("click", () => {
  const val = apiKeyInput.value.trim();
  if (!isUsableApiKey(val)) {
    showStatus("⚠ Pega la API Key completa (sin puntos ni caracteres ocultos). Debe comenzar con «sk-».", "error");
    return;
  }
  state.apiKey = val;
  localStorage.setItem("oai_key", val);
  // Keep the field empty after saving so it is always ready for a new paste.
  apiKeyInput.value = "";
  showStatus("✅ API Key guardada correctamente.", "success");
  syncBtn();
});

// ─── FILE UPLOAD ─────────────────────────────────────────
fileInput.addEventListener("change", e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("over");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));

dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) handleFile(file);
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showStatus("Selecciona un archivo de imagen válido.", "error");
    return;
  }

  state.imageFile = file;
  state.imageMime = file.type || "image/jpeg";
  const reader = new FileReader();
  reader.onload = ev => {
    state.imageB64 = ev.target.result.split(",")[1]; // pure base64
    // Show thumbnail in dropzone
    thumbImg.src       = ev.target.result;
    thumbImg.style.display = "block";
    dzInner.style.display  = "none";
    // Show in left preview
    leftImg.src           = ev.target.result;
    leftImg.style.display = "block";
    document.querySelector("#leftPreview .empty-hint").style.display = "none";
    syncBtn();
    hideStatus();
  };
  reader.readAsDataURL(file);
}

function syncBtn() {
  generateBtn.disabled = !(state.apiKey && state.imageB64 && !state.busy);
}

// ─── MAIN PIPELINE ───────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  if (state.busy) return;
  state.busy = true;
  syncBtn();
  downloadBtn.style.display = "none";
  outputCanvas.style.display = "none";
  rightHint.style.display   = "flex";

  try {
    // ── PASO 1: GPT-4o Vision – Análisis de los textos y el contenido limpio ──
    showStatus(step("1/3", "Analizando titulares, keywords y la escena limpia con GPT-4o Vision…"), "info");
    const analysis = await analyzeImage();

    // ── PASO 2: DALL-E 3 – Recreación limpia de la fotografía ──
    showStatus(step("2/3", "Re-creando la fotografía sin textos, logos ni marcas de agua…"), "info");
    const newPhotoUrl = await generatePhoto(analysis);

    // ── PASO 3: Canvas – Componer portada con la imagen REGENERADA ──
    showStatus(step("3/3", "Componiendo portada editorial en HD…"), "info");
    await composeCanvas(newPhotoUrl, analysis);

    outputCanvas.style.display = "block";
    rightHint.style.display    = "none";
    downloadBtn.style.display  = "flex";
    showStatus("✅ ¡Portada 4:5 creada! Lista para descargar en 1080 × 1350 px.", "success");

  } catch (err) {
    console.error(err);
    showStatus("❌ " + (err.message || "Error inesperado. Verifica tu API Key."), "error");
    rightHint.style.display = "flex";
  } finally {
    state.busy = false;
    syncBtn();
  }
});

// ─── PASO 1: ANÁLISIS CON GPT-4o VISION ──────────────────
async function analyzeImage() {
  const prompt = `Eres un asistente editorial especializado en noticias de animales y análisis de diseño gráfico.
Analiza esta imagen de referencia. Extrae los textos y genera una descripción detallada de la escena fotográfica, omitiendo por completo cualquier texto, logo, marca de agua, borde, firma o elemento gráfico superpuesto. La imagen puede contener una portada editorial: esos elementos NO forman parte de la fotografía que se va a recrear.

RESPONDE ÚNICAMENTE con este JSON (sin markdown, sin explicaciones):
{
  "headline": "EL TITULAR COMPLETO EXACTAMENTE COMO APARECE EN LA IMAGEN, EN MAYÚSCULAS, SIN CAMBIAR UNA SOLA PALABRA",
  "keywords": ["PALABRA1", "PALABRA2"],
  "clean_scene": "A detailed English DALL-E prompt describing only the photographic scene: the main animal, pose, colors, environment, foreground/background people when present, camera angle, composition and lighting. It must request a pristine high-quality DSLR news photograph with no typography, logo, watermark, signature, frame, border or graphic overlay. Keep the animal and the visual subject safely centered in the upper and middle area so the photo can be cropped for an editorial cover."
}

REGLAS ESTRICTAS:
- "headline": copia el titular EXACTO de la imagen. No cambies ni una palabra. Si hay signos de puntuación, consérvelos.
- "keywords": máximo 2-3 palabras del titular que sean más emotivas o impactantes para resaltarlas en celeste.
- "clean_scene": debe ser una instrucción de generación de imagen detallada, en inglés, para obtener una foto fotorealista limpia de la misma escena. No debe describir, reproducir ni pedir textos, logos, marcas de agua, bordes, firmas o elementos de diseño de la referencia.`;

  const res = await openaiChat([{
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: `data:${state.imageMime};base64,${state.imageB64}`, detail: "high" } }
    ]
  }], "gpt-4o", 600);

  let raw = res.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("El análisis de la imagen no devolvió contenido.");
  raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("No se pudo interpretar el análisis de la imagen. Inténtalo nuevamente.");
  }

  if (typeof data.headline !== "string" || !data.headline.trim()) {
    throw new Error("No se pudo extraer el titular de la imagen. ¿La imagen tiene texto visible?");
  }
  if (typeof data.clean_scene !== "string" || !data.clean_scene.trim()) {
    throw new Error("No se pudo identificar la escena fotográfica de la imagen.");
  }
  data.keywords = Array.isArray(data.keywords) ? data.keywords.filter(k => typeof k === "string").slice(0, 3) : [];
  return data;
}

// ─── PASO 2: GENERAR FOTOGRAFÍA CON DALL-E 3 (vía API, alta calidad y limpia) ────────
async function generatePhoto(analysis) {
  // Prompt siguiendo las instrucciones estrictas: limpio, sin texto, sin logos
  const finalPrompt = [
    analysis.clean_scene, // La escena detallada que extrajo GPT, garantizando que es limpia.
    "Square composition with the visual subject centered and enough space around it for a shallow editorial crop",
    "Authentic news photojournalism style, high-detail DSLR camera quality",
    "Absolutely no text overlays, captions, watermarks, logos, brand names, signatures, frames or graphics",
    "Pristine authentic natural colors, clean photo frame",
    "The subject (the animal) is sharply focused, the immediate foreground figures are present but softly blurred",
    "High fidelity reconstruction of the original photographic scene, not a new scene",
    "No graphic borders, no signature, no additional graphic design elements"
  ].join(". ");

  const res = await openaiImageGenerate(finalPrompt);

  const image = res.data?.[0];
  if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
  if (image?.url) return image.url;
  throw new Error("La API no devolvió la fotografía generada.");
}

// ─── PASO 3: COMPONER PORTADA EN CANVAS HD ───────────────
async function composeCanvas(photoUrl, analysis) {
  // DALL-E's signed image URL is loaded before composing the final 4:5 canvas.
  const photo = await loadImage(photoUrl);

  // Clear canvas
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── 1. Draw photo (top 70%, cover crop, natural) ──
  const photoZoneH = CANVAS_H * PHOTO_PCT;  // 945px
  const scale = Math.max(CANVAS_W / photo.width, photoZoneH / photo.height);
  const dw = photo.width  * scale;
  const dh = photo.height * scale;
  const dx = (CANVAS_W - dw) / 2;
  const dy = (photoZoneH - dh) / 2;

  // Slight brightness/contrast enhancement (natural, not extreme)
  ctx.save();
  ctx.filter = "brightness(102%) contrast(108%) saturate(105%)";
  ctx.drawImage(photo, dx, dy, dw, dh);
  ctx.restore();

  // ── 2. Gradient overlay (never fully cover image, just improve readability) ──
  const gradStart = CANVAS_H * 0.45;
  const grad = ctx.createLinearGradient(0, gradStart, 0, CANVAS_H);
  grad.addColorStop(0,    "rgba(0,0,0,0)");
  grad.addColorStop(0.30, "rgba(0,0,0,0.65)");
  grad.addColorStop(0.60, "rgba(0,0,0,0.92)");
  grad.addColorStop(1,    "rgba(0,0,0,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, gradStart, CANVAS_W, CANVAS_H - gradStart);

  // Solid black base: the lower 30% is reserved exclusively for the headline.
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(0, photoZoneH, CANVAS_W, CANVAS_H - photoZoneH);

  // ── 3. Prepare text ──
  const headline  = analysis.headline.toUpperCase();
  const keywords  = (analysis.keywords || []).map(k => k.toUpperCase());

  const FONT_SIZE  = 64;
  const LINE_H     = FONT_SIZE * 1.18;
  const MARGIN_L   = 85;
  const MARGIN_R   = 85;
  const MAX_WIDTH  = CANVAS_W - MARGIN_L - MARGIN_R;
  const MARGIN_BOT = 90;

  ctx.font = `900 ${FONT_SIZE}px 'League Spartan', 'Anton', sans-serif`;
  await document.fonts.load(`900 ${FONT_SIZE}px 'League Spartan'`);
  ctx.font = `900 ${FONT_SIZE}px 'League Spartan', 'Anton', sans-serif`;

  // Word-wrap headline into lines
  const words = headline.split(/\s+/).filter(Boolean);
  const lines  = [];
  let   cur    = [];

  words.forEach((word, i) => {
    const test = [...cur, word].join(" ");
    if (ctx.measureText(test).width > MAX_WIDTH && cur.length > 0) {
      lines.push(cur);
      cur = [word];
    } else {
      cur.push(word);
    }
  });
  if (cur.length) lines.push(cur);

  // Total text block height
  const totalH   = lines.length * LINE_H;
  const startY   = CANVAS_H - MARGIN_BOT - totalH + FONT_SIZE;

  // ── 4. Cyan decorative line ABOVE text ──
  const lineAboveY = startY - FONT_SIZE - 22;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN_L,            lineAboveY);
  ctx.lineTo(CANVAS_W - MARGIN_R, lineAboveY);
  ctx.stroke();

  // ── 5. Render text word by word ──
  // We track which word index each token is to check keyword match
  let globalWordIdx = 0;
  const SPACE_W = ctx.measureText(" ").width * 1.15;

  lines.forEach((lineWords, li) => {
    const lineText  = lineWords.join(" ");
    const lineWidth = lineWords.reduce((acc, w, i) => acc + ctx.measureText(w).width + (i < lineWords.length - 1 ? SPACE_W : 0), 0);
    let   curX      = MARGIN_L; // left-aligned like the reference
    const lineY     = startY + li * LINE_H;

    lineWords.forEach(word => {
      const clean     = word.replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/gi, "").toUpperCase();
      const isKeyword = keywords.some(k => k.replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/gi, "").toUpperCase() === clean);

      ctx.fillStyle = isKeyword ? CYAN : "#FFFFFF";
      ctx.fillText(word, curX, lineY);
      curX += ctx.measureText(word).width + SPACE_W;
      globalWordIdx++;
    });
  });

  // ── 6. Cyan decorative line BELOW text ──
  const lineBelowY = CANVAS_H - MARGIN_BOT + 20;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN_L,            lineBelowY);
  ctx.lineTo(CANVAS_W - MARGIN_R, lineBelowY);
  ctx.stroke();
}

// ─── DOWNLOAD ─────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `portada_editorial_${Date.now()}.png`;
  a.href     = outputCanvas.toDataURL("image/png", 1.0);
  a.click();
});

// ─── HELPERS ─────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img       = new Image();
    img.crossOrigin = "anonymous";
    img.onload      = () => resolve(img);
    img.onerror     = () => {
      // CORS fallback: try without crossOrigin
      const img2 = new Image();
      img2.onload  = () => resolve(img2);
      img2.onerror = reject;
      img2.src     = src;
    };
    img.src = src;
  });
}

async function openaiChat(messages, model = "gpt-4o", max_tokens = 500) {
  if (!isUsableApiKey(state.apiKey)) {
    throw new Error("Ingresa nuevamente tu API Key completa y pulsa Guardar.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens,
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI API error ${res.status}`);
  }
  return res.json();
}

async function openaiImageGenerate(prompt) {
    if (!isUsableApiKey(state.apiKey)) {
        throw new Error("Ingresa nuevamente tu API Key completa y pulsa Guardar.");
    }

    const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${state.apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-image-2",
            prompt: prompt,
            n: 1,
            // Square source matches the wide top-photo area with only a light crop.
            size: "1024x1024",
            quality: "high"
            // El parámetro 'style' ha sido eliminado para evitar el error de la API
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `OpenAI API Image Error ${res.status}`);
    }
    return res.json();
}

function step(n, msg) {
  return `<div class="spin-row"><span class="spinner"></span><span>Paso ${n}: ${msg}</span></div>`;
}

function showStatus(html, type = "info") {
  statusBox.innerHTML   = html;
  statusBox.className   = `status-box ${type}`;
  statusBox.style.display = "block";
}

function hideStatus() {
  statusBox.style.display = "none";
}

function maskKey(key) {
  if (!key || key.length < 10) return key;
  return key.slice(0, 7) + "•".repeat(20) + key.slice(-4);
}

function isUsableApiKey(key) {
  // HTTP headers only permit ASCII here; the bullet characters in a masked key are invalid.
  return typeof key === "string" && /^sk-[\x21-\x7E]{8,}$/.test(key);
}
