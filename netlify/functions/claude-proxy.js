// Netlify Function: claude-proxy.js
// Deploy to: netlify/functions/claude-proxy.js
// This proxies Anthropic API calls from the browser to avoid CORS issues.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { apiKey, ...anthropicBody } = body;

  if (!apiKey || !apiKey.startsWith("sk-")) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Missing or invalid API key" })
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(anthropicBody)
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Proxy error: " + e.message })
    };
  }
};
