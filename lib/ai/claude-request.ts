const CLAUDE_MODEL = "claude-sonnet-4-5";

type ClaudeGenerateArgs = {
  prompt: string;
  system?: string;
};

export async function generateWithClaude({
  prompt,
  system,
}: ClaudeGenerateArgs) {
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    throw new Error("CLAUDE_API_KEY is missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 32768,
      system: system ?? "You are a senior SaaS architect and engineer.",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error: ${response.status} ${text}`);
  }

  const json = await response.json();

  const text =
    json?.content
      ?.filter((item: { type?: string }) => item.type === "text")
      ?.map((item: { text?: string }) => item.text || "")
      ?.join("\n") ?? "";

  return {
    raw: json,
    text,
  };
}
