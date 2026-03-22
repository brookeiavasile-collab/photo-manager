# Photo Manager - Project Knowledge Base

**Generated:** 2026-03-22
**Stack:** Tauri 2.0 (Rust) + React 18 + Vite

---

## OVERVIEW

本地照片/视频管理系统，支持按日期搜索、相册分类、标签管理、MD5去重、AI分类、地理位置解析。数据存储在 JSON 文件中。

---

## STRUCTURE

```
photo-manager/
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── main.jsx            # React 入口
│   │   ├── App.jsx             # 路由配置
│   │   ├── pages/              # 页面组件
│   │   ├── components/         # UI 组件
│   │   └── services/api.unified.js  # API 客户端
│   └── package.json
├── src-tauri/                   # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── lib.rs              # 注册所有命令
│   │   ├── commands/           # Tauri 命令处理
│   │   ├── models/             # 数据模型
│   │   ├── scanner/            # 照片/视频扫描器
│   │   └── store/              # JSON 存储
│   ├── Cargo.toml
│   └── tauri.conf.json
├── data/                        # JSON 数据存储
└── thumbnails/                  # 缩略图缓存
```

---

## WHERE TO LOOK

| 任务 | 位置 | 说明 |
|------|------|------|
| 添加新 Tauri 命令 | `src-tauri/src/commands/` | 按资源分文件 |
| 注册新命令 | `src-tauri/src/lib.rs` | 添加到 invoke_handler |
| 修改数据模型 | `src-tauri/src/models/` | Photo, Video, Album, Tag, Config |
| 修改数据存储 | `src-tauri/src/store/data_store.rs` | JSON 读写 |
| 修改缓存存储 | `src-tauri/src/store/cache_store.rs` | GPS/AI 缓存 |
| 修改照片扫描 | `src-tauri/src/scanner/photo_scanner.rs` | EXIF、MD5、缩略图 |
| 修改视频扫描 | `src-tauri/src/scanner/video_scanner.rs` | 元数据、缩略图 |
| 修改地理编码 | `src-tauri/src/scanner/geocoder.rs` | GPS → 地址 |
| 添加前端页面 | `frontend/src/pages/` | React Router 路由 |
| 修改 API 调用 | `frontend/src/services/api.unified.js` | Tauri invoke 封装 |

---

## COMMANDS

```bash
# 开发
./dev-tauri.sh              # 启动开发环境
npx tauri dev               # 或直接运行

# 打包
./build-tauri.sh            # 打包应用
npx tauri build             # 或直接运行
```

---

## DATA MODELS

### Photo

```json
{
  "id": "uuid",
  "path": "/full/path/to/file.jpg",
  "filename": "file.jpg",
  "md5": "hash...",
  "createdAt": "ISO8601",
  "dateTaken": "ISO8601",
  "thumbnail": "thumb_*.jpg",
  "clickCount": 0,
  "deleted": false,
  "tags": [],
  "albums": [],
  "exif": { "make", "model", "gps": {...} },
  "address": { "country", "province", "city" },
  "category": "风景|人物|美食|...",
  "aiTags": ["标签1", "标签2"]
}
```

### Video

```json
{
  "id": "uuid",
  "path": "/full/path/to/file.mp4",
  "filename": "file.mp4",
  "md5": "hash...",
  "type": "video",
  "createdAt": "ISO8601",
  "dateTaken": "ISO8601",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "thumbnail": "thumb_*.jpg"
}
```

---

## TAURI COMMANDS

| 命令 | 文件 | 说明 |
|------|------|------|
| `get_photos` | commands/photos.rs | 获取所有照片 |
| `get_photo` | commands/photos.rs | 获取单张照片 |
| `update_photo` | commands/photos.rs | 更新照片信息 |
| `delete_photo` | commands/photos.rs | 删除照片 |
| `get_duplicate_photos` | commands/photos.rs | 获取重复照片 |
| `get_videos` | commands/videos.rs | 获取所有视频 |
| `get_video` | commands/videos.rs | 获取单个视频 |
| `delete_video` | commands/videos.rs | 删除视频 |
| `get_duplicate_videos` | commands/videos.rs | 获取重复视频 |
| `get_albums` | commands/albums.rs | 获取所有相册 |
| `create_album` | commands/albums.rs | 创建相册 |
| `update_album` | commands/albums.rs | 更新相册 |
| `delete_album` | commands/albums.rs | 删除相册 |
| `get_tags` | commands/tags.rs | 获取所有标签 |
| `create_tag` | commands/tags.rs | 创建标签 |
| `delete_tag` | commands/tags.rs | 删除标签 |
| `get_directories` | commands/directories.rs | 获取媒体目录列表 |
| `add_directory` | commands/directories.rs | 添加媒体目录 |
| `remove_directory` | commands/directories.rs | 移除媒体目录 |
| `scan_directory` | commands/directories.rs | 扫描目录 |
| `get_scan_state` | commands/directories.rs | 获取扫描状态 |
| `stop_scan` | commands/directories.rs | 停止扫描 |
| `browse` | commands/directories.rs | 浏览目录结构 |
| `get_media` | commands/media.rs | 获取所有媒体 |
| `get_media_page` | commands/media.rs | 游标分页获取媒体 |
| `get_config` | commands/config.rs | 获取配置 |
| `update_config` | commands/config.rs | 更新配置 |
| `get_cache_stats` | commands/cache.rs | 获取缓存统计 |
| `clear_cache` | commands/cache.rs | 清除缓存 |

---

## CACHE SYSTEM

缓存系统用于持久化计算结果，清除目录时不会删除缓存数据。

### GPS 缓存 (gps_cache.json)

```json
{
  "31.230400,121.473700": {
    "country": "中国",
    "province": "上海市", 
    "city": "上海市"
  }
}
```

- Key: 纬度,经度 (6位小数精度)
- 用途: 相同坐标复用地址信息

### AI 缓存 (ai_cache.json)

```json
{
  "md5hash...": {
    "category": "风景",
    "tags": ["天空", "建筑"],
    "confidence": 0.95
  }
}
```

- Key: 文件 MD5 哈希
- 用途: 相同内容复用 AI 分析结果

---

## NOTES

- **序列化**: 所有 Rust struct 使用 `#[serde(rename_all = "camelCase")]`
- **数据存储**: JSON 文件存储在应用同目录的 `data/` 文件夹
- **缩略图**: 存储在应用同目录的 `thumbnails/` 文件夹
- **Tauri invoke**: 前端使用同步 `import { invoke } from '@tauri-apps/api/core'`，不要用异步加载
- **大库性能**: 前端 `MediaGrid` 支持窗口化渲染；Tauri 下首页支持游标分页加载，避免一次性拉全量数据

---

## CHANGELOG

### 2026-03-22

**发布流水线**
- GitHub Actions 通过推送 `v*` tag 触发 Release 构建（Draft）
  - `.github/workflows/release.yml`
- Windows 发布额外产出 portable 压缩包（非安装版）
  - CI 内从 `src-tauri/target/release` 打包并上传 Release
- 修复 macOS universal 构建缺少目标与图标问题
  - Rust targets：`aarch64-apple-darwin` / `x86_64-apple-darwin`
  - 图标：新增 `src-tauri/icons/icon.icns` 并配置到 `tauri.conf.json`

**大库性能与加载策略**
- 首页媒体加载新增游标分页 `get_media_page`
  - 支持 type/year/aiTags 过滤与 dateTaken/createdAt 排序
  - 返回 `items + nextCursor` 用于无限滚动加载更多
  - `src-tauri/src/commands/media.rs`
  - `frontend/src/pages/Home.jsx`
  - `frontend/src/services/api.unified.js`
- 分页模式下重复统计由后端提供 `duplicateCount`，确保角标可用
  - `src-tauri/src/commands/media.rs`
- 卡片列表优化：窗口化渲染 + 浏览器级跳过布局/绘制
  - `frontend/src/components/MediaGrid.jsx`
  - `frontend/src/styles/MediaGrid.css`

**设置页展示**
- 设置页照片/视频统计改为 SVG 图标展示
  - `frontend/src/pages/Settings.jsx`
  - `frontend/src/components/icons/AppIcons.jsx`

**新增视频 GPS 提取和地址展示**
- 扩展 Video 模型，添加 `exif` 和 `address` 字段
  - `src-tauri/src/models/video.rs`
- 视频扫描器新增 GPS 提取功能
  - 使用 ffprobe 提取视频元数据中的 GPS 信息
  - 支持 ISO6709 格式位置字符串解析（如 `+31.2304+121.4737/`）
  - 自动调用地理编码获取地址并缓存
  - `src-tauri/src/scanner/video_scanner.rs`
- 补全地址功能支持视频
  - `backfill_photo_addresses` 命令现在同时处理照片和视频
  - `src-tauri/src/commands/directories.rs`
- 前端视频详情展示拍摄地点
  - 无效坐标 (0, 0) 显示"拍摄地点：无效坐标"
  - `frontend/src/components/VideoModal.jsx`

**优化扫描性能**
- 照片/视频扫描改为并行处理，使用 rayon 线程池
- 并发数量由配置 `scanConcurrency` 控制（默认按 CPU 核心数，限制 2~12）
- 缩略图已存在时跳过重新生成
- GPS/AI 缓存改为扫描结束后批量落盘
- 增量扫描：未变化的文件复用已有记录
  - `src-tauri/src/scanner/photo_scanner.rs`
  - `src-tauri/src/scanner/video_scanner.rs`
  - `src-tauri/src/commands/directories.rs`

**新增补全地址功能**
- 设置页新增"补全地址"按钮
- 只处理有 GPS 但缺少地址的媒体，不重新生成缩略图
- 支持实时进度显示和状态恢复
  - `src-tauri/src/commands/directories.rs`
  - `frontend/src/pages/Settings.jsx`

**修复 GPS 提取问题**
- 修复照片扫描器 GPS 坐标解析，改为直接读取 EXIF Rational 值
  - `src-tauri/src/scanner/photo_scanner.rs`

**新增照片分辨率提取**
- EXIF 中提取 PixelXDimension 和 PixelYDimension
- 如果 EXIF 无尺寸信息，从图片文件直接读取
- 增量扫描自动补充分辨率：已有 exif 但缺少 width/height 时，从图片读取尺寸补充
- 修复无 EXIF 数据的图片（如营业执照、截图）也能提取尺寸
 - 无 EXIF 的截图等图片可从文件名回退提取拍摄时间（如 `Screenshot_2021-04-03-11-38-32-24.jpg`）
 - 增量扫描会自动修正错误使用 `createdAt` 作为 `dateTaken` 的旧照片记录
  - `src-tauri/src/scanner/photo_scanner.rs`
  - `src-tauri/src/commands/directories.rs`
- 前端 normalizeMediaItem 将 exif.width/height 提取到顶层，统一照片和视频的分辨率显示
  - `frontend/src/pages/Home.jsx`

**前端优化**
- 详情左右切换改为按混合列表（照片+视频）导航
  - `frontend/src/pages/Home.jsx`
  - `frontend/src/components/PhotoModal.jsx`
  - `frontend/src/components/VideoModal.jsx`
- 卡片和详情始终显示地址信息，无地址显示"拍摄地点：空"
  - `frontend/src/components/MediaGrid.jsx`
  - `frontend/src/components/PhotoModal.jsx`
  - `frontend/src/components/VideoModal.jsx`
- 所有 Tauri invoke 调用改为使用 `callApi` 统一封装
  - `frontend/src/services/api.unified.js`
- 点击媒体增加观看次数
  - `src-tauri/src/commands/photos.rs`
  - `src-tauri/src/commands/videos.rs`
- 照片和视频详情添加放大缩小功能
  - 支持按钮缩放、双指缩放、触控板缩放、拖拽移动、重置缩放
  - 放大后支持单指/双指平移，优化 transform 逻辑减少缩放拖动抖动
  - `frontend/src/components/PhotoModal.jsx`
  - `frontend/src/components/VideoModal.jsx`
  - `frontend/src/styles/PhotoModal.css`
  - `frontend/src/styles/VideoModal.css`
- 前端添加 favicon，修复开发环境 `favicon.ico` 404
  - `frontend/index.html`
  - `frontend/public/favicon.png`

**回收站功能完善**
- 清空回收站会真正删除磁盘文件
  - `src-tauri/src/commands/trash.rs`
- 删除重复项移入回收站而非永久删除
  - `src-tauri/src/commands/photos.rs`
  - `src-tauri/src/commands/videos.rs`

**Windows 打包脚本**
- 新增 `build-tauri-windows.ps1` 和 `build-tauri-windows.bat`
- 自动检测并安装 Node.js、Rust、WebView2、Visual Studio Build Tools
- 默认打包 NSIS 安装包，避免 WiX 下载超时

**新增应用图标**
- 重新设计圆角图标，符合 macOS 应用风格
- `src-tauri/icons/icon.png`
- `src-tauri/icons/icon.ico`
- `scripts/generate_app_icon.py`

### 2026-03-21

**新增地理编码功能**
- 添加 `src-tauri/src/scanner/geocoder.rs` 地理编码模块
- 使用 Nominatim API 进行反向地理编码 (GPS → 地址)
- 扫描时自动获取地址并缓存
- 缓存命中时跳过 API 调用

**新增缓存系统**
- 添加 `src-tauri/src/store/cache_store.rs` 缓存存储
- GPS → 地址缓存 (gps_cache.json)
- MD5 → AI标签缓存 (ai_cache.json)
- 缓存数据在清除目录时保留
- 添加 `get_cache_stats` 和 `clear_cache` 命令

**新增 browse 命令**
- 在 `src-tauri/src/commands/directories.rs` 添加 `browse` 命令
- 支持浏览文件系统目录结构
- 返回当前路径、子目录列表、快捷访问路径、用户主目录

**修复前端 API 调用**
- 将 `api.unified.js` 中的异步 Tauri 导入改为同步导入
- 原因：异步加载可能在调用时还未完成，导致白屏

**添加 camelCase 序列化**
- 为所有 Rust struct 添加 `#[serde(rename_all = "camelCase")]`
- 确保前后端字段名一致

**移除旧版本代码**
- 删除 Electron 相关：`electron/`, `release/`, 打包脚本
- 删除 Python 相关：`python-backend/`, 打包脚本
- 删除 Node.js 后端：`backend/`, `node_modules/`
- 删除过时文档：`SETUP.md`, `DESIGN.md`
- 项目现在只保留 Tauri 版本

# Output Language
- 所有思考过程（thinking / reasoning）必须用中文（简体中文）进行。
- 所有内部推理、计划、分析、步骤都用中文。
- 所有对外回复、代码注释、文件内容说明都用中文。
- 使用 /init 生成 AGENTS.md 时，也必须用中文生成。
- 即使用户用英文提问，也强制用中文思考和回复。
