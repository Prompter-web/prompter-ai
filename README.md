# PROMPTER — AI Image Prompt Studio

A premium purple-and-black AI prompt generator. Users can describe an image in Hindi, English, or Hinglish, receive an expanded prompt, generate an image, copy prompts, and keep a local prompt history.

## Requirements

- Node.js 20 or newer
- An OpenAI API key with access to text and image generation models
- API billing/credits enabled for the selected models

## Run locally

1. Extract the ZIP.
2. Open the extracted `prompter` folder in VS Code or a terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Open `.env` and add your API key:

   ```env
   OPENAI_API_KEY=your_real_api_key
   TEXT_MODEL=gpt-6-astra
   IMAGE_MODEL=gpt-image-2.5-flare
   PORT=3000
   ```

   If your API account does not have access to the example model names, change `TEXT_MODEL` and `IMAGE_MODEL` to models available to your account.

6. Start the server:

   ```bash
   npm start
   ```

7. Open **http://localhost:3000** in your browser.

## Important

- Never put your API key in `public/app.js`, HTML, or any browser-side code.
- The API key belongs only in `.env`. Do not upload `.env` to GitHub or share it.
- Real prompt and image generation require API access and may incur usage charges. The website itself is a starter project; it is not hosted publicly until you deploy it.
- Prompt history is stored in the visitor's browser using localStorage. It is not synced between devices.
- For production, add authentication, rate limiting, abuse protection, usage limits, and a privacy policy before opening the site to the public.

## Main files

- `server.js` — secure server-side API routes
- `public/index.html` — website structure
- `public/styles.css` — responsive purple/black design
- `public/app.js` — browser interactions, prompt history, copy and download
- `.env.example` — environment variable template

## API endpoints

- `GET /api/status` — checks whether the API key is configured
- `POST /api/prompt` — expands a user's description into a detailed prompt
- `POST /api/image` — generates an image from the expanded prompt
