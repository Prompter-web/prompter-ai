const $ = (id) => document.getElementById(id);
const description = $("description");
const promptText = $("promptText");
const generatePromptButton = $("generatePrompt");
const generateImageButton = $("generateImage");
const copyButton = $("copyPrompt");
const historyKey = "prompter-history-v1";
let currentPrompt = "";
let currentImage = "";

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.innerHTML = `<span class="loader" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></span> ${label}`;
  } else if (button.dataset.original) {
    button.innerHTML = button.dataset.original;
  }
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey) || "[]"); }
  catch { return []; }
}
function saveHistory(item) {
  const list = getHistory();
  list.unshift({ ...item, id: Date.now() });
  localStorage.setItem(historyKey, JSON.stringify(list.slice(0, 30)));
  updateHistoryCount();
}
function updateHistoryCount() { $("historyCount").textContent = getHistory().length; }
function showPrompt(prompt) {
  currentPrompt = prompt;
  promptText.textContent = prompt;
  promptText.classList.remove("empty");
  $("wordCount").textContent = `${prompt.trim().split(/\s+/).length} words`;
  copyButton.disabled = false;
  generateImageButton.disabled = false;
}
description.addEventListener("input", () => $("charCount").textContent = `${description.value.length} / 5000`);
document.querySelectorAll(".example-chip").forEach(button => {
  button.addEventListener("click", () => {
    description.value = button.dataset.example;
    description.dispatchEvent(new Event("input"));
    description.focus();
  });
});

generatePromptButton.addEventListener("click", async () => {
  const idea = description.value.trim();
  if (idea.length < 3) return toast("Describe your image idea first.");
  setBusy(generatePromptButton, true, "Building your prompt...");
  try {
    const response = await fetch("/api/prompt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: idea, style: $("style").value,
        aspect: $("aspect").value, outputLanguage: $("outputLanguage").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Prompt generation failed.");
    showPrompt(data.prompt);
    saveHistory({ idea, prompt: data.prompt, style: $("style").value, image: "" });
    toast("Your professional prompt is ready ✦");
  } catch (error) { toast(error.message); }
  finally { setBusy(generatePromptButton, false); }
});

generateImageButton.addEventListener("click", async () => {
  if (!currentPrompt) return;
  setBusy(generateImageButton, true, "Generating image...");
  $("previewPlaceholder").hidden = true;
  $("generatedImage").hidden = true;
  $("downloadImage").hidden = true;
  $("imageLoading").hidden = false;
  try {
    const ratios = { "1:1": "1024x1024", "16:9": "1536x864", "9:16": "864x1536", "4:3": "1024x768", "3:2": "1536x1024" };
    const response = await fetch("/api/image", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: currentPrompt, size: ratios[$("aspect").value] || "1024x1024" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Image generation failed.");
    currentImage = data.image;
    $("generatedImage").src = currentImage;
    $("generatedImage").hidden = false;
    $("downloadImage").hidden = false;
    $("imageLoading").hidden = true;
    // Keep the generated image in the current session; large base64 images can exceed browser storage limits.
    toast("Your image is ready. Looking good!");
  } catch (error) {
    $("imageLoading").hidden = true;
    $("previewPlaceholder").hidden = false;
    toast(error.message);
  } finally { setBusy(generateImageButton, false); }
});

copyButton.addEventListener("click", async () => {
  if (!currentPrompt) return;
  try { await navigator.clipboard.writeText(currentPrompt); toast("Prompt copied to clipboard."); }
  catch { toast("Clipboard access unavailable in this browser."); }
});
$("downloadImage").addEventListener("click", () => {
  if (!currentImage) return;
  const link = document.createElement("a");
  link.href = currentImage; link.download = "prompter-creation.png"; link.click();
});
function renderHistory() {
  const list = getHistory();
  const container = $("historyList");
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<p class="empty-history">Your saved prompts will appear here. Create your first one in the Prompt Studio.</p>';
    return;
  }
  list.forEach(item => {
    const card = document.createElement("article");
    card.className = "history-item";
    const title = document.createElement("strong");
    title.textContent = item.idea.length > 70 ? item.idea.slice(0, 70) + "…" : item.idea;
    const body = document.createElement("p");
    body.textContent = item.prompt.slice(0, 180) + (item.prompt.length > 180 ? "…" : "");
    card.append(title, body);
    card.addEventListener("click", () => {
      description.value = item.idea;
      description.dispatchEvent(new Event("input"));
      showPrompt(item.prompt);
      currentImage = item.image || "";
      if (currentImage) {
        $("generatedImage").src = currentImage;
        $("generatedImage").hidden = false;
        $("previewPlaceholder").hidden = true;
        $("downloadImage").hidden = false;
      } else {
        $("generatedImage").hidden = true;
        $("previewPlaceholder").hidden = false;
        $("downloadImage").hidden = true;
      }
      $("historyOverlay").hidden = true;
      toast("Loaded from your history.");
    });
    container.append(card);
  });
}
$("historyButton").addEventListener("click", () => { renderHistory(); $("historyOverlay").hidden = false; });
$("closeHistory").addEventListener("click", () => $("historyOverlay").hidden = true);
$("historyOverlay").addEventListener("click", e => { if (e.target === $("historyOverlay")) $("historyOverlay").hidden = true; });
$("clearHistory").addEventListener("click", () => {
  localStorage.removeItem(historyKey); updateHistoryCount(); renderHistory(); toast("Prompt history cleared.");
});

fetch("/api/status").then(r => r.json()).then(data => {
  $("statusText").textContent = data.configured ? "AI connected" : "Setup API key";
  if (!data.configured) $("statusText").style.color = "#e4b66c";
}).catch(() => $("statusText").textContent = "Offline");
updateHistoryCount();
