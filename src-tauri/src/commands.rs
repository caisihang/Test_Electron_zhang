// Tauri 命令层：合同文件夹扫描、附件导入与预览、系统打开
// 约定：数据库只存相对路径（biz_type/biz_id/文件名），文件实体放在 app_data_dir/attachments/
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use walkdir::WalkDir;

/// 扫描文件夹时允许识别的合同类扩展名
const DOC_EXTS: [&str; 11] = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "webp",
];

/// 文件夹中的一个文件
#[derive(Serialize)]
pub struct FolderFile {
  pub name: String,
  pub path: String,
  pub relative_path: String,
  pub size: u64,
  pub modified: u64,
  pub ext: String,
}

/// 附件元信息（与前端 AttachmentMeta 对齐）
#[derive(Serialize)]
pub struct AttachmentMeta {
  pub path: String,
  pub name: String,
  pub size: u64,
  pub mime: String,
  pub created_at: String,
}

/// 扫描指定文件夹下的全部合同类文件（递归，最多 8 层）
#[tauri::command]
pub fn scan_contract_folder(app: tauri::AppHandle, dir: String) -> Result<Vec<FolderFile>, String> {
  let root = PathBuf::from(&dir);
  if !root.is_dir() {
    return Err(format!("目录不存在：{dir}"));
  }
  // 动态授权 asset 协议读取该目录，供前端预览图片
  app
    .asset_protocol_scope()
    .allow_directory(&root, true)
    .map_err(|e| format!("授权目录失败：{e}"))?;

  let mut files = Vec::new();
  for entry in WalkDir::new(&root)
    .max_depth(8)
    .follow_links(false)
    .into_iter()
    .filter_map(|item| item.ok())
  {
    if !entry.file_type().is_file() {
      continue;
    }
    let path = entry.path();
    let ext = path
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .to_lowercase();
    if !DOC_EXTS.contains(&ext.as_str()) {
      continue;
    }
    let meta = match entry.metadata() {
      Ok(meta) => meta,
      Err(_) => continue,
    };
    let modified = meta
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs())
      .unwrap_or(0);
    // 相对路径统一用 / 分隔，便于前端展示与分组
    let relative_path = path
      .strip_prefix(&root)
      .map(|value| value.to_string_lossy().replace('\\', "/"))
      .unwrap_or_default();
    files.push(FolderFile {
      name: path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default(),
      path: path.to_string_lossy().to_string(),
      relative_path,
      size: meta.len(),
      modified,
      ext,
    });
  }
  // 按相对路径排序，层级有序
  files.sort_by(|a, b| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()));
  Ok(files)
}

/// 读取指定文件的元信息（单文件/多文件上传时使用），并授权所在目录供预览
#[tauri::command]
pub fn stat_files(app: tauri::AppHandle, paths: Vec<String>) -> Result<Vec<FolderFile>, String> {
  let mut files = Vec::new();
  for raw in paths {
    let path = PathBuf::from(&raw);
    if !path.is_file() {
      continue;
    }
    let ext = path
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .to_lowercase();
    if !DOC_EXTS.contains(&ext.as_str()) {
      continue;
    }
    // 动态授权父目录，保证 asset 协议能直接预览图片 / PDF
    if let Some(parent) = path.parent() {
      let _ = app.asset_protocol_scope().allow_directory(parent, false);
    }
    let meta = match fs::metadata(&path) {
      Ok(meta) => meta,
      Err(_) => continue,
    };
    let modified = meta
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs())
      .unwrap_or(0);
    files.push(FolderFile {
      name: path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default(),
      path: path.to_string_lossy().to_string(),
      relative_path: path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default(),
      size: meta.len(),
      modified,
      ext,
    });
  }
  Ok(files)
}

/// 读取文件字节（PDF/文本预览兜底；返回二进制避免大数组 JSON 序列化）
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
  let bytes = fs::read(&path).map_err(|e| format!("读取文件失败：{e}"))?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// 便携数据目录：优先 exe 同目录 data/，不可写时回退 app_data_dir/data
/// 说明：安装到 Program Files 等只读位置时自动回退，避免保存失败
fn portable_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  // 1) 尝试 exe 同目录（用户目录安装时通常可写）
  if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() {
      let candidate = parent.join("data");
      if fs::create_dir_all(&candidate).is_ok() {
        let probe = candidate.join(".writable");
        if fs::write(&probe, b"1").is_ok() {
          let _ = fs::remove_file(&probe);
          return Ok(candidate);
        }
      }
    }
  }
  // 2) 回退到系统应用数据目录
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("获取数据目录失败：{e}"))?
    .join("data");
  fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
  Ok(dir)
}

/// 读取数据库快照；文件不存在时返回空字节（前端会新建库）
#[tauri::command]
pub fn db_load(app: tauri::AppHandle) -> Result<tauri::ipc::Response, String> {
  let dir = portable_data_dir(&app)?;
  let path = dir.join("finance.db");
  let backup = dir.join("finance.db.bak");
  // 主文件缺失但备份存在时，用备份兜底（上次写入中断的场景）
  let target = if path.is_file() { path } else { backup };
  let bytes = if target.is_file() {
    fs::read(&target).map_err(|e| format!("读取数据库失败：{e}"))?
  } else {
    Vec::new()
  };
  Ok(tauri::ipc::Response::new(bytes))
}

/// 保存数据库快照：写临时文件 -> 旧文件转 .bak -> 替换，避免中断损坏
#[tauri::command]
pub fn db_save(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
  let dir = portable_data_dir(&app)?;
  let path = dir.join("finance.db");
  let tmp = dir.join("finance.db.tmp");
  let backup = dir.join("finance.db.bak");
  fs::write(&tmp, &bytes).map_err(|e| format!("写入数据库失败：{e}"))?;
  if path.exists() {
    let _ = fs::remove_file(&backup);
    fs::rename(&path, &backup).map_err(|e| format!("备份旧数据库失败：{e}"))?;
  }
  fs::rename(&tmp, &path).map_err(|e| format!("替换数据库失败：{e}"))?;
  Ok(())
}

/// 附件根目录：与数据库同级的 data/attachments
fn attachments_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(portable_data_dir(app)?.join("attachments"))
}

/// 校验相对路径，禁止绝对路径与 .. 越界
fn safe_relative(relative: &str) -> Result<PathBuf, String> {
  if relative.contains("..") {
    return Err("非法的附件路径".into());
  }
  let rel = Path::new(relative);
  if rel.is_absolute() {
    return Err("非法的附件路径".into());
  }
  Ok(rel.to_path_buf())
}

/// 导入附件：复制到 attachments/{biz_type}/{biz_id}/时间戳_文件名，返回相对路径
#[tauri::command]
pub fn import_attachment(
  app: tauri::AppHandle,
  source_path: String,
  biz_type: String,
  biz_id: i64,
) -> Result<String, String> {
  let source = PathBuf::from(&source_path);
  if !source.is_file() {
    return Err(format!("源文件不存在：{source_path}"));
  }
  let dir = attachments_root(&app)?.join(&biz_type).join(biz_id.to_string());
  fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败：{e}"))?;
  let file_name = source
    .file_name()
    .map(|value| value.to_string_lossy().to_string())
    .unwrap_or_else(|| "file".to_string());
  // 时间戳前缀避免同名文件互相覆盖
  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  let dest = dir.join(format!("{stamp}_{file_name}"));
  fs::copy(&source, &dest).map_err(|e| format!("复制文件失败：{e}"))?;
  Ok(format!(
    "{}/{}/{}",
    biz_type,
    biz_id,
    dest.file_name().map(|v| v.to_string_lossy().to_string()).unwrap_or_default()
  ))
}

/// 相对路径 -> 绝对路径（限定在 attachments 根目录内）
#[tauri::command]
pub fn resolve_attachment_path(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
  let rel = safe_relative(&relative_path)?;
  let abs = attachments_root(&app)?.join(rel);
  Ok(abs.to_string_lossy().to_string())
}

/// 删除附件文件
#[tauri::command]
pub fn delete_attachment(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
  let rel = safe_relative(&relative_path)?;
  let abs = attachments_root(&app)?.join(rel);
  if abs.exists() {
    fs::remove_file(&abs).map_err(|e| format!("删除失败：{e}"))?;
  }
  Ok(())
}

/// 列出某业务下的附件（合同详情/流水凭证使用）
#[tauri::command]
pub fn list_attachments(
  app: tauri::AppHandle,
  biz_type: String,
  biz_id: i64,
) -> Result<Vec<AttachmentMeta>, String> {
  let dir = attachments_root(&app)?.join(&biz_type).join(biz_id.to_string());
  if !dir.is_dir() {
    return Ok(vec![]);
  }
  let mut list = Vec::new();
  for entry in fs::read_dir(&dir)
    .map_err(|e| format!("读取目录失败：{e}"))?
    .filter_map(|item| item.ok())
  {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let meta = match entry.metadata() {
      Ok(meta) => meta,
      Err(_) => continue,
    };
    let name = path
      .file_name()
      .map(|value| value.to_string_lossy().to_string())
      .unwrap_or_default();
    let modified = meta
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs())
      .unwrap_or(0);
    let mime = match path
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .to_lowercase()
      .as_str()
    {
      "pdf" => "application/pdf",
      "doc" => "application/msword",
      "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "xls" => "application/vnd.ms-excel",
      "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "png" => "image/png",
      "jpg" | "jpeg" => "image/jpeg",
      "webp" => "image/webp",
      _ => "application/octet-stream",
    };
    list.push(AttachmentMeta {
      path: format!("{}/{}/{}", biz_type, biz_id, name),
      name,
      size: meta.len(),
      mime: mime.into(),
      // 用修改时间（秒）字符串占位，前端只用于排序
      created_at: modified.to_string(),
    });
  }
  // 新文件排前面
  list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  Ok(list)
}

/// 递归列出全部附件的相对路径（备份打包用）
#[tauri::command]
pub fn list_all_attachments(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  let root = attachments_root(&app)?;
  if !root.is_dir() {
    return Ok(vec![]);
  }
  let mut list = Vec::new();
  for entry in WalkDir::new(&root).into_iter().filter_map(|item| item.ok()) {
    if !entry.file_type().is_file() {
      continue;
    }
    let rel = entry
      .path()
      .strip_prefix(&root)
      .map(|value| value.to_string_lossy().replace('\\', "/"))
      .unwrap_or_default();
    if !rel.is_empty() {
      list.push(rel);
    }
  }
  Ok(list)
}

/// 读取附件字节（备份打包用）
#[tauri::command]
pub fn read_attachment(
  app: tauri::AppHandle,
  relative_path: String,
) -> Result<tauri::ipc::Response, String> {
  let rel = safe_relative(&relative_path)?;
  let abs = attachments_root(&app)?.join(rel);
  let bytes = fs::read(&abs).map_err(|e| format!("读取附件失败：{e}"))?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// 写入附件（恢复备份时使用）
#[tauri::command]
pub fn write_attachment(
  app: tauri::AppHandle,
  relative_path: String,
  bytes: Vec<u8>,
) -> Result<(), String> {
  let rel = safe_relative(&relative_path)?;
  let abs = attachments_root(&app)?.join(rel);
  if let Some(parent) = abs.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("创建附件目录失败：{e}"))?;
  }
  fs::write(&abs, &bytes).map_err(|e| format!("写入附件失败：{e}"))?;
  Ok(())
}

/// 清空附件目录（恢复前调用，避免新旧附件混杂）
#[tauri::command]
pub fn clear_attachments(app: tauri::AppHandle) -> Result<(), String> {
  let root = attachments_root(&app)?;
  if root.is_dir() {
    fs::remove_dir_all(&root).map_err(|e| format!("清空附件失败：{e}"))?;
  }
  Ok(())
}

/// 用系统默认程序打开文件或文件夹
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
  if !PathBuf::from(&path).exists() {
    return Err(format!("路径不存在：{path}"));
  }
  #[cfg(target_os = "windows")]
  {
    // Windows：start 的第一个空参数是窗口标题占位，避免路径被当成标题
    std::process::Command::new("cmd")
      .args(["/C", "start", "", &path])
      .spawn()
      .map_err(|e| format!("打开失败：{e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&path)
      .spawn()
      .map_err(|e| format!("打开失败：{e}"))?;
    return Ok(());
  }
  #[cfg(all(unix, not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&path)
      .spawn()
      .map_err(|e| format!("打开失败：{e}"))?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("当前平台不支持".into())
}

/// 把前端传来的 base64 内容写入用户选定的路径（导出 Excel / 备份包）
#[tauri::command]
pub fn write_file_bytes(path: String, base64_data: String) -> Result<(), String> {
  use base64::{engine::general_purpose::STANDARD, Engine};
  let bytes = STANDARD
    .decode(base64_data.as_bytes())
    .map_err(|e| format!("内容解码失败：{e}"))?;
  let target = PathBuf::from(&path);
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
  }
  fs::write(&target, bytes).map_err(|e| format!("写入文件失败：{e}"))?;
  Ok(())
}
