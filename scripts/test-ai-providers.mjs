import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prompt = "Reply with exactly: OK";

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8,
    }),
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
  const data = await response.json();
  if (typeof data?.choices?.[0]?.message?.content !== "string") {
    throw new Error("Groq returned no text response");
  }
  console.log("Groq: OK");
}

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: {
      temperature: 0,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: "MINIMAL" },
    },
  });
  if (!response.text?.trim()) throw new Error("Gemini returned no text response");
  console.log("Gemini: OK");
}

const provider = process.argv[2];
if (provider && provider !== "groq" && provider !== "gemini") {
  console.error("Usage: npm run test:ai [-- groq|gemini]");
  process.exitCode = 1;
} else {
  try {
    if (!provider || provider === "groq") await testGroq();
    if (!provider || provider === "gemini") await testGemini();
  } catch (error) {
    // Deliberately never prints environment values or provider response bodies.
    console.error(error instanceof Error ? error.message : "AI provider test failed");
    process.exitCode = 1;
  }
}
