use tauri::menu::{MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager};
#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
use window::WebviewWindowExt;

mod command;
pub mod migrations;
mod window;

const DB_URL: &str = "sqlite:chats.db";

pub const SPOTLIGHT_LABEL: &str = "quick-chat";

fn char_to_code(ch: char) -> Option<Code> {
    match ch {
        'A' => Some(Code::KeyA),
        'B' => Some(Code::KeyB),
        'C' => Some(Code::KeyC),
        'D' => Some(Code::KeyD),
        'E' => Some(Code::KeyE),
        'F' => Some(Code::KeyF),
        'G' => Some(Code::KeyG),
        'H' => Some(Code::KeyH),
        'I' => Some(Code::KeyI),
        'J' => Some(Code::KeyJ),
        'K' => Some(Code::KeyK),
        'L' => Some(Code::KeyL),
        'M' => Some(Code::KeyM),
        'N' => Some(Code::KeyN),
        'O' => Some(Code::KeyO),
        'P' => Some(Code::KeyP),
        'Q' => Some(Code::KeyQ),
        'R' => Some(Code::KeyR),
        'S' => Some(Code::KeyS),
        'T' => Some(Code::KeyT),
        'U' => Some(Code::KeyU),
        'V' => Some(Code::KeyV),
        'W' => Some(Code::KeyW),
        'X' => Some(Code::KeyX),
        'Y' => Some(Code::KeyY),
        'Z' => Some(Code::KeyZ),
        _ => None,
    }
}

fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
    println!("Attempting to parse shortcut: {}", shortcut_str);
    let parts: Vec<&str> = shortcut_str.split('+').map(str::trim).collect();
    println!("Split parts: {:?}", parts);
    if parts.is_empty() {
        println!("No parts found in shortcut string");
        return None;
    }

    let mut modifiers = Modifiers::empty();
    let key_str = parts.last()?;
    println!("Key string: {}", key_str);

    // Parse modifiers from all parts except last
    for modifier in &parts[..parts.len() - 1] {
        println!("Processing modifier: {}", modifier);
        match modifier.to_lowercase().as_str() {
            "alt" => modifiers |= Modifiers::ALT,
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "super" | "cmd" | "command" => modifiers |= Modifiers::SUPER,
            _ => {
                println!("Unknown modifier: {}", modifier);
                return None;
            }
        }
    }
    println!("Final modifiers: {:?}", modifiers);

    let key_lower = key_str.to_lowercase();
    let code = match key_lower.as_str() {
        "space" => Code::Space,
        "enter" => Code::Enter,
        "tab" => Code::Tab,
        "escape" => Code::Escape,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "f13" => Code::F13,
        "f14" => Code::F14,
        "f15" => Code::F15,
        "f16" => Code::F16,
        "f17" => Code::F17,
        "f18" => Code::F18,
        "f19" => Code::F19,
        "f20" => Code::F20,
        "f21" => Code::F21,
        "f22" => Code::F22,
        "f23" => Code::F23,
        "f24" => Code::F24,
        c if c.len() == 1 => {
            let ch = c.chars().next()?;
            char_to_code(ch.to_ascii_uppercase())?
        }
        _ => return None,
    };

    Some(Shortcut::new(Some(modifiers), code))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)] // only enable instrumentation in development builds
    let devtools = tauri_plugin_devtools::init();

    let migrations = migrations::migrations();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_stronghold::Builder::new(|_pass| todo!()).build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_macos_permissions::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    #[cfg(target_os = "macos")]
    let setup_fn = move |app: &mut tauri::App| {
        let handle = app.app_handle();

        // Create the application menu using Tauri v2 API
        let app_menu = SubmenuBuilder::new(app, "Chorus")
            .item(&MenuItem::with_id(
                app,
                "about-chorus",
                "About Chorus",
                true,
                None::<&str>,
            )?)
            .separator()
            .item(&MenuItem::with_id(
                app,
                "settings",
                "Settings",
                true,
                Some("CmdOrCtrl+,"),
            )?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;

        // Create Edit menu
        let edit_menu = SubmenuBuilder::new(app, "Edit")
            .item(&PredefinedMenuItem::undo(app, None)?)
            .item(&PredefinedMenuItem::redo(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::cut(app, None)?)
            .item(&PredefinedMenuItem::copy(app, None)?)
            .item(&PredefinedMenuItem::paste(app, None)?)
            .item(&PredefinedMenuItem::select_all(app, None)?)
            .build()?;

        // Create View menu
        let view_menu = SubmenuBuilder::new(app, "View")
            .item(&PredefinedMenuItem::fullscreen(app, None)?)
            .build()?;

        // Create Window menu
        let window_menu = SubmenuBuilder::new(app, "Window")
            .item(&PredefinedMenuItem::minimize(app, None)?)
            .item(&PredefinedMenuItem::maximize(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::close_window(app, None)?)
            .build()?;

        // Create Shortcuts menu
        let shortcuts_menu = SubmenuBuilder::new(app, "Shortcuts")
            .separator()
            .item(&MenuItem::with_id(
                app,
                "new-chat",
                "New chat",
                true,
                Some("CmdOrCtrl+N"),
            )?)
            .item(&MenuItem::with_id(
                app,
                "new-project",
                "New project",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?)
            .separator()
            .item(&MenuItem::with_id(
                app,
                "settings-shortcut",
                "Settings",
                true,
                Some("CmdOrCtrl+,"),
            )?)
            .build()?;

        // Create Updates menu
        let updates_menu = SubmenuBuilder::new(app, "Updates")
            .item(&MenuItem::with_id(
                app,
                "changelog",
                "Changelog",
                true,
                None::<&str>,
            )?)
            .build()?;

        // Build the complete menu
        let menu = MenuBuilder::new(app)
            .item(&app_menu)
            .item(&edit_menu)
            .item(&view_menu)
            .item(&window_menu)
            .item(&shortcuts_menu)
            .item(&updates_menu)
            .build()?;

        // Set as app menu
        app.set_menu(menu)?;

        // Listen for window focus changes to update menu states
        let app_handle_clone = handle.clone();
        handle.listen("tauri://focus", move |event| {
            // Try to get the window label from the event payload
            let payload = event.payload();
            if let Ok(window_info) = serde_json::from_str::<serde_json::Value>(payload) {
                if let Some(label) = window_info.get("label").and_then(|l| l.as_str()) {
                    // Get the app menu
                    if let Some(menu) = app_handle_clone.menu() {
                        let should_disable = label == SPOTLIGHT_LABEL;

                        // Disable/enable items based on window
                        if let Some(item) = menu.get("new-project") {
                            if let Some(menu_item) = item.as_menuitem() {
                                let _ = menu_item.set_enabled(!should_disable);
                            }
                        }
                    }
                }
            }
        });

        // Setup tray
        let _tray = TrayIconBuilder::new()
            .icon(app.default_window_icon().unwrap().clone())
            .on_tray_icon_event(|tray, event| match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window(SPOTLIGHT_LABEL) {
                        if window.is_visible().unwrap_or(false) {
                            command::hide(app.clone());
                        } else {
                            command::show(app.clone());
                        }
                    }
                }
                _ => {
                    // Silently ignore unhandled events
                }
            })
            .build(app)?;

        // Initialize the store
        let store = handle.store("settings");
        let window = handle.get_webview_window(SPOTLIGHT_LABEL).unwrap();

        // Get theme mode from settings
        let is_dark_mode = store
            .ok()
            .and_then(|store| store.get("settings"))
            .and_then(|settings| {
                settings
                    .as_object()
                    .and_then(|s| s.get("theme"))
                    .and_then(|t| t.get("mode"))
                    .and_then(|m| m.as_str().map(String::from))
            })
            .map(|mode| mode == "dark")
            .unwrap_or(false); // Default to light mode if setting not found

        // Convert the window to a spotlight panel
        let _panel = window.to_spotlight_panel(is_dark_mode)?;

        let cloned_handle = handle.clone();

        // Listen for panel becoming key (gaining focus)
        handle.listen(
            format!("{}_panel_did_become_key", SPOTLIGHT_LABEL),
            move |_| {
                // Emit an event that the frontend can listen for
                cloned_handle.emit("quick-chat-focused", ()).unwrap();
            },
        );

        use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

        // Read the quickChat shortcut from the settings store.
        let store = app.store("settings");
        let quick_chat_shortcut = store
            .ok()
            .and_then(|store| store.get("settings"))
            .and_then(|settings| {
                settings
                    .as_object()
                    .and_then(|s| s.get("quickChat"))
                    .and_then(|t| t.get("shortcut"))
                    .and_then(|m| m.as_str().map(String::from))
            })
            .unwrap_or("Alt+Space".to_string());

        let shortcut = parse_shortcut(&quick_chat_shortcut)
            .unwrap_or(Shortcut::new(Some(Modifiers::ALT), Code::Space));

        // Register the quickChat shortcut.
        app.handle().plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([shortcut])
                .expect("Failed to register shortcut")
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed && event.id == shortcut.id() {
                        let panel = app.get_webview_panel(SPOTLIGHT_LABEL).unwrap();
                        let store = app.store("settings");
                        let quick_chat_enabled = store
                            .ok()
                            .and_then(|store| store.get("settings"))
                            .and_then(|settings| {
                                settings
                                    .as_object()
                                    .and_then(|s| s.get("quickChat"))
                                    .and_then(|t| t.get("enabled"))
                                    .and_then(|e| e.as_bool())
                            })
                            .unwrap_or(false); // Default to enabled if setting not found
                        if quick_chat_enabled {
                            if panel.is_visible() {
                                panel.order_out(None);
                            } else {
                                let handle = app.app_handle();
                                handle.emit("show_quick_chat", ()).unwrap();
                                panel.show();
                            }
                        }
                    }
                })
                .build(),
        )?;

        Ok(())
    };

    #[cfg(not(target_os = "macos"))]
    let setup_fn = move |_app: &mut tauri::App| {
        // No macOS-specific setup needed for other platforms
        Ok(())
    };

    builder
        .setup(setup_fn)
        .on_menu_event(|app, event| {
            // Broadcast menu events to all windows
            // Each window will check if it's focused before processing
            match event.id().as_ref() {
                "new-chat" => {
                    app.emit("menu-new-chat", ()).unwrap();
                }
                "new-project" => {
                    app.emit("menu-new-project", ()).unwrap();
                }
                "settings" | "settings-shortcut" => {
                    app.emit("menu-settings", ()).unwrap();
                }
                "about-chorus" => {
                    app.emit("menu-about", ()).unwrap();
                }
                "changelog" => {
                    app.emit("menu-changelog", ()).unwrap();
                }
                _ => {}
            }
        })
        .on_window_event(|window, event| match event {
            &tauri::WindowEvent::CloseRequested { ref api, .. } => {
                // #[cfg(not(target_os = "macos"))] {
                //   event.window().hide().unwrap();
                // }

                #[cfg(target_os = "macos")]
                {
                    tauri::AppHandle::hide(&window.app_handle()).unwrap();
                }
                api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            command::show,
            command::hide,
            command::open_in_main_window,
            command::new_quick_chat,
            command::refresh_projects_state,
            command::chat_deleted,
            #[cfg(target_os = "macos")]
            command::update_panel_theme,
            command::capture_window,
            command::capture_whole_screen,
            command::resize_image,
            command::open_screen_recording_settings,
            command::get_instance_name,
            command::write_file_async,
            command::get_file_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
