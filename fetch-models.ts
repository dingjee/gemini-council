const API_KEY = "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";

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${API_KEY}` }
});
const data = await res.json();
const gptModels = data.data
  .filter(m => m.id.startsWith("openai/") && m.id.toLowerCase().includes("gpt"))
  .map(m => m.id);

console.log(JSON.stringify(gptModels, null, 2));
