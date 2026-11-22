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
    status: "Groq backend is running",    
    search: env.TAVILY_API_KEY    
      ? "Tavily configured"    
      : "Tavily not configured"    
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
  
  const chatMessages = body.messages    
    .filter(m =>    
      m &&    
      (m.role === "user" || m.role === "assistant") &&    
      typeof m.content === "string"    
    )    
    .map(m => ({    
      role: m.role,    
      content: m.content    
    }));    
  
  if (!chatMessages.length) {    
    return json({ error: "No valid messages supplied" }, 400);    
  }    
  
  const lastUserMessage = [...chatMessages]    
    .reverse()    
    .find(m => m.role === "user");    
  
  if (!lastUserMessage) {    
    return json({ error: "A user message is required" }, 400);    
  }    
  
  const query = lastUserMessage.content.trim();    
  
  // Automatically detect questions that may need current information.    
  const searchPattern =    
    /\b(latest|current|currently|today|tonight|yesterday|tomorrow|recent|recently|this week|this month|this year|breaking|news|price today|who won|weather|search the web|search online|look up|find online|2026)\b/i;    
  
  const shouldSearch =    
    body.search === true || searchPattern.test(query);    
  
  let sources = [];    
  let searchNotice = "";    
  
  // Tavily search is optional. A search failure will not stop Groq chat.    
  if (shouldSearch && env.TAVILY_API_KEY) {    
    try {    
      const searchResponse = await fetch(    
        "https://api.tavily.com/search",    
        {    
          method: "POST",    
          headers: {    
            "Content-Type": "application/json"    
          },    
          body: JSON.stringify({    
            api_key: env.TAVILY_API_KEY,    
            query,    
            search_depth: "basic",    
            topic: "general",    
            max_results: 5,    
            include_answer: false,    
            include_raw_content: false    
          })    
        }    
      );    
  
      const searchData = await searchResponse.json();    
  
      if (!searchResponse.ok) {    
        throw new Error(    
          searchData.detail?.error ||    
          searchData.error ||    
          `Tavily HTTP ${searchResponse.status}`    
        );    
      }    
  
      sources = (searchData.results || []).map(item => ({    
        title: item.title || "Web result",    
        url: item.url || "",    
        content: item.content || "",    
        score: item.score || 0    
      })).filter(item => item.url);    
  
    } catch (error) {    
      searchNotice = "Web search was unavailable: " + error.message;    
      sources = [];    
    }    
  } else if (shouldSearch && !env.TAVILY_API_KEY) {    
    searchNotice = "Tavily API key is not configured.";    
  }    
  
  const systemPrompt = `

You are Shadow Born AI, a helpful, intelligent and friendly AI assistant.

Answer clearly, accurately and naturally.
Explain difficult topics step by step when necessary.

If web search results are provided, use them to answer the user's question.
Do not invent facts or claim that you searched if no search results were provided.
When using search results, mention relevant source names and use the supplied source URLs where appropriate.
If search results are insufficient, clearly say so.
If web search is unavailable, be honest about that limitation.
`;

const messages = [    
    {    
      role: "system",    
      content: systemPrompt    
    },    
    ...(sources.length    
      ? [{    
          role: "system",    
          content:    
            "CURRENT WEB SEARCH RESULTS:\n\n" +    
            sources.map((s, i) =>    
              `${i + 1}. ${s.title}\n` +    
              `URL: ${s.url}\n` +    
              `Information: ${s.content}`    
            ).join("\n\n")    
        }]    
      : []),    
    ...chatMessages    
  ];    
  
  const models = [    
    "openai/gpt-oss-20b",    
    "openai/gpt-oss-120b"    
  ];    
  
  let lastError = "";    
  
  for (const model of models) {    
    let response;    
    let result;    
  
    try {    
      response = await fetch(    
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
  
      result = await response.json();    
  
    } catch (error) {    
      lastError = error.message || "Groq network error";    
      continue;    
    }    
  
    if (response.ok) {    
      const reply =    
        result.choices?.[0]?.message?.content?.trim();    
  
      if (reply) {    
        return json({    
          reply,    
          modelUsed: model,    
          searched: shouldSearch && sources.length > 0,    
          searchNotice,    
          sources: sources.map(s => ({    
            title: s.title,    
            url: s.url    
          }))    
        });    
      }    
  
      lastError = model + " returned an empty response";    
      continue;    
    }    
  
    lastError =    
      result.error?.message || `HTTP ${response.status}`;    
  
    if (    
      response.status === 429 ||    
      response.status === 503 ||    
      response.status === 500    
    ) {    
      continue;    
    }    
  
    return json({ error: lastError }, response.status);    
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
Should i put my api key in thus index.js in the env.groq api key
