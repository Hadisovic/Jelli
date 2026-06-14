mod llm;
mod sidecar;

use llm::{CancelMap, ChatMessage, ProviderConfig};
use sidecar::SidecarProcess;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::Manager;

struct AppState {
    cancel_map: CancelMap,
    sidecar: Arc<SidecarProcess>,
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_sidecar(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    path: String,
    args: Vec<String>,
) -> Result<(), String> {
    state.sidecar.spawn(&path, &args, window).await
}

#[tauri::command]
async fn check_sidecar_health(state: tauri::State<'_, AppState>) -> Result<bool, ()> {
    Ok(state.sidecar.is_running().await)
}

#[tauri::command]
async fn stop_sidecar(state: tauri::State<'_, AppState>) -> Result<(), ()> {
    state.sidecar.kill().await;
    Ok(())
}

#[tauri::command]
async fn send_chat_message(
    window: tauri::Window,
    state: tauri::State<'_, AppState>,
    request_id: String,
    messages: Vec<ChatMessage>,
    config: ProviderConfig,
) -> Result<(), String> {
    // Register cancellation flag
    state.cancel_map.lock().unwrap().insert(request_id.clone(), false);

    let rid = request_id.clone();
    let cancel_map = state.cancel_map.clone();
    let sid = state.sidecar.clone(); // SidecarProcess is behind Arc<Mutex<...>> internally

    tokio::spawn(async move {
        // Stream LLM tokens
        let result = llm::stream_llm(
            &window,
            &rid,
            &messages,
            &config,
            &cancel_map,
        ).await;

        // On completion or error, send full text to TTS
        match result {
            Ok(full_text) => {
                if !full_text.is_empty() {
            let speaker_id = config.speaker_id.unwrap_or(0);
            let quantization = config.quantization.clone().unwrap_or("fp16".into());
            let _ = sid.send_tts(&rid, &full_text, speaker_id, &quantization).await;
                }
            }
            Err(e) => {
                let _ = window.emit("llm:error", llm::LlmErrorPayload {
                    request_id: rid.clone(),
                    message: e,
                });
            }
        }

        // Clean up cancellation flag
        cancel_map.lock().unwrap().remove(&rid);
    });

    Ok(())
}

#[tauri::command]
async fn stop_generation(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> Result<(), ()> {
    state.cancel_map.lock().unwrap().insert(request_id, true);
    Ok(())
}

#[tauri::command]
async fn send_tts(
    state: tauri::State<'_, AppState>,
    request_id: String,
    text: String,
    speaker_id: u32,
    quantization: String,
) -> Result<(), String> {
    state.sidecar.send_tts(&request_id, &text, speaker_id, &quantization).await
}

#[tauri::command]
fn start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn set_window_geometry(window: tauri::Window, x: f64, y: f64, width: f64, height: f64) {
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
}

// ── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize shared state
            app.manage(AppState {
                cancel_map: Arc::new(Mutex::new(std::collections::HashMap::new())),
                sidecar: Arc::new(SidecarProcess::new()),
            });

            // Position window at bottom-right
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(true);
                let _ = window.set_resizable(false);
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let phys = monitor.size();
                    let scale = monitor.scale_factor();
                    let lw = phys.width as f64 / scale;
                    let lh = phys.height as f64 / scale;
                    let w = 400.0;
                    let h = 60.0;
                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                        width: w,
                        height: h,
                    }));
                    let _ = window.set_position(tauri::Position::Logical(
                        tauri::LogicalPosition {
                            x: lw - w - 20.0,
                            y: lh - h - 40.0,
                        },
                    ));
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_dragging,
            set_window_geometry,
            start_sidecar,
            check_sidecar_health,
            stop_sidecar,
            send_chat_message,
            stop_generation,
            send_tts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
