
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
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
        status: "Backend is running"
      });
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Endpoint not found" }, 404);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Gemini API key is missing" }, 500);
    }

    try {
      const body = await request.json();

      if (!Array.isArray(body.messages) || !body.messages.length) {
        return json({ error: "Messages are required" }, 400);
      }

      const contents = body.messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: String(m.content || "") }]
        }));

      const models = [
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite"
      ];

      let lastError = "";

      for (const model of models) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: "You are Shadow Born AI, a helpful, intelligent, friendly AI assistant. Answer accurately, naturally and clearly. Explain difficult topics step by step when needed."
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

        if (response.ok) {
          const reply = result.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

          if (reply) {
            return json({
              reply,
              modelUsed: model
            });
          }

          lastError = `${model} returned no text`;

        } else {
          lastError = result.error?.message || `HTTP ${response.status}`;

          // Only switch models when the server reports overload.
          if (response.status !== 503) {
            return json({ error: lastError }, 502);
          }
        }
      }

      return json({
        error: "All AI models are currently busy. Please try again shortly. Details: " + lastError
      }, 503);

    } catch (error) {
      return json({
        error: error.message || "Backend error"
      }, 500);
    }
  }
};
