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

fn is_cancelled(request_id: &str, map: &CancelMap) -> bool {
    map.try_lock().map(|g| g.get(request_id).copied().unwrap_or(false)).unwrap_or(false)
}

pub async fn stream_llm(
    window: &tauri::Window,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel_map: &CancelMap,
) -> Result<String, String> {
    let rid = request_id.to_string();
    match config.provider.as_str() {
        "ollama" => stream_ollama(window, &rid, messages, config, cancel_map).await,
        "openai" => stream_openai(window, &rid, messages, config, cancel_map).await,
        "anthropic" => stream_anthropic(window, &rid, messages, config, cancel_map).await,
        "gemini" => stream_gemini(window, &rid, messages, config, cancel_map).await,
        "deepseek" => stream_deepseek(window, &rid, messages, config, cancel_map).await,
        p => Err(format!("unsupported provider: {p}")),
    }
}

async fn emit_token(window: &tauri::Window, request_id: &str, token: &str) {
    let _ = window.emit("llm:token", TokenPayload {
        request_id: request_id.to_string(),
        token: token.to_string(),
    });
}

async fn emit_done(window: &tauri::Window, request_id: &str) {
    let _ = window.emit("llm:done", LlmDonePayload {
        request_id: request_id.to_string(),
    });
}

#[allow(dead_code)]
async fn emit_error(window: &tauri::Window, request_id: &str, message: &str) {
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

async fn stream_ollama(
    window: &tauri::Window,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("ollama"));
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
        "options": {
            "temperature": config.temperature.unwrap_or(0.7),
            "num_predict": config.max_tokens.unwrap_or(2048),
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

async fn stream_openai(
    window: &tauri::Window,
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

async fn stream_deepseek(
    window: &tauri::Window,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    stream_openai(window, request_id, messages, config, cancel).await
}

// ── Anthropic ───────────────────────────────────────────────────────────────

async fn stream_anthropic(
    window: &tauri::Window,
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

async fn stream_gemini(
    window: &tauri::Window,
    request_id: &str,
    messages: &[ChatMessage],
    config: &ProviderConfig,
    cancel: &CancelMap,
) -> Result<String, String> {
    let base = config.api_url.as_deref().unwrap_or(default_url("gemini"));
    let key = config.api_key.as_deref().ok_or("gemini: no api key")?;
    let gemini_contents: Vec<serde_json::Value> = messages.iter().map(|m| {
        serde_json::json!({
            "role": if m.role == "assistant" { "model" } else { "user" },
            "parts": [{"text": m.content}]
        })
    }).collect();
    let body = serde_json::json!({
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": config.temperature.unwrap_or(0.7),
            "maxOutputTokens": config.max_tokens.unwrap_or(2048),
        }
    });
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

async fn parse_sse_stream<F>(
    window: &tauri::Window,
    request_id: &str,
    resp: reqwest::Response,
    cancel: &CancelMap,
    extract: F,
) -> Result<String, String>
where
    F: Fn(&serde_json::Value) -> Option<String>,
{
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
