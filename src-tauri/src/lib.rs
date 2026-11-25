// 应用入口：注册插件与命令
// 说明：命令放在 commands 模块，避免 #[tauri::command] 宏在 crate root 重名
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // 原生文件/文件夹选择框
    .plugin(tauri_plugin_dialog::init())
    // 系统通知
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      commands::db_load,
      commands::db_save,
      commands::scan_contract_folder,
      commands::stat_files,
      commands::read_file_bytes,
      commands::import_attachment,
      commands::resolve_attachment_path,
      commands::delete_attachment,
      commands::list_attachments,
      commands::list_all_attachments,
      commands::read_attachment,
      commands::write_attachment,
      commands::clear_attachments,
      commands::open_path,
      commands::write_file_bytes
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
