import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

try {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: "gemini-3.1-flash-image",
    contents: "Generate a minimal blue circle on a plain white background.",
    config: { responseModalities: ["IMAGE"] },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  if (!parts.some((part) => part.inlineData?.data)) throw new Error("Gemini image model returned no image");
  console.log("Gemini image: OK");
} catch (error) {
  // Do not print provider bodies: they can contain account or quota metadata.
  console.error("Gemini image test failed. Confirm the model quota and billing in Google AI Studio.");
  process.exitCode = 1;
}
