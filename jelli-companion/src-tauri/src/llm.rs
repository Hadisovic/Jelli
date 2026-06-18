use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub type CancelMap = Arc<Mutex<HashMap<String, bool>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub api_url: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub speaker_id: Option<u32>,
    pub quantization: Option<String>,
    pub repeat_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenPayload {
    pub request_id: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmDonePayload {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmErrorPayload {
    pub request_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LlmClearPayload {
    pub request_id: String,
}

fn is_cancelled(request_id: &str, map: &CancelMap) -> bool {
    map.try_lock().map(|g| g.get(request_id).copied().unwrap_or(false)).unwrap_or(false)
}

pub async fn stream_llm<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel_map: &CancelMap,
) -> Result<String, String> {
    let rid = request_id.to_string();
    match config.provider.as_str() {
        "gateway" => stream_gateway(window, &rid, messages, config, cancel_map).await,
        "ollama" => stream_ollama(window, &rid, messages, config, cancel_map).await,
        "openai" => stream_openai(window, &rid, messages, config, cancel_map).await,
        "anthropic" => stream_anthropic(window, &rid, messages, config, cancel_map).await,
        "gemini" => stream_gemini(window, &rid, messages, config, cancel_map).await,
        "deepseek" => stream_deepseek(window, &rid, messages, config, cancel_map).await,
        p => Err(format!("unsupported provider: {p}")),
    }
}

async fn stream_gateway<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    use futures_util::StreamExt;

    if is_cancelled(request_id, cancel) {
        return Err("Request cancelled".to_string());
    }

    let gateway_url = std::env::var("JELLI_GATEWAY_URL")
        .unwrap_or_else(|_| "https://jelli-gateway.hadisovic.workers.dev/v1/chat".to_string());

    println!("[gateway] Connecting to cloud proxy at {}...", gateway_url);

    let body = serde_json::json!({
        "messages": messages,
        "temperature": config.temperature.unwrap_or(0.7),
        "max_tokens": config.max_tokens.unwrap_or(2048),
    });

    let client = build_client();
    let resp_result = client.post(&gateway_url)
        .json(&body)
        .send()
        .await;

    let resp = match resp_result {
        Ok(r) => r,
        Err(e) => {
            return Err(format!("Failed to connect to gateway proxy: {}", e));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Gateway HTTP error {}: {}", status, err_text));
    }

    println!("[gateway] Connected to cloud proxy. Streaming response...");

    let mut full = String::new();
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(request_id, cancel) {
            break;
        }
        match chunk {
            Ok(bytes) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(line_end) = buf.find('\n') {
                    let line = buf[..line_end].trim().to_string();
                    buf = buf[line_end + 1..].to_string();
                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }
                    if line == "data: [DONE]" {
                        break;
                    }
                    if line == "data: [CLEAR]" {
                        println!("[gateway] Received mid-stream failover clear signal from cloud proxy.");
                        full.clear();
                        let _ = window.emit("llm:clear", LlmClearPayload {
                            request_id: request_id.to_string(),
                        });
                        continue;
                    }
                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(err_msg) = json["error"].as_str() {
                                return Err(err_msg.to_string());
                            }
                            if let Some(text) = json["choices"][0]["delta"]["content"].as_str() {
                                full.push_str(text);
                                emit_token(window, request_id, text).await;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(format!("Gateway stream chunk error: {}", e));
            }
        }
    }

    if is_cancelled(request_id, cancel) {
        return Ok(full);
    }

    if full.is_empty() {
        return Err("Gateway produced an empty response.".to_string());
    }

    println!("[gateway] Stream completed successfully.");
    emit_done(window, request_id).await;
    Ok(full)
}

async fn emit_token<R: tauri::Runtime>(window: &tauri::Window<R>, request_id: &str, token: &str) {
    let _ = window.emit("llm:token", TokenPayload {
        request_id: request_id.to_string(),
        token: token.to_string(),
    });
}

async fn emit_done<R: tauri::Runtime>(window: &tauri::Window<R>, request_id: &str) {
    let _ = window.emit("llm:done", LlmDonePayload {
        request_id: request_id.to_string(),
    });
}

#[allow(dead_code)]
async fn emit_error<R: tauri::Runtime>(window: &tauri::Window<R>, request_id: &str, message: &str) {
    let _ = window.emit("llm:error", LlmErrorPayload {
        request_id: request_id.to_string(),
        message: message.to_string(),
    });
}

fn default_url(provider: &str) -> &str {
    match provider {
        "ollama" => "http://localhost:11434",
        "openai" => "https://api.openai.com",
        "anthropic" => "https://api.anthropic.com",
        "gemini" => "https://generativelanguage.googleapis.com",
        "deepseek" => "https://api.deepseek.com",
        _ => "http://localhost:11434",
    }
}

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .expect("reqwest client")
}

// ── Ollama ──────────────────────────────────────────────────────────────────

async fn stream_ollama<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("ollama"));

    // Fallback: Some local model Modelfiles completely ignore the "system" role.
    // We inject persona into the LAST user message so it's always fresh.
    let mut final_messages = messages.to_vec();
    if let Some(sys_msg) = messages.iter().find(|m| m.role == "system") {
        let sys_content = sys_msg.content.clone();

        // Count user messages to determine turn number
        let user_turn_count = final_messages.iter().filter(|m| m.role == "user").count();

        if let Some(last_user) = final_messages.iter_mut().rev().find(|m| m.role == "user") {
            if user_turn_count <= 1 {
                // Turn 1: inject full system prompt
                last_user.content = format!(
                    "SYSTEM INSTRUCTIONS (ACT LIKE THIS): {}\n\nUSER MESSAGE: {}",
                    sys_content,
                    last_user.content
                );
            } else {
                // Turn 2+: short reminder to stay in character
                let short_reminder = "stay in character as jelli — lowercase, 1 sentence, emojis, gen z texting, no periods, be casual and brief";
                last_user.content = format!(
                    "{}\n\nUSER MESSAGE: {}",
                    short_reminder,
                    last_user.content
                );
            }
        }
    }

    let body = serde_json::json!({
        "model": config.model,
        "messages": final_messages,
        "stream": true,
        "options": {
            "temperature": config.temperature.unwrap_or(0.7),
            "num_predict": config.max_tokens.unwrap_or(2048),
            "repeat_penalty": config.repeat_penalty.unwrap_or(1.15),
            "frequency_penalty": config.frequency_penalty.unwrap_or(0.1),
        }
    });
    let client = build_client();
    let resp = client.post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ollama request: {e}"))?;
    let mut full = String::new();
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if is_cancelled(request_id, cancel) { break; }
        let chunk = chunk.map_err(|e| format!("ollama stream: {e}"))?;
        for line in chunk.split(|&b| b == b'\n').filter(|l| !l.is_empty()) {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(line) {
                if let Some(content) = val["message"]["content"].as_str() {
                    if !content.is_empty() {
                        full.push_str(content);
                        emit_token(window, request_id, content).await;
                    }
                }
                if val["done"].as_bool().unwrap_or(false) {
                    break;
                }
            }
        }
    }
    emit_done(window, request_id).await;
    Ok(full)
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async fn stream_openai<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("openai"));
    let key = config.api_key.as_deref().ok_or("openai: no api key")?;
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
        "temperature": config.temperature.unwrap_or(0.7),
        "max_tokens": config.max_tokens.unwrap_or(2048),
    });
    let client = build_client();
    let resp = client.post(format!("{base}/v1/chat/completions"))
        .header("Authorization", format!("Bearer {key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("openai request: {e}"))?;
    parse_sse_stream(window, request_id, resp, cancel, |json| {
        json["choices"][0]["delta"]["content"].as_str().map(|s| s.to_string())
    }).await
}

// ── DeepSeek (OpenAI-compatible) ────────────────────────────────────────────

async fn stream_deepseek<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    stream_openai(window, request_id, messages, config, cancel).await
}

// ── Anthropic ───────────────────────────────────────────────────────────────

async fn stream_anthropic<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("anthropic"));
    let key = config.api_key.as_deref().ok_or("anthropic: no api key")?;
    let system = messages.iter().find(|m| m.role == "system").map(|m| m.content.as_str());
    let chat_messages: Vec<&ChatMessage> = messages.iter().filter(|m| m.role != "system").collect();
    let mut body = serde_json::json!({
        "model": config.model,
        "messages": chat_messages,
        "max_tokens": config.max_tokens.unwrap_or(2048),
        "stream": true,
    });
    if let Some(s) = system { body["system"] = serde_json::json!(s); }
    if let Some(t) = config.temperature { body["temperature"] = serde_json::json!(t); }
    let client = build_client();
    let resp = client.post(format!("{base}/v1/messages"))
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request: {e}"))?;
    parse_sse_stream(window, request_id, resp, cancel, |json| {
        if json["type"] == "content_block_delta" {
            json["delta"]["text"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    }).await
}

// ── Gemini ─────────────────────────────────────────────────────────────────

async fn stream_gemini<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("gemini"));
    let key = config.api_key.as_deref().ok_or("gemini: no api key")?;

    let system = messages.iter().find(|m| m.role == "system").map(|m| m.content.as_str());
    let chat_messages: Vec<&ChatMessage> = messages.iter().filter(|m| m.role != "system").collect();

    let gemini_contents: Vec<serde_json::Value> = chat_messages.iter().map(|m| {
        serde_json::json!({
            "role": if m.role == "assistant" { "model" } else { "user" },
            "parts": [{"text": m.content}]
        })
    }).collect();

    let mut body = serde_json::json!({
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": config.temperature.unwrap_or(0.7),
            "maxOutputTokens": config.max_tokens.unwrap_or(2048),
        }
    });

    if let Some(sys_text) = system {
        body["systemInstruction"] = serde_json::json!({
            "parts": [{"text": sys_text}]
        });
    }

    let url = format!("{base}/v1beta/models/{}:streamGenerateContent?key={key}", config.model);
    let client = build_client();
    let resp = client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("gemini request: {e}"))?;
    parse_sse_stream(window, request_id, resp, cancel, |json| {
        json["candidates"][0]["content"]["parts"][0]["text"].as_str().map(|s| s.to_string())
    }).await
}

// ── SSE parser (shared by OpenAI, Anthropic, Gemini, DeepSeek) ──────────────

async fn parse_sse_stream<R, F>(
    window: &tauri::Window<R>,
    request_id: &str,
    resp: reqwest::Response,
    cancel: &CancelMap,
    extract: F,
) -> Result<String, String>
where
    R: tauri::Runtime,
    F: Fn(&serde_json::Value) -> Option<String>,
{
    let status = resp.status();
    if !status.is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP error {}: {}", status, err_text));
    }
    use futures_util::StreamExt;
    let mut full = String::new();
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        if is_cancelled(request_id, cancel) { break; }
        let chunk = chunk.map_err(|e| format!("sse stream: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(line_end) = buf.find('\n') {
            let line = buf[..line_end].trim().to_string();
            buf = buf[line_end + 1..].to_string();
            if line.is_empty() || line.starts_with(':') { continue; }
            if line == "data: [DONE]" { break; }
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(text) = extract(&json) {
                        full.push_str(&text);
                        emit_token(window, request_id, &text).await;
                    }
                }
            }
        }
    }
    emit_done(window, request_id).await;
    Ok(full)
}
