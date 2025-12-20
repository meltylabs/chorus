#[cfg(target_os = "macos")]
use crate::window::WebviewWindowExt;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
#[cfg(not(target_os = "macos"))]
use screenshots::Screen;
use tauri::{AppHandle, Emitter, Manager};
#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;

use crate::SPOTLIGHT_LABEL;

// Target size in bytes (3.5MB) for image resizing
// This is used as the maximum size for images in the application
// and should match TARGET_IMAGE_SIZE_BYTES in src/ui/hooks/useAttachments.ts
// Changing this value will affect the size of all images processed by the application
const TARGET_SIZE_BYTES: u64 = 4_500_000;

#[tauri::command]
pub fn show(app_handle: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let panel = app_handle.get_webview_panel(SPOTLIGHT_LABEL).unwrap();
        panel.show();
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app_handle.get_window(SPOTLIGHT_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
pub fn hide(app_handle: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let panel = app_handle.get_webview_panel(SPOTLIGHT_LABEL).unwrap();
        if panel.is_visible() {
            panel.order_out(None);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app_handle.get_window(SPOTLIGHT_LABEL) {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
pub fn open_in_main_window(app_handle: AppHandle, chat_id: String) {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().unwrap();
        window.set_focus().unwrap();
        app_handle
            .emit_to("main", "open_quick_chat_in_main_window", chat_id)
            .unwrap();
    }
}

#[tauri::command]
pub fn new_quick_chat(app_handle: AppHandle) {
    app_handle.emit_to("main", "new_quick_chat", ()).unwrap();
}

#[tauri::command]
pub fn refresh_projects_state(app_handle: AppHandle) {
    app_handle.emit("refresh_projects_state", ()).unwrap();
}

#[tauri::command]
pub fn chat_deleted(app_handle: AppHandle, chat_id: String) {
    app_handle.emit("chat_deleted", chat_id).unwrap();
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub fn update_panel_theme(app_handle: AppHandle, is_dark_mode: bool) {
    if let Some(window) = app_handle.get_webview_window(SPOTLIGHT_LABEL) {
        window.update_theme(is_dark_mode);
    }
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub fn capture_window() -> Result<String, String> {
    use std::fs;
    use std::process::Command;
    use std::time::Instant;

    // Start timing the operation
    let start_time = Instant::now();
    println!("Starting window capture...");

    // Create a temporary file path
    let raw_screenshot_path = std::env::temp_dir().join("screenshot_raw.png");

    // Run screencapture command
    let capture_time = Instant::now();
    let output = Command::new("screencapture")
        .arg("-w") // Window capture mode - allows user to select a window
        .arg(raw_screenshot_path.to_str().unwrap())
        .output()
        .map_err(|e| e.to_string())?;

    println!("Raw capture completed in: {:?}", capture_time.elapsed());

    // Check if the command failed
    if !output.status.success() {
        return Err("Screen recording permission is required. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording".to_string());
    }

    // Check if file exists and has content
    if !raw_screenshot_path.exists() {
        return Err("Screen recording permission denied. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording".to_string());
    }

    // Use our resize_image function to handle the resizing
    let resized_path = resize_image(
        raw_screenshot_path.to_string_lossy().to_string(),
        TARGET_SIZE_BYTES,
    )?;

    // Read the resized file and convert to base64
    let image_data = fs::read(&resized_path).map_err(|e| e.to_string())?;

    // Clean up the temporary files
    let _ = fs::remove_file(&raw_screenshot_path);
    if resized_path != raw_screenshot_path.to_string_lossy().to_string() {
        let _ = fs::remove_file(&resized_path);
    }

    println!(
        "Total window capture process took: {:?}",
        start_time.elapsed()
    );
    Ok(BASE64.encode(&image_data))
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn capture_window() -> Result<String, String> {
    // For non-macOS platforms, just capture the active window
    // This is a placeholder - you may want to implement platform-specific window capture
    Err("Window capture not implemented for this platform".to_string())
}

#[tauri::command]
#[cfg(target_os = "macos")]
pub fn capture_whole_screen(app_handle: AppHandle) -> Result<String, String> {
    use std::fs;
    use std::process::Command;
    use std::time::Instant;

    // Start timing the operation
    let start_time = Instant::now();
    println!("Starting screenshot capture...");

    // Create temporary file path for raw screenshot
    let raw_screenshot_path = std::env::temp_dir().join("screenshot_raw.png");

    // Get information about the current window
    if let Some(window) = app_handle.get_webview_window(SPOTLIGHT_LABEL) {
        if let Ok(position) = window.outer_position() {
            // Log window position for debugging
            println!("Window position: ({}, {})", position.x, position.y);

            // First, get the main display bounds to determine if we're on a secondary display
            // Use a temporary script to get this info
            let script_path = std::env::temp_dir().join("display_info.sh");
            let script_content = r#"#!/bin/bash
/usr/sbin/system_profiler SPDisplaysDataType | grep -A 15 "Display Type: Built-in" | grep "Resolution:" | head -n 1 | awk -F': ' '{print $2}' | sed 's/ Retina//' | awk -F' x ' '{print $1, $2}'
"#;
            fs::write(&script_path, script_content).map_err(|e| e.to_string())?;
            Command::new("chmod")
                .arg("+x")
                .arg(&script_path)
                .output()
                .map_err(|e| e.to_string())?;

            let main_display_output = Command::new(&script_path)
                .output()
                .map_err(|e| e.to_string())?;
            let _ = fs::remove_file(&script_path);

            // Parse main display resolution
            let main_display_resolution = String::from_utf8_lossy(&main_display_output.stdout);
            let parts: Vec<&str> = main_display_resolution.trim().split_whitespace().collect();

            let main_width = if parts.len() >= 1 {
                parts[0].parse::<i32>().unwrap_or(3456)
            } else {
                3456
            };
            let main_height = if parts.len() >= 2 {
                parts[1].parse::<i32>().unwrap_or(2234)
            } else {
                2234
            };

            println!("Main display resolution: {}x{}", main_width, main_height);

            // Simple heuristic: If window position is outside main display bounds,
            // it's likely on a secondary display
            let target_display_id = if position.x > main_width || position.y > main_height {
                // It's likely on secondary display (typically ID 2)
                2
            } else {
                // It's likely on main display
                1
            };

            println!("Detected window on display ID: {}", target_display_id);

            // Run screencapture command for the specific display
            println!("Taking screenshot of display ID: {}", target_display_id);

            let capture_time = Instant::now();
            let output = Command::new("screencapture")
                .arg("-D") // Specify display
                .arg(target_display_id.to_string())
                .arg(raw_screenshot_path.to_str().unwrap())
                .output()
                .map_err(|e| e.to_string())?;

            println!("Raw capture completed in: {:?}", capture_time.elapsed());

            // Check if the command failed
            if !output.status.success() {
                // If the specific display capture failed, try without a display ID
                println!(
                    "Failed to capture display {}. Falling back to main display.",
                    target_display_id
                );

                let fallback_output = Command::new("screencapture")
                    .arg("-m") // Capture main display as fallback
                    .arg(raw_screenshot_path.to_str().unwrap())
                    .output()
                    .map_err(|e| e.to_string())?;

                if !fallback_output.status.success() {
                    return Err("Screen recording permission is required. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording".to_string());
                }
            }

            // Check if file exists and has content
            if !raw_screenshot_path.exists() {
                return Err("Screen recording permission denied. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording".to_string());
            }

            // Use our new resize_image function to handle the resizing
            let resized_path = resize_image(
                raw_screenshot_path.to_string_lossy().to_string(),
                TARGET_SIZE_BYTES,
            )?;

            // Read the resized file and convert to base64
            let image_data = fs::read(&resized_path).map_err(|e| e.to_string())?;

            // Clean up the resized file if it's not the same as the raw screenshot
            if resized_path != raw_screenshot_path.to_string_lossy().to_string() {
                let _ = fs::remove_file(&resized_path);
            }

            println!("Total screenshot process took: {:?}", start_time.elapsed());
            return Ok(BASE64.encode(&image_data));
        }
    }

    // Fallback to the main display if window not found
    println!("Window information not available, using main display");

    let output = Command::new("screencapture")
        .arg("-m") // Capture the main display only
        .arg(raw_screenshot_path.to_str().unwrap())
        .output()
        .map_err(|e| e.to_string())?;

    // Check if the command failed
    if !output.status.success() {
        return Err("Screen recording permission is required. Please enable it in System Preferences > Security & Privacy > Privacy > Screen Recording".to_string());
    }

    // Use our new resize_image function to handle the resizing
    let resized_path = resize_image(
        raw_screenshot_path.to_string_lossy().to_string(),
        TARGET_SIZE_BYTES,
    )?;

    // Read the resized file and convert to base64
    let image_data = fs::read(&resized_path).map_err(|e| e.to_string())?;

    // Clean up the resized file if it's not the same as the raw screenshot
    if resized_path != raw_screenshot_path.to_string_lossy().to_string() {
        let _ = fs::remove_file(&resized_path);
    }

    println!("Total screenshot process took: {:?}", start_time.elapsed());
    Ok(BASE64.encode(&image_data))
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn capture_whole_screen(app_handle: AppHandle) -> Result<String, String> {
    use image::{DynamicImage, ImageBuffer, ImageFormat};
    use std::time::Instant;

    // Start timing the operation
    let start_time = Instant::now();
    println!("Starting screenshot capture...");

    // For non-macOS platforms, use the screenshots crate to capture the entire screen
    let screens = Screen::all().map_err(|e| e.to_string())?;

    // Try to get the window position to determine which screen it's on
    if let Some(window) = app_handle.get_webview_window(SPOTLIGHT_LABEL) {
        if let Ok(position) = window.outer_position() {
            println!("Window position: ({}, {})", position.x, position.y);

            // Try to find which screen contains the window
            for screen in &screens {
                let display_info = screen.display_info;

                // Check if the window's position is within this screen's bounds
                if position.x >= display_info.x as i32
                    && position.y >= display_info.y as i32
                    && position.x < (display_info.x + display_info.width) as i32
                    && position.y < (display_info.y + display_info.height) as i32
                {
                    // Log the display information
                    println!(
                        "Taking screenshot of display at position ({}, {})",
                        display_info.x, display_info.y
                    );
                    println!(
                        "Display dimensions: {}x{}",
                        display_info.width, display_info.height
                    );

                    // Capture this specific screen
                    let capture_time = Instant::now();
                    let image = screen.capture().map_err(|e| e.to_string())?;
                    println!("Raw capture completed in: {:?}", capture_time.elapsed());

                    // Get image dimensions and raw pixels
                    let width = image.width();
                    let height = image.height();
                    let pixels = image.as_raw();

                    // Create a temporary file to save the raw screenshot
                    let temp_dir = std::env::temp_dir();
                    let raw_screenshot_path = temp_dir.join("screenshot_raw.png");

                    // Create a buffer to store the image data
                    let compress_time = Instant::now();

                    // Convert from RGBA to an image file
                    let img_buffer = ImageBuffer::from_raw(width, height, pixels.to_vec())
                        .ok_or("Failed to create image buffer")?;

                    let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

                    // Save the image to a temporary file
                    dynamic_image
                        .save(&raw_screenshot_path)
                        .map_err(|e| e.to_string())?;

                    println!("Raw image saved in: {:?}", compress_time.elapsed());

                    // Use our new resize_image function to handle the resizing
                    let resized_path = resize_image(
                        raw_screenshot_path.to_string_lossy().to_string(),
                        TARGET_SIZE_BYTES,
                    )?;

                    // Read the resized file and convert to base64
                    let image_data = std::fs::read(&resized_path).map_err(|e| e.to_string())?;

                    // Clean up the temporary files
                    let _ = std::fs::remove_file(&raw_screenshot_path);
                    if resized_path != raw_screenshot_path.to_string_lossy().to_string() {
                        let _ = std::fs::remove_file(&resized_path);
                    }

                    println!("Total screenshot process took: {:?}", start_time.elapsed());
                    return Ok(BASE64.encode(&image_data));
                }
            }
        }
    }

    // Fallback to the main screen if we couldn't find the right screen
    println!("Window not found on any display, using main display");
    let screen = screens.first().ok_or("No screen found")?;

    // Log the display information
    let display_info = screen.display_info;
    println!(
        "Taking screenshot of main display at position ({}, {})",
        display_info.x, display_info.y
    );
    println!(
        "Display dimensions: {}x{}",
        display_info.width, display_info.height
    );

    // Capture the screen
    let capture_time = Instant::now();
    let image = screen.capture().map_err(|e| e.to_string())?;
    println!("Raw capture completed in: {:?}", capture_time.elapsed());

    // Get image dimensions and raw pixels
    let width = image.width();
    let height = image.height();
    let pixels = image.as_raw();

    // Create a temporary file to save the raw screenshot
    let temp_dir = std::env::temp_dir();
    let raw_screenshot_path = temp_dir.join("screenshot_raw.png");

    // Create a buffer to store the image data
    let compress_time = Instant::now();

    // Convert from RGBA to an image file
    let img_buffer = ImageBuffer::from_raw(width, height, pixels.to_vec())
        .ok_or("Failed to create image buffer")?;

    let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

    // Save the image to a temporary file
    dynamic_image
        .save(&raw_screenshot_path)
        .map_err(|e| e.to_string())?;

    println!("Raw image saved in: {:?}", compress_time.elapsed());

    // Use our new resize_image function to handle the resizing
    let resized_path = resize_image(
        raw_screenshot_path.to_string_lossy().to_string(),
        TARGET_SIZE_BYTES,
    )?;

    // Read the resized file and convert to base64
    let image_data = std::fs::read(&resized_path).map_err(|e| e.to_string())?;

    // Clean up the temporary files
    let _ = std::fs::remove_file(&raw_screenshot_path);
    if resized_path != raw_screenshot_path.to_string_lossy().to_string() {
        let _ = std::fs::remove_file(&resized_path);
    }

    println!("Total screenshot process took: {:?}", start_time.elapsed());
    Ok(BASE64.encode(&image_data))
}

#[tauri::command]
pub fn resize_image(file_path: String, target_size_bytes: u64) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::time::Instant;

    // Start timing the operation
    let start_time = Instant::now();
    println!("Starting image resize for: {}", file_path);

    // Create temporary file paths
    let input_path = Path::new(&file_path);
    let file_stem = input_path.file_stem().ok_or("Invalid file path")?;

    // Create temporary path for output
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("{}_resized.jpg", file_stem.to_string_lossy()));

    // Check if file exists
    if !input_path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Get file size
    let file_size = fs::metadata(&file_path).map_err(|e| e.to_string())?.len();
    println!(
        "Original file size: {} bytes ({:.2} MB)",
        file_size,
        file_size as f64 / 1_048_576.0
    );

    // If file is already small enough, just return the original path
    if file_size <= target_size_bytes {
        println!("File already under target size, skipping compression");
        return Ok(file_path);
    }

    // For very small size reductions, just use compression
    if file_size < target_size_bytes * 2 {
        // Use high quality for small reductions
        let quality = "85%";

        #[cfg(target_os = "macos")]
        {
            println!("Using compression only with quality: {}", quality);
            let sips_output = Command::new("sips")
                .arg("-s")
                .arg("format")
                .arg("jpeg")
                .arg("-s")
                .arg("formatOptions")
                .arg(quality)
                .arg(input_path.to_str().unwrap())
                .arg("--out")
                .arg(output_path.to_str().unwrap())
                .output()
                .map_err(|e| e.to_string())?;

            if !sips_output.status.success() {
                println!("Compression failed, using original image");
                return Ok(file_path);
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            use image::{io::Reader as ImageReader, ImageFormat};
            println!("Using compression only with quality: {}", quality);

            // Parse quality percentage
            let quality_value = quality.trim_end_matches('%').parse::<u8>().unwrap_or(85);

            // Read the image
            let img = ImageReader::open(input_path)
                .map_err(|e| e.to_string())?
                .decode()
                .map_err(|e| e.to_string())?;

            // Save with compression
            img.save_with_format(output_path.to_str().unwrap(), ImageFormat::Jpeg)
                .map_err(|e| e.to_string())?;
        }

        let compressed_size = fs::metadata(&output_path).map_err(|e| e.to_string())?.len();
        println!(
            "Compressed size: {} bytes ({:.2} MB)",
            compressed_size,
            compressed_size as f64 / 1_048_576.0
        );

        if compressed_size <= target_size_bytes {
            println!("Compression successful, under target size");
            return Ok(output_path.to_string_lossy().to_string());
        }

        println!("Simple compression not sufficient, proceeding to resize");
    }

    // Simple resize strategy: calculate dimensions based on target size
    // For JPEG: ~0.5 bytes per pixel at high quality is a reasonable estimate
    // Typical scaling factor for JPEG compression at good quality
    let bytes_per_pixel_estimation = 0.5;

    // When we need to do both dimension reduction and compression
    #[cfg(target_os = "macos")]
    {
        // First, get the image dimensions
        let sips_info = Command::new("sips")
            .arg("-g")
            .arg("pixelWidth")
            .arg("-g")
            .arg("pixelHeight")
            .arg(input_path.to_str().unwrap())
            .output()
            .map_err(|e| e.to_string())?;

        let info_str = String::from_utf8_lossy(&sips_info.stdout);

        // Parse dimensions from sips output
        let width_line = info_str.lines().find(|line| line.contains("pixelWidth"));
        let height_line = info_str.lines().find(|line| line.contains("pixelHeight"));

        let parse_dimension = |line: Option<&str>| -> Result<u32, String> {
            let value = line
                .ok_or("Could not find dimension in sips output")?
                .split(':')
                .nth(1)
                .ok_or("Invalid sips output format")?
                .trim()
                .parse::<u32>()
                .map_err(|e| e.to_string())?;
            Ok(value)
        };

        let original_width = parse_dimension(width_line)?;
        let original_height = parse_dimension(height_line)?;

        println!(
            "Original dimensions: {}x{}",
            original_width, original_height
        );

        // Calculate the area in pixels and estimate the size reduction needed
        let original_pixels = original_width as f64 * original_height as f64;
        let target_pixels = target_size_bytes as f64 / bytes_per_pixel_estimation;

        // Calculate the scale factor - square root because we're scaling in 2D
        let scale_factor = ((target_pixels / original_pixels) as f64).sqrt() * 0.9; // 10% safety margin

        // Never go below 30% quality
        let scale_factor = scale_factor.max(0.3);

        // Calculate new dimensions
        let new_width = (original_width as f64 * scale_factor).round() as u32;

        println!(
            "Using scale factor {:.2}, new width: {}",
            scale_factor, new_width
        );

        // Resize and compress in a single step with high quality
        let sips_output = Command::new("sips")
            .arg("-s")
            .arg("format")
            .arg("jpeg")
            .arg("-s")
            .arg("formatOptions")
            .arg("85%") // High quality
            .arg("--resampleWidth")
            .arg(new_width.to_string())
            .arg(input_path.to_str().unwrap())
            .arg("--out")
            .arg(output_path.to_str().unwrap())
            .output()
            .map_err(|e| e.to_string())?;

        if !sips_output.status.success() {
            println!("Resizing failed, using original image");
            return Ok(file_path);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        use image::{imageops::FilterType, io::Reader as ImageReader, ImageFormat};

        // Read the image
        let img = ImageReader::open(input_path)
            .map_err(|e| e.to_string())?
            .decode()
            .map_err(|e| e.to_string())?;

        // Get original dimensions
        let original_width = img.width();
        let original_height = img.height();

        println!(
            "Original dimensions: {}x{}",
            original_width, original_height
        );

        // Calculate the area in pixels and estimate the size reduction needed
        let original_pixels = original_width as f64 * original_height as f64;
        let target_pixels = target_size_bytes as f64 / bytes_per_pixel_estimation;

        // Calculate the scale factor - square root because we're scaling in 2D
        let scale_factor = ((target_pixels / original_pixels) as f64).sqrt() * 0.9; // 10% safety margin

        // Never go below 30% quality
        let scale_factor = scale_factor.max(0.3);

        // Calculate new dimensions
        let new_width = (original_width as f64 * scale_factor).round() as u32;
        let new_height = (original_height as f64 * scale_factor).round() as u32;

        println!(
            "Using scale factor {:.2}, new dimensions: {}x{}",
            scale_factor, new_width, new_height
        );

        // Resize the image
        let resized = img.resize(new_width, new_height, FilterType::Lanczos3);

        // Save with high quality compression
        resized
            .save_with_format(output_path.to_str().unwrap(), ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
    }

    // Check final size
    let final_size = fs::metadata(&output_path).map_err(|e| e.to_string())?.len();
    println!(
        "Final size: {} bytes ({:.2} MB)",
        final_size,
        final_size as f64 / 1_048_576.0
    );

    println!("Total image processing took: {:?}", start_time.elapsed());
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // Open System Settings directly to Screen Recording privacy settings
        Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"])
            .output()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening screen recording settings is only supported on macOS".to_string())
    }
}

#[tauri::command]
pub fn get_instance_name() -> Result<String, String> {
    // Get the instance name from the environment variable set by our script
    match std::env::var("CHORUS_INSTANCE_NAME") {
        Ok(name) => Ok(name),
        Err(_) => Ok("".to_string()), // Return empty string if not set
    }
}

#[tauri::command]
pub async fn write_file_async(path: String, content: Option<Vec<u8>>, source_path: Option<String>) -> Result<(), String> {
    use std::path::Path;
    
    // Use Tauri's async runtime to perform the write operation
    tauri::async_runtime::spawn_blocking(move || {
        // Ensure parent directory exists
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        
        if let Some(src_path) = source_path {
            // Copy file from source path (avoids IPC for large files)
            std::fs::copy(&src_path, &path).map_err(|e| e.to_string())?;
        } else if let Some(data) = content {
            // Write content directly (backward compatibility)
            std::fs::write(&path, data).map_err(|e| e.to_string())?;
        } else {
            return Err("Either content or source_path must be provided".to_string());
        }
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    
    Ok(())
}

#[tauri::command]
pub fn get_file_metadata(path: String) -> Result<serde_json::Value, String> {
    use std::fs;

    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "size": metadata.len(),
        "isFile": metadata.is_file(),
        "isDirectory": metadata.is_dir()
    }))
}

#[tauri::command]
pub async fn check_claude_code_available() -> Result<serde_json::Value, String> {
    use std::process::Command;

    let result = tauri::async_runtime::spawn_blocking(|| {
        let which_output = Command::new("which")
            .arg("claude")
            .output();

        let cli_exists = match which_output {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        if !cli_exists {
            return serde_json::json!({
                "available": false,
                "version": null,
                "authenticated": false
            });
        }

        let version_output = Command::new("claude")
            .arg("--version")
            .output();

        let version = match version_output {
            Ok(output) if output.status.success() => {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            }
            _ => None,
        };

        serde_json::json!({
            "available": true,
            "version": version,
            "authenticated": true
        })
    }).await.map_err(|e| format!("Failed to check Claude Code availability: {}", e))?;

    Ok(result)
}

/// Stream a response from Claude Code CLI
/// This spawns the claude CLI process and emits events as responses stream in
#[tauri::command]
pub async fn stream_claude_code_response(
    app_handle: AppHandle,
    request_id: String,
    prompt: String,
    system_prompt: Option<String>,
    model: Option<String>,
    disable_project_context: Option<bool>,
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    // Build the command
    let mut cmd = Command::new("claude");
    cmd.arg("-p") // Print mode (non-interactive)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--permission-mode")
        .arg("bypassPermissions"); // Auto-approve for chat use

    // If we want to disable project context, only load user settings
    // but keep tools enabled so we can see tool calls in the UI
    let disable_context = disable_project_context.unwrap_or(true);
    if disable_context {
        // Only load user settings, not project-specific ones
        cmd.arg("--setting-sources").arg("user");
        // Run from home directory to avoid picking up any project context
        if let Ok(home) = std::env::var("HOME") {
            cmd.current_dir(home);
        }
    }

    // Add model if specified
    if let Some(m) = model {
        cmd.arg("--model").arg(m);
    }

    // Add system prompt - use append to keep Claude Code's base capabilities
    // but add our general assistant instructions
    if let Some(sp) = system_prompt {
        if !sp.is_empty() {
            cmd.arg("--append-system-prompt").arg(sp);
        }
    } else if disable_context {
        // Default prompt for general assistant mode
        cmd.arg("--append-system-prompt")
            .arg("You are a helpful general assistant. Answer questions directly and helpfully. Do not reference any specific project or codebase context.");
    }

    // Add the prompt as the final argument
    cmd.arg(&prompt);

    // Set up stdio
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude CLI: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let request_id_clone = request_id.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn a thread to read stdout and emit events
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(json_line) => {
                    if !json_line.is_empty() {
                        // Emit each JSON line as an event
                        let _ = app_handle_clone.emit(
                            &format!("claude-code-stream-{}", request_id_clone),
                            serde_json::json!({
                                "type": "data",
                                "data": json_line
                            })
                        );
                    }
                }
                Err(e) => {
                    let _ = app_handle_clone.emit(
                        &format!("claude-code-stream-{}", request_id_clone),
                        serde_json::json!({
                            "type": "error",
                            "error": format!("Failed to read line: {}", e)
                        })
                    );
                    break;
                }
            }
        }
    });

    // Spawn a thread to read stderr
    let request_id_clone2 = request_id.clone();
    let app_handle_clone2 = app_handle.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut stderr_content = String::new();

        for line in reader.lines() {
            if let Ok(l) = line {
                stderr_content.push_str(&l);
                stderr_content.push('\n');
            }
        }

        if !stderr_content.is_empty() {
            let _ = app_handle_clone2.emit(
                &format!("claude-code-stream-{}", request_id_clone2),
                serde_json::json!({
                    "type": "stderr",
                    "data": stderr_content
                })
            );
        }
    });

    // Wait for the process to complete in a separate task
    let request_id_clone3 = request_id.clone();
    let app_handle_clone3 = app_handle.clone();

    tauri::async_runtime::spawn_blocking(move || {
        match child.wait() {
            Ok(status) => {
                let _ = app_handle_clone3.emit(
                    &format!("claude-code-stream-{}", request_id_clone3),
                    serde_json::json!({
                        "type": "done",
                        "exitCode": status.code()
                    })
                );
            }
            Err(e) => {
                let _ = app_handle_clone3.emit(
                    &format!("claude-code-stream-{}", request_id_clone3),
                    serde_json::json!({
                        "type": "error",
                        "error": format!("Process error: {}", e)
                    })
                );
            }
        }
    });

    Ok(())
}
