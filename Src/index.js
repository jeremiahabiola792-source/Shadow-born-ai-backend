

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        name: "Shadow Born AI",
        status: "Gemini backend is running"
      });
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Endpoint not found" }, 404);
    }

    if (!env.GEMINI_API_KEY) {
      return json({
        error: "Gemini API key is not configured"
      }, 500);
    }

    try {
      const body = await request.json();

      if (!Array.isArray(body.messages) || !body.messages.length) {
        return json({ error: "Messages are required" }, 400);
      }

      const contents = body.messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }]
      }));

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are Shadow Born AI, a helpful, intelligent and friendly AI assistant. Answer clearly, accurately and naturally. Explain difficult topics step by step when necessary."
              }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return json({
          error: result.error?.message || "Gemini request failed"
        }, 502);
      }

      const reply = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return json({
          error: "Gemini returned no text response"
        }, 502);
      }

      return json({ reply });

    } catch (error) {
      return json({
        error: error.message || "Something went wrong"
      }, 500);
    }
  }
};
