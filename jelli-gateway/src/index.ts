export interface Env {
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

// In-memory rate limiting map (sliding window of 60 seconds per IP inside the V8 isolate)
const ipLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;     // 10 requests/min

// Gateway succession configuration
const TIERS = [
  {
    name: "Groq (Tier 1)",
    model: "llama-3.1-8b-instant",
    baseUrl: "https://api.groq.com/openai",
    envKey: "GROQ_API_KEY" as const,
  },
  {
    name: "Mistral (Tier 2)",
    model: "mistral-small",
    baseUrl: "https://api.mistral.ai",
    envKey: "MISTRAL_API_KEY" as const,
  },
  {
    name: "OpenRouter (Tier 3)",
    model: "meta-llama/llama-3-8b-instruct:free",
    baseUrl: "https://openrouter.ai/api",
    envKey: "OPENROUTER_API_KEY" as const,
  },
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Enable CORS for all local development requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/v1/chat") {
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
    }

    // ── 1. IP-Based Rate Limiting ──────────────────────────────────────────
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const now = Date.now();
    let clientRate = ipLimitStore.get(clientIp);

    if (!clientRate || now > clientRate.resetAt) {
      clientRate = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
      ipLimitStore.set(clientIp, clientRate);
    } else {
      clientRate.count++;
    }

    if (clientRate.count > MAX_REQUESTS_PER_WINDOW) {
      console.warn(`[gateway] Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Too Many Requests. Rate limit exceeded (max 10 requests/min)." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Payload Validation & Sanitization ──────────────────────────────────
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
    }

    // Extract & sanitize messages
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid 'messages' array" }), { status: 400, headers: corsHeaders });
    }

    const sanitizedMessages: ChatMessage[] = [];
    for (const msg of body.messages) {
      if (typeof msg !== "object" || msg === null) {
        return new Response(JSON.stringify({ error: "Invalid message object" }), { status: 400, headers: corsHeaders });
      }
      const role = String(msg.role || "").trim();
      const content = String(msg.content || "");

      if (role !== "system" && role !== "user" && role !== "assistant") {
        return new Response(JSON.stringify({ error: `Unsupported role: ${role}` }), { status: 400, headers: corsHeaders });
      }

      // Check for system prompt override attempts
      if (role === "system" && !content.startsWith("You are Jelli")) {
        return new Response(
          JSON.stringify({ error: "Prompt Injection Detected: Custom system instruction override is forbidden." }),
          { status: 400, headers: corsHeaders }
        );
      }

      sanitizedMessages.push({ role, content });
    }

    // Extract other allowed configurations
    const temperature = typeof body.temperature === "number" ? Math.max(0.0, Math.min(2.0, body.temperature)) : 0.7;
    const maxTokens = typeof body.max_tokens === "number" ? Math.max(1, Math.min(4096, body.max_tokens)) : 2048;

    // ── 3. Cascading Failover SSE Generator ──────────────────────────────────
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let currentTierIdx = 0;
        let streamActive = false;

        while (currentTierIdx < TIERS.length) {
          const tier = TIERS[currentTierIdx];
          const apiKey = env[tier.envKey];

          if (!apiKey || apiKey.trim() === "" || apiKey.includes("invalid_")) {
            console.log(`[gateway] Skipping ${tier.name} because key is not configured.`);
            currentTierIdx++;
            continue;
          }

          console.log(`[gateway] Routing prompt to ${tier.name} using model ${tier.model}...`);

          try {
            const upBody = {
              model: tier.model,
              messages: sanitizedMessages,
              stream: true,
              temperature,
              max_tokens: maxTokens,
            };

            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            };

            if (tier.envKey === "OPENROUTER_API_KEY") {
              headers["HTTP-Referer"] = "https://github.com/Hadisovic/Jelli";
              headers["X-Title"] = "Jelli Companion";
            }

            const response = await fetch(`${tier.baseUrl}/v1/chat/completions`, {
              method: "POST",
              headers,
              body: JSON.stringify(upBody),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            if (!response.body) {
              throw new Error("Empty response body from upstream");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === "") continue;

                if (trimmed.startsWith("data: ")) {
                  controller.enqueue(encoder.encode(line + "\n"));
                  streamActive = true;
                }
              }
            }

            // Successfully processed the entire generation cycle
            controller.close();
            return;

          } catch (err: any) {
            console.error(`[gateway] ${tier.name} failed: ${err.message}`);
            
            if (streamActive) {
              // Mid-stream error: send clear instruction to frontend reset and switch
              console.log(`[gateway] Mid-stream failure on ${tier.name}. Emitting clear and transitioning...`);
              controller.enqueue(encoder.encode("data: [CLEAR]\n\n"));
              streamActive = false;
            }
            currentTierIdx++;
          }
        }

        // Exhaustion state
        controller.enqueue(
          encoder.encode(
            `data: {"error": "All gateway tiers failed to generate a response."}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  },
};
