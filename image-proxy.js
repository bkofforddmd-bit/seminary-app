// netlify/functions/image-proxy.js
//
// Proxies image generation to OpenAI. Mirrors your claude-proxy: the browser
// sends the user's own API key in the body (nothing baked into the deploy),
// this function calls OpenAI server-side and returns the base64 PNG.
//
// DEPLOY: place at  netlify/functions/image-proxy.js , commit + push.
//
// IMPORTANT TIMEOUTS: gpt-image-1 can take 30-60s. Netlify's DEFAULT function
// timeout is only 10s, which silently kills the request. Raise it via
// netlify.toml:
//     [functions."image-proxy"]
//       timeout = 60
// (Free plan caps synchronous functions at 10s; if you can't raise it, use
//  dall-e-3 which is faster, or the "low" quality setting.)
//
// The app calls:  POST /.netlify/functions/image-proxy
//   body: { apiKey, prompt, size, quality, model? }
// returns:        { b64 } on success, or { error } with the real message.

exports.handler = async function (event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch (e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) }; }

  const apiKey = body.apiKey;
  const prompt = body.prompt;
  const size = body.size || "1536x1024";
  const quality = body.quality || "medium";
  const model = body.model || "gpt-image-1";   // app can pass "dall-e-3" to bypass verification

  if (!apiKey) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing apiKey" }) };
  if (!prompt) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing prompt" }) };

  // Build a request body appropriate to the chosen model. dall-e-3 uses
  // different size/quality enums and needs response_format=b64_json.
  let reqBody;
  if (model === "dall-e-3") {
    const d3size = (size === "1536x1024" || size === "1792x1024") ? "1792x1024"
      : (size === "1024x1536" || size === "1024x1792") ? "1024x1792" : "1024x1024";
    reqBody = { model: "dall-e-3", prompt: prompt, n: 1, size: d3size, quality: "standard", response_format: "b64_json" };
  } else {
    reqBody = { model: "gpt-image-1", prompt: prompt, n: 1, size: size, quality: quality };
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(reqBody),
    });

    let data = null;
    try { data = await resp.json(); } catch (_) {}

    if (!resp.ok) {
      const msg = (data && data.error && (data.error.message || data.error.code))
        || ("OpenAI HTTP " + resp.status);
      return { statusCode: resp.status, headers: CORS, body: JSON.stringify({ error: msg, model: model }) };
    }

    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "No image returned by " + model }) };

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ b64: b64 }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
