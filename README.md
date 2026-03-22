# Photo Manager

本地照片/视频管理系统，使用 Tauri + React 构建。

## 功能特性

- 按拍摄日期范围搜索媒体
- 媒体缩略图预览和详情查看
- 相册分类管理
- 媒体标签和备注功能
- AI 照片分类（人物、风景、美食等）
- MD5 去重识别重复媒体
- 地理位置解析（GPS → 地址）
- 回收站机制

## 技术栈

- **前端**: React 18 + Vite
- **后端**: Rust (Tauri 2.0)
- **桌面应用**: Tauri

## 项目结构

```
photo-manager/
├── frontend/          # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
├── src-tauri/         # Rust 后端
│   ├── src/
│   │   ├── commands/
│   │   ├── models/
│   │   ├── scanner/
│   │   └── store/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── data/              # JSON 数据存储
├── thumbnails/        # 缩略图缓存
├── dev-tauri.sh       # 开发环境脚本
└── build-tauri.sh     # 打包脚本
```

## 开发

### 前置要求

- Node.js 18+
- Rust (通过 [rustup](https://rustup.rs/) 安装)

### 启动开发环境

```bash
./dev-tauri.sh
# 或
npx tauri dev
```

## 打包

```bash
./build-tauri.sh
# 或
npx tauri build
```

产物位置: `src-tauri/target/release/bundle/`

- macOS: `.dmg` 文件
- Windows: `.msi` 和 `.exe` 文件

## 数据存储

桌面版运行时，所有数据存放在应用同目录：

```
<应用所在目录>/
├── PhotoManager.app / PhotoManager.exe
├── data/
│   ├── photos.json
│   ├── videos.json
│   ├── albums.json
│   └── tags.json
└── thumbnails/
```

## 许可证

MIT License