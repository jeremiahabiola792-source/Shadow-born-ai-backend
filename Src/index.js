
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
        status: "Backend is running"
      });
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Endpoint not found" }, 404);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "API key secret is not configured" }, 500);
    }

    try {
      const body = await request.json();

      if (!Array.isArray(body.messages)) {
        return json({ error: "Messages are required" }, 400);
      }

      const messages = body.messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }));

      const response = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            instructions: "You are Shadow Born AI, a helpful and friendly assistant. Answer clearly and accurately.",
            input: messages
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return json({
          error: result.error?.message || "AI request failed"
        }, 502);
      }

      return json({
        reply: result.output_text || "I couldn't generate a reply."
      });
    } catch {
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  }
};
