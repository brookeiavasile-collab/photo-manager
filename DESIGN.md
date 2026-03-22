# Photo Manager - 设计文档

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Tauri 应用                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐     ┌─────────────────────────────┐   │
│  │   React 前端     │     │       Rust 后端             │   │
│  │   (frontend/)   │     │      (src-tauri/)           │   │
│  │                 │     │                             │   │
│  │  • React 18     │◄───►│  • Tauri Commands           │   │
│  │  • React Router │     │  • Photo/Video Scanner      │   │
│  │  • Vite         │     │  • JSON Data Store          │   │
│  │  • Axios        │     │  • EXIF/元数据提取           │   │
│  │                 │     │  • MD5 计算                  │   │
│  └─────────────────┘     └─────────────────────────────┘   │
│                                       │                     │
│                                       ▼                     │
│                          ┌─────────────────────┐           │
│                          │   本地文件存储       │           │
│                          │   • data/*.json     │           │
│                          │   • thumbnails/     │           │
│                          └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## 技术选型

### 为什么选择 Tauri？

| 特性 | Tauri | Electron |
|------|-------|----------|
| 安装包大小 | ~10MB | ~128MB |
| 内存占用 | ~50MB | ~150MB |
| 启动速度 | 快 | 较慢 |
| 后端语言 | Rust | Node.js |
| 安全性 | 高 | 中 |

### 为什么用 Rust 后端？

- **性能**：原生性能，无 GC 停顿
- **安全**：内存安全，无空指针异常
- **并发**：async/await + tokio 高效并发
- **跨平台**：一次编写，支持 macOS/Windows/Linux

## 数据模型

### Photo

```rust
struct Photo {
    id: String,           // UUID
    path: String,         // 文件完整路径
    filename: String,     // 文件名
    size: u64,            // 文件大小 (bytes)
    created_at: String,   // 创建时间 (ISO8601)
    modified_at: String,  // 修改时间 (ISO8601)
    date_taken: Option<String>,  // 拍摄时间 (EXIF)
    exif: Option<Exif>,   // EXIF 信息
    address: Option<Address>, // 地址信息
    category: String,     // 分类：风景|人物|美食|...
    ai_tags: Vec<String>, // AI 标签
    thumbnail: Option<String>, // 缩略图路径
    md5: Option<String>,  // MD5 哈希 (去重)
    tags: Vec<String>,    // 用户标签
    notes: String,        // 备注
    albums: Vec<String>,  // 所属相册 ID
    click_count: u32,     // 点击次数
    deleted: bool,        // 是否删除
    deleted_at: Option<String>, // 删除时间
}
```

### Video

```rust
struct Video {
    id: String,
    path: String,
    filename: String,
    size: u64,
    created_at: String,
    modified_at: String,
    media_type: String,   // 固定为 "video"
    date_taken: Option<String>,
    duration: Option<f64>, // 时长 (秒)
    width: Option<u32>,
    height: Option<u32>,
    codec: Option<String>,
    fps: Option<u32>,
    bitrate: Option<u64>,
    thumbnail: Option<String>,
    md5: Option<String>,
    tags: Vec<String>,
    notes: String,
    albums: Vec<String>,
    click_count: u32,
    deleted: bool,
    deleted_at: Option<String>,
}
```

### Album / Tag / Config

```rust
struct Album {
    id: String,
    name: String,
    description: String,
    photo_ids: Vec<String>,
    video_ids: Vec<String>,
    created_at: String,
    updated_at: String,
}

struct Tag {
    id: String,
    name: String,
    count: u32,
}

struct Config {
    photo_directories: Vec<String>,
    thumbnail_size: u32,
    supported_formats: Vec<String>,
    video_formats: Vec<String>,
    image_classification: ImageClassification,
}
```

## 核心功能

### 1. 照片/视频扫描

```
用户添加目录 → 扫描文件 → 提取元数据 → 计算MD5 → 生成缩略图 → 存储JSON
                │
                ├── 照片: EXIF (时间、GPS、相机信息)
                └── 视频: ffprobe (时长、分辨率、编码)
```

### 2. MD5 去重

```
扫描文件 → 计算 MD5 → 查找相同 MD5 → 标记为重复
                          │
                          └── 用户可选择删除重复项
```

### 3. 地理位置解析

```
EXIF GPS (lat, lng) → 查缓存 → 命中: 直接返回
                              ↓ 未命中
                    Nominatim API → 地址信息
                              ↓
                        保存到缓存
                              │
                              ├── country
                              ├── province
                              ├── city
                              └── display_name
```

使用 OpenStreetMap Nominatim 免费地理编码服务，精度约 11 米（6 位小数）。

### 4. AI 分类 (可选)

```
照片 → 图像分类模型 → 分类结果 (风景|人物|美食|...)
                    │
                    └── AI 标签
```

## API 设计

### Tauri Commands

前端通过 `invoke()` 调用 Rust 后端：

```javascript
// 前端
import { invoke } from '@tauri-apps/api/core'

// 获取所有照片
const photos = await invoke('get_photos')

// 添加目录
const result = await invoke('add_directory', { path: '/Users/xxx/Pictures' })

// 扫描目录
await invoke('scan_directory', { path: '/Users/xxx/Pictures' })
```

### 命令列表

| 命令 | 参数 | 返回值 |
|------|------|--------|
| `get_photos` | - | `Vec<Photo>` |
| `get_photo` | `id` | `Photo` |
| `update_photo` | `id, data` | `Photo` |
| `delete_photo` | `id` | `bool` |
| `get_videos` | - | `Vec<Video>` |
| `get_albums` | - | `Vec<Album>` |
| `create_album` | `name, description` | `Album` |
| `get_tags` | - | `Vec<Tag>` |
| `create_tag` | `name` | `Tag` |
| `get_directories` | - | `Vec<DirectoryInfo>` |
| `add_directory` | `path` | `Vec<DirectoryInfo>` |
| `remove_directory` | `path` | `Vec<DirectoryInfo>` |
| `browse` | `path?` | `BrowseResponse` |
| `scan_directory` | `path, force?` | `ScanState` |
| `get_media_page` | `params` | `MediaPageResponse` |
| `get_config` | - | `Config` |
| `update_config` | `config` | `Config` |
| `get_cache_stats` | - | `CacheStats` |
| `clear_cache` | `type?` | `CacheStats` |

### 游标分页（大库优化）

当媒体数量较大（10k+）时，为降低前端首屏卡顿与内存占用，桌面端使用游标分页加载媒体：

- 后端命令：`get_media_page`
- 返回：`items + nextCursor`（`nextCursor` 为空表示没有更多）
- 游标稳定性：游标基于排序键（时间戳 + filename + id）编码，避免 offset 在数据变化时产生跳页/重复
- 重复角标：后端在分页返回中直接写入 `duplicateCount`，确保分页模式下仍可展示重复统计

前端通过 IntersectionObserver 触发加载更多，并对卡片网格启用窗口化渲染，避免一次性渲染全量 DOM。

## 发布与分发

### GitHub Actions 发布

项目已配置 GitHub Actions 发布工作流（推送 `v*` tag 触发构建并生成 Draft Release）。

产物：
- macOS：universal `.app/.dmg`
- Windows：`.msi`、`-setup.exe`，以及 portable 压缩包（包含主程序 exe 与必要运行库）

注意：需要在 GitHub 仓库设置中启用工作流写权限（Read and write permissions），否则会出现 Release API 权限错误。

## 文件存储

### 数据文件位置

应用运行时，数据存储在应用同目录：

```
<应用目录>/
├── PhotoManager.app (macOS) 或 PhotoManager.exe (Windows)
├── data/
│   ├── data.json        # 照片、视频、相册、标签数据
│   ├── config.json      # 配置
│   ├── gps_cache.json   # GPS → 地址缓存
│   └── ai_cache.json    # MD5 → AI标签缓存
└── thumbnails/          # 缩略图缓存
    ├── thumb_xxx.jpg
    └── ...
```

### 缓存系统

为了提高性能并避免重复计算，系统实现了两个持久化缓存：

#### GPS → 地址缓存

```json
// data/gps_cache.json
{
  "31.230400,121.473700": {
    "country": "中国",
    "province": "上海市",
    "city": "上海市",
    "displayName": "上海市黄浦区外滩"
  }
}
```

- **Key**: 纬度,经度 (精度6位小数，约11米)
- **用途**: 同一地点的照片复用地址信息
- **持久化**: 清除目录时保留

#### MD5 → AI标签缓存

```json
// data/ai_cache.json
{
  "d41d8cd98f00b204e9800998ecf8427e": {
    "category": "风景",
    "tags": ["天空", "建筑", "日落"],
    "confidence": 0.95
  }
}
```

- **Key**: 文件 MD5 哈希值
- **用途**: 相同内容的照片复用AI分析结果
- **持久化**: 清除目录时保留

#### 缓存命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `get_cache_stats` | - | 获取缓存统计 |
| `clear_cache` | `type?` | 清除缓存 (gps/ai/all) |

### JSON 格式示例

```json
// data/photos.json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "path": "/Users/kit/Pictures/photo.jpg",
    "filename": "photo.jpg",
    "createdAt": "2024-03-21T10:30:00Z",
    "dateTaken": "2024-03-20T15:45:00Z",
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "thumbnail": "thumb_550e8400.jpg",
    "exif": {
      "make": "Apple",
      "model": "iPhone 15 Pro",
      "gps": { "latitude": 31.2304, "longitude": 121.4737 }
    },
    "address": {
      "country": "中国",
      "province": "上海市",
      "city": "上海市"
    },
    "category": "风景",
    "aiTags": ["天空", "建筑"],
    "clickCount": 5
  }
]
```

## 构建与发布

### 开发环境

```bash
# 安装依赖
cd frontend && npm install

# 启动开发服务器
npx tauri dev
```

### 生产构建

```bash
# 构建
npx tauri build

# 产物位置
# macOS: src-tauri/target/release/bundle/dmg/
# Windows: src-tauri/target/release/bundle/msi/
```

### GitHub Actions (CI/CD)

```yaml
# .github/workflows/build.yml
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: ${{ github.ref_name }}
```

## 安全考虑

1. **文件访问**：只访问用户选择的目录
2. **数据安全**：不修改原始文件，只存储元数据
3. **软删除**：删除操作只是标记，可恢复
4. **本地存储**：所有数据存储在本地，不上传云端

## 性能优化

1. **缩略图缓存**：避免重复生成
2. **惰性加载**：滚动时按需加载
3. **MD5 缓存**：存储计算结果
4. **并发扫描**：多线程处理大量文件
5. **GPS缓存**：相同坐标复用地址信息
6. **AI缓存**：相同内容复用分析结果（以MD5为key）

## 未来计划

- [ ] 人脸识别
- [ ] 相似图片搜索
- [ ] 云同步备份
- [ ] 移动端应用
- [ ] 批量编辑功能
