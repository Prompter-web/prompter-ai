
import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey
  ? new GoogleGenAI({ apiKey })
  : null;

// ======================================
// CONFIGURATION
// ======================================

const TEXT_MODEL =
  process.env.TEXT_MODEL || "gemini-2.5-flash";

const IMAGE_MODEL =
  process.env.IMAGE_MODEL || "gemini-3.1-flash-image";

const IMAGE_SIZE =
  process.env.IMAGE_SIZE || "1K";

// ======================================
// COMMON FUNCTIONS
// ======================================

function requireAI(req, res, next) {
  if (!ai) {
    return res.status(503).json({
      error: "Gemini is not configured. Add GEMINI_API_KEY in Render Environment."
    });
  }

  next();
}

const clean = (value, max = 5000) =>
  typeof value === "string"
    ? value.trim().slice(0, max)
    : "";

function getErrorStatus(error) {
  const candidates = [
    error?.status,
    error?.code,
    error?.response?.status,
    error?.error?.code
  ];

  for (const value of candidates) {
    const status = Number(value);

    if ([
      400, 401, 403, 404, 408, 413,
      429, 500, 502, 503, 504
    ].includes(status)) {
      return status;
    }
  }

  const match = String(error?.message || "")
    .match(/"code"\s*:\s*(400|401|403|404|408|413|429|500|502|503|504)/);

  return match ? Number(match[1]) : 500;
}

function getErrorMessage(error, type = "prompt") {
  const status = getErrorStatus(error);

  if (status === 429) {
    return "Gemini API quota or rate limit reached. Please check your API billing and quota.";
  }

  if (status === 503 || status === 502 || status === 504) {
    return "Gemini is temporarily busy. Please try again shortly.";
  }

  if (status === 401 || status === 403) {
    return "Gemini API authentication failed. Check your API key and permissions.";
  }

  if (status === 404) {
    return "The selected Gemini model is unavailable. Check your model name and API access.";
  }

  if (status === 400) {
    return "Invalid Gemini request. Please check your prompt, model and settings.";
  }

  console.error(`${type} error details:`, error);

  return error?.message || `Could not generate ${type}.`;
}

// ======================================
// FAST TEXT GENERATION WITH ONE RETRY
// ======================================

async function generateWithRetry(request) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await ai.models.generateContent(request);

    } catch (error) {
      const status = getErrorStatus(error);

      const retryable = [
        500, 502, 503, 504
      ].includes(status);

      if (!retryable || attempt === 1) {
        throw error;
      }

      console.log(
        `Gemini temporarily unavailable. Retrying once...`
      );

      await new Promise(resolve =>
        setTimeout(resolve, 1500)
      );
    }
  }

  throw new Error("Gemini is temporarily unavailable.");
}

// ======================================
// IMAGE ASPECT RATIO
// ======================================

function getAspectRatio(size) {
  const dimensions = size.split("x").map(Number);

  const width = dimensions[0];
  const height = dimensions[1];

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 10000 ||
    height > 10000
  ) {
    return "1:1";
  }

  const gcd = (a, b) =>
    b === 0 ? a : gcd(b, a % b);

  const divisor = gcd(width, height);

  const ratio =
    `${width / divisor}:${height / divisor}`;

  const supportedRatios = [
    "1:1",
    "3:2",
    "2:3",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9"
  ];

  return supportedRatios.includes(ratio)
    ? ratio
    : "1:1";
}

// ======================================
// WEBSITE STATUS
// ======================================

app.get("/api/status", (_req, res) => {
  res.json({
    configured: Boolean(ai),
    app: "Prompter AI",
    provider: "Google Gemini",
    status: "online"
  });
});

// ======================================
// AI PROMPT GENERATION
// ======================================

app.post("/api/prompt", requireAI, async (req, res) => {
  const startedAt = Date.now();

  try {
    const description = clean(req.body.description, 5000);

    const style =
      clean(req.body.style, 80) || "Cinematic";

    const aspect =
      clean(req.body.aspect, 30) || "1:1";

    const outputLanguage =
      clean(req.body.outputLanguage, 30) || "English";

    if (description.length < 3) {
      return res.status(400).json({
        error: "Please describe the picture you want to create."
      });
    }

    const instructions = `You are PROMPTER, an expert visual prompt engineer.

Understand Hindi, English, Hinglish and mixed languages.

Create one polished, detailed image-generation prompt in ${outputLanguage}.

Preserve the user's original idea and expand it with:

- Subject and appearance
- Pose and action
- Environment and background
- Composition and camera angle
- Lighting and color palette
- Atmosphere and textures
- Depth of field and visual quality

Selected visual style: ${style}.
Requested aspect ratio: ${aspect}.

Do not invent contradictory details.
Return only the final image prompt.
No headings or explanations.`;

    const response = await generateWithRetry({
      model: TEXT_MODEL,
      contents: `${instructions}

User description:
${description}`
    });

    const prompt = (response.text || "").trim();

    if (!prompt) {
      throw new Error("Gemini returned an empty prompt.");
    }

    console.log(
      `Prompt generated in ${
        ((Date.now() - startedAt) / 1000).toFixed(1)
      } seconds`
    );

    return res.json({ prompt });

  } catch (error) {
    console.error("Gemini prompt error:", error);

    return res.status(getErrorStatus(error)).json({
      error: getErrorMessage(error, "prompt")
    });
  }
});

// ======================================
// AI IMAGE GENERATION
// ======================================

app.post("/api/image", requireAI, async (req, res) => {
  const startedAt = Date.now();

  try {
    const prompt = clean(req.body.prompt, 12000);

    const size =
      clean(req.body.size, 30) || "1024x1024";

    if (prompt.length < 3) {
      return res.status(400).json({
        error: "Generate a prompt first."
      });
    }

    const aspectRatio = getAspectRatio(size);

    console.log("Starting Gemini image generation...");
    console.log("Image model:", IMAGE_MODEL);
    console.log("Aspect ratio:", aspectRatio);
    console.log("Image size:", IMAGE_SIZE);

    const result = await ai.interactions.create({
      model: IMAGE_MODEL,
      input: prompt,
      response_format: {
        type: "image",
        aspect_ratio: aspectRatio
      }
    });

    const generatedImage = result.output_image;

    if (!generatedImage?.data) {
      throw new Error("Gemini did not return an image.");
    }

    const mimeType =
      generatedImage.mime_type || "image/png";

    const elapsed =
      ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`Image generated in ${elapsed} seconds`);

    return res.json({
      image: `data:${mimeType};base64,${generatedImage.data}`
    });

  } catch (error) {
    console.error("Gemini image error:", error);

    return res.status(getErrorStatus(error)).json({
      error: getErrorMessage(error, "image")
    });
  }
});

// ======================================
// UNKNOWN API ROUTES
// ======================================

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

// ======================================
// WEBSITE FALLBACK
// ======================================

app.use((_req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// ======================================
// START SERVER
// ======================================

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log("================================");
  console.log("PROMPTER AI SERVER STARTED");
  console.log("================================");
  console.log(`Port: ${port}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
  console.log(`Text model: ${TEXT_MODEL}`);
  console.log(`Image model: ${IMAGE_MODEL}`);
  console.log("================================");
});
