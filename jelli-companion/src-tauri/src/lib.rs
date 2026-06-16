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
    state.cancel_map.lock().unwrap().insert(request_id.clone(), false);

    let rid = request_id.clone();
    let cancel_map = state.cancel_map.clone();
    let sid = state.sidecar.clone();

    tokio::spawn(async move {
        let result = llm::stream_llm(
            &window,
            &rid,
            &messages,
            &config,
            &cancel_map,
        ).await;

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

// ── Window commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_window_position(window: tauri::Window) -> Result<(f64, f64), String> {
    match window.outer_position() {
        Ok(pos) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            Ok((pos.x as f64 / scale, pos.y as f64 / scale))
        }
        Err(e) => Err(format!("outer_position failed: {}", e)),
    }
}

#[tauri::command]
fn set_window_position(window: tauri::Window, x: f64, y: f64) {
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
}

#[tauri::command]
fn resize_window(window: tauri::Window, width: f64, height: f64) {
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
}

#[tauri::command]
fn set_window_geometry(window: tauri::Window, x: f64, y: f64, width: f64, height: f64) {
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
}

#[tauri::command]
fn get_screen_size(window: tauri::Window) -> Result<(f64, f64), String> {
    match window.current_monitor() {
        Ok(Some(monitor)) => {
            let phys = monitor.size();
            let scale = monitor.scale_factor();
            Ok((phys.width as f64 / scale, phys.height as f64 / scale))
        }
        Ok(None) => Err("no monitor found".into()),
        Err(e) => Err(format!("current_monitor failed: {}", e)),
    }
}

#[tauri::command]
fn get_screen_info(window: tauri::Window) -> Result<((f64, f64), (f64, f64)), String> {
    match window.current_monitor() {
        Ok(Some(monitor)) => {
            let phys = monitor.size();
            let pos = monitor.position();
            let scale = monitor.scale_factor();
            let size = (phys.width as f64 / scale, phys.height as f64 / scale);
            let position = (pos.x as f64 / scale, pos.y as f64 / scale);
            Ok((position, size))
        }
        Ok(None) => Err("no monitor found".into()),
        Err(e) => Err(format!("current_monitor failed: {}", e)),
    }
}

#[tauri::command]
fn show_chat_window(app: tauri::AppHandle, x: f64, y: f64) -> Result<(), String> {
    let chat = app.get_webview_window("chat").ok_or("chat window not found")?;
    chat.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
        .map_err(|e| format!("set_position failed: {}", e))?;
    chat.show().map_err(|e| format!("show failed: {}", e))?;
    Ok(())
}

#[tauri::command]
fn hide_chat_window(app: tauri::AppHandle) -> Result<(), String> {
    let chat = app.get_webview_window("chat").ok_or("chat window not found")?;
    chat.hide().map_err(|e| format!("hide failed: {}", e))?;
    Ok(())
}

#[tauri::command]
fn set_chat_window_position(app: tauri::AppHandle, x: f64, y: f64) -> Result<(), String> {
    let chat = app.get_webview_window("chat").ok_or("chat window not found")?;
    chat.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
        .map_err(|e| format!("set_position failed: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_window_label(window: tauri::Window) -> String {
    window.label().to_string()
}

#[tauri::command]
fn get_cursor_position(window: tauri::Window) -> Result<(f64, f64), String> {
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        use windows_sys::Win32::Foundation::POINT;
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) != 0 {
            let scale = window.scale_factor().unwrap_or(1.0);
            Ok((pt.x as f64 / scale, pt.y as f64 / scale))
        } else {
            Err("GetCursorPos failed".into())
        }
    }
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

            app.manage(AppState {
                cancel_map: Arc::new(Mutex::new(std::collections::HashMap::new())),
                sidecar: Arc::new(SidecarProcess::new()),
            });

            // Compact blob-only window, positioned at bottom-right
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);
                let _ = window.set_resizable(false);
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let phys = monitor.size();
                    let scale = monitor.scale_factor();
                    let lw = phys.width as f64 / scale;
                    let lh = phys.height as f64 / scale;
                    let w = 140.0;
                    let h = 160.0;
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
            get_window_position,
            set_window_position,
            resize_window,
            set_window_geometry,
            get_screen_size,
            get_screen_info,
            get_window_label,
            get_cursor_position,
            show_chat_window,
            hide_chat_window,
            set_chat_window_position,
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
