
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
        status: "Groq backend is running"
      });
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Endpoint not found" }, 404);
    }

    if (!env.GROQ_API_KEY) {
      return json({ error: "Groq API key is missing" }, 500);
    }

    try {
      const body = await request.json();

      if (!Array.isArray(body.messages) || !body.messages.length) {
        return json({ error: "Messages are required" }, 400);
      }

      const messages = [
        {
          role: "system",
          content:
            "You are Shadow Born AI, a helpful, intelligent and friendly AI assistant. Answer clearly, accurately, and naturally. Explain difficult topics step by step when necessary."
        },
        ...body.messages
          .filter(m =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
          )
          .map(m => ({
            role: m.role,
            content: m.content
          }))
      ];

      const models = [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b"
      ];

      let lastError = "";

      for (const model of models) {
        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.7,
              max_tokens: 2048
            })
          }
        );

        const result = await response.json();

        if (response.ok) {
          const reply =
            result.choices?.[0]?.message?.content?.trim();

          if (reply) {
            return json({
              reply,
              modelUsed: model
            });
          }

          lastError = model + " returned an empty response";
          continue;
        }

        lastError =
          result.error?.message || `HTTP ${response.status}`;

        // Try the backup model if the first model is unavailable.
        if (
          response.status === 429 ||
          response.status === 503 ||
          response.status === 500
        ) {
          continue;
        }

        return json({
          error: lastError
        }, response.status);
      }

      return json({
        error: "All Groq models failed. " + lastError
      }, 503);

    } catch (error) {
      return json({
        error: error.message || "Backend error"
      }, 500);
    }
  }
};

