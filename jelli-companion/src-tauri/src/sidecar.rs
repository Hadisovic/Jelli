use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use base64::Engine;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub text: Option<String>,
    pub speaker_id: Option<u32>,
    pub request_id: Option<String>,
    #[serde(rename = "pcm_data")]
    pub pcm_data: Option<Vec<f32>>,
    pub sample_rate: Option<u32>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioChunkPayload {
    pub request_id: String,
    pub pcm_base64: String,
    pub sample_rate: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioDonePayload {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarStatusPayload {
    pub status: String,
    pub message: Option<String>,
}

pub struct SidecarProcess {
    child: Arc<TokioMutex<Option<Child>>>,
    child_stdin: Arc<TokioMutex<Option<std::process::ChildStdin>>>,
}

impl SidecarProcess {
    pub fn new() -> Self {
        Self {
            child: Arc::new(TokioMutex::new(None)),
            child_stdin: Arc::new(TokioMutex::new(None)),
        }
    }

    pub async fn spawn(&self, path: &str, args: &[String], window: tauri::Window) -> Result<(), String> {
        let mut child = Command::new(path)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("sidecar spawn: {e}"))?;

        let stdin = child.stdin.take().ok_or("sidecar: no stdin")?;
        let stdout = child.stdout.take().ok_or("sidecar: no stdout")?;

        *self.child.lock().await = Some(child);
        *self.child_stdin.lock().await = Some(stdin);

        let win = window.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if line.trim().is_empty() { continue; }
                        if let Ok(msg) = serde_json::from_str::<SidecarMessage>(&line) {
                            match msg.msg_type.as_str() {
                                "pong" => { /* heartbeat response — ignore */ }
                                "ready" => {
                                    let _ = win.emit("sidecar:status", SidecarStatusPayload {
                                        status: "ready".into(),
                                        message: None,
                                    });
                                }
                                "audio" | "audio_done" | "error" => {
                                    let rid = msg.request_id.clone().unwrap_or_default();
                                    if let (Some(pcm), Some(sr)) = (msg.pcm_data, msg.sample_rate) {
                                        let base64 = base64_encode_f32(&pcm);
                                        let _ = win.emit("audio:chunk", AudioChunkPayload {
                                            request_id: rid.clone(),
                                            pcm_base64: base64,
                                            sample_rate: sr,
                                        });
                                    }
                                    if msg.msg_type == "audio_done" {
                                        let _ = win.emit("audio:done", AudioDonePayload {
                                            request_id: rid.clone(),
                                        });
                                    }
                                    if msg.msg_type == "error" {
                                        let _ = win.emit("audio:error", serde_json::json!({
                                            "request_id": rid,
                                            "message": msg.message.unwrap_or_default(),
                                        }));
                                    }
                                }
                                other => {
                                    eprintln!("[sidecar] Unknown message type: {other}");
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = win.emit("sidecar:status", SidecarStatusPayload {
                            status: "error".into(),
                            message: Some(format!("sidecar read: {e}")),
                        });
                        break;
                    }
                }
            }
            let _ = win.emit("sidecar:status", SidecarStatusPayload {
                status: "stopped".into(),
                message: None,
            });
        });

        let win2 = window.clone();
        let child_arc = self.child.clone();
        let stdin_arc = self.child_stdin.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                interval.tick().await;
                {
                    let mut guard = child_arc.lock().await;
                    if let Some(ref mut c) = *guard {
                        if let Ok(Some(_)) = c.try_wait() {
                            let _ = win2.emit("sidecar:status", SidecarStatusPayload {
                                status: "stopped".into(),
                                message: Some("process exited".into()),
                            });
                            break;
                        }
                    } else {
                        break;
                    }
                }
                // Send heartbeat
                let mut stdin_guard = stdin_arc.lock().await;
                if let Some(ref mut stdin) = *stdin_guard {
                    let _ = writeln!(stdin, r#"{{"type":"heartbeat"}}"#);
                    let _ = stdin.flush();
                }
            }
        });

        let _ = window.emit("sidecar:status", SidecarStatusPayload {
            status: "running".into(),
            message: None,
        });

        Ok(())
    }

    pub async fn send_tts(&self, request_id: &str, text: &str, speaker_id: u32, quantization: &str) -> Result<(), String> {
        let msg = serde_json::json!({
            "type": "tts",
            "text": text,
            "speaker_id": speaker_id,
            "request_id": request_id,
            "quantization": quantization,
        });
        let mut guard = self.child_stdin.lock().await;
        if let Some(ref mut stdin) = *guard {
            writeln!(stdin, "{}", msg).map_err(|e| format!("sidecar write: {e}"))?;
            stdin.flush().map_err(|e| format!("sidecar flush: {e}"))?;
            Ok(())
        } else {
            Err("sidecar: not running".into())
        }
    }

    pub async fn is_running(&self) -> bool {
        let mut guard = self.child.lock().await;
        if let Some(ref mut c) = *guard {
            matches!(c.try_wait(), Ok(None))
        } else {
            false
        }
    }

    pub async fn kill(&self) {
        let mut guard = self.child.lock().await;
        if let Some(ref mut c) = *guard {
            let _ = c.kill();
            let _ = c.wait();
        }
        *guard = None;
        *self.child_stdin.lock().await = None;
    }
}

fn base64_encode_f32(samples: &[f32]) -> String {
    let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}
