
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

function requireAI(req, res, next) {
  if (!ai) {
    return res.status(503).json({
      error: "Gemini is not configured. Add GEMINI_API_KEY to your .env file and restart Prompter."
    });
  }
  next();
}

const clean = (value, max = 5000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

app.get("/api/status", (_req, res) => {
  res.json({
    configured: Boolean(ai),
    app: "Prompter",
    provider: "Google Gemini"
  });
});

// AI PROMPT GENERATION
app.post("/api/prompt", requireAI, async (req, res) => {
  try {
    const description = clean(req.body.description);
    const style = clean(req.body.style, 80) || "Cinematic";
    const aspect = clean(req.body.aspect, 30) || "1:1";
    const outputLanguage = clean(req.body.outputLanguage, 30) || "English";

    if (description.length < 3) {
      return res.status(400).json({
        error: "Please describe the picture you want to create."
      });
    }

    const instructions = `You are PROMPTER, an expert visual prompt engineer.

Understand Hindi, English, Hinglish, and mixed languages.

Create one polished, detailed image-generation prompt in ${outputLanguage}.

Preserve the user's core idea and expand it with:
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

    const response = await ai.models.generateContent({
      model: process.env.TEXT_MODEL || "gemini-3.8-flash",
      contents: `${instructions}\n\nUser description:\n${description}`
    });

    const prompt = (response.text || "").trim();

    if (!prompt) {
      throw new Error("Gemini returned an empty prompt.");
    }

    res.json({ prompt });

  } catch (error) {
    console.error("Gemini prompt error:", error);
    res.status(500).json({
      error: error.message || "Could not generate a prompt."
    });
  }
});

// AI IMAGE GENERATION
app.post("/api/image", requireAI, async (req, res) => {
  try {
    const prompt = clean(req.body.prompt, 30000);
    const size = clean(req.body.size, 30) || "1024x1024";

    if (prompt.length < 3) {
      return res.status(400).json({
        error: "Generate a prompt first."
      });
    }

    const dimensions = size.split("x").map(Number);
    const width = dimensions[0];
    const height = dimensions[1];

    const aspectRatio =
      width > 0 && height > 0
        ? `${width}:${height}`
        : "1:1";

    const result = await ai.interactions.create({
      model: process.env.IMAGE_MODEL || "gemini-3.1-flash-image",
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

    const mimeType = generatedImage.mime_type || "image/png";

    res.json({
      image: `data:${mimeType};base64,${generatedImage.data}`
    });

  } catch (error) {
    console.error("Gemini image error:", error);
    res.status(500).json({
      error: error.message || "Could not generate the image."
    });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Prompter is running at http://localhost:${port}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
});
