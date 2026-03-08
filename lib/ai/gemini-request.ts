const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_FALLBACK_MODEL = "claude-sonnet-4-5";

type GeminiGenerateArgs = {
  prompt: string;
};

async function generateWithClaudeFallback(prompt: string) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is missing for Gemini fallback");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_FALLBACK_MODEL,
      max_tokens: 16384,
      system: "You are a senior SaaS architect. Follow the instructions exactly and return the requested format.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude fallback API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  const text =
    json?.content
      ?.filter((item: { type?: string }) => item.type === "text")
      ?.map((item: { text?: string }) => item.text || "")
      ?.join("\n") ?? "";

  return { raw: json, text };
}

export async function generateWithGemini({ prompt }: GeminiGenerateArgs) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log("[gemini-request] No GEMINI_API_KEY, falling back to Claude");
    return generateWithClaudeFallback(prompt);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 503) {
      console.log(`[gemini-request] Gemini returned ${status}, falling back to Claude`);
      return generateWithClaudeFallback(prompt);
    }
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const json = await response.json();

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n") ??
    "";

  return {
    raw: json,
    text,
  };
}
