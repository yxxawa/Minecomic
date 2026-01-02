#  Minecomic

> 基于 React + FastAPI 构建的高性能、全离线本地漫画管理与阅读系统。
**100%原汁原味纯AI开发**感谢Gemini支持
**Minecomic** 界面

主界面<img width="2560" height="1528" alt="191129ea-bca6-4ba6-b9a0-4e42eb698fd1" src="https://github.com/user-attachments/assets/71106e42-0e93-4970-b45a-9880ce612911" />
本子下载<img width="2560" height="1528" alt="fc97dc90-0fb2-4fd0-b119-32d7ff8fe3bd" src="https://github.com/user-attachments/assets/be146bfd-2db6-449a-8ede-25318e5f8ee0" />
本子详细页<img width="2560" height="1528" alt="122d68cf-62ae-423c-ba5a-c6d25e0da5a8" src="https://github.com/user-attachments/assets/1af3b8b9-c2e6-46d0-b2ae-4227725f4609" />
阅读器，支持单/双页/滚动模式<img width="2560" height="1528" alt="7cca0be7-a3cf-42c6-8b7f-a2347687b0a6" src="https://github.com/user-attachments/assets/21f65a80-8712-4e7a-a295-219a6cfc2711" />
一键404(emmm，作用嘛)<img width="2560" height="1528" alt="07218d67-0477-4e56-83c5-346e5bb2f33f" src="https://github.com/user-attachments/assets/bda99288-ce3d-47e1-be87-c3aea06f9d2f" />



## ✨ 核心特性

### 🎨 极致的 UI/UX
- **现代美学**：采用 Tailwind CSS 构建的玻璃拟态风格，支持多种主题（清爽、柔和、可爱）。
- **流畅动画**：全局 Framer Motion 级过渡动画，从列表到阅读器的无缝切换。
- **响应式布局**：完美适配桌面端与大屏设备。

### 📖 沉浸式阅读器
- **多种阅读模式**：支持单页、双页（日漫模式）、垂直卷轴模式。
- **智能预加载**：大图懒加载与优先加载策略，确保翻页零卡顿。
- **个性化设置**：自定义背景色、亮度调节、缩放比例、滚轮翻页。
- **键盘支持**：支持键盘快捷键翻页、菜单开关。

### 📦 强大的库管理
- **智能排序**：内置自然排序算法 (Natural Sort)，完美解决 `第10话` 排在 `第2话` 前面的痛点。
- **元数据同步**：支持从文件夹名称自动同步漫画标题。
- **阅读进度**：自动记录每一本漫画的章节与页码进度。
- **AI 赋能**：集成 Google Gemini API，可对漫画封面进行 AI 分析、生成剧情简介、受众分析及评分。

### 📥 内置下载器
- **JMComic 集成**：直接通过 GUI 搜索并下载 JMComic 资源。
- **批量任务**：支持 ID 批量导入下载。
- **多线程加速**：后端 Python 多线程下载，并在前端实时查看下载日志。

### 🛡️ 隐私与安全
- **老板键 (Panic Mode)**：一键伪装应用界面（默认 F12），紧急情况下保护隐私。
- **全离线运行**：数据完全存储在本地，无需担心云端泄露。

## 🛠️ 技术栈

*   **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React
*   **Backend**: Python, FastAPI, Uvicorn
*   **Downloader Core**: `jmcomic`
*   **AI**: Google GenAI SDK (Gemini)

## 🚀 快速开始

### 环境要求
*   Node.js 18+
*   Python 3.9+

### 1. 后端设置

后端负责文件系统操作、下载任务及元数据管理。

```bash
# 进入后端目录 (假设代码在根目录或 server 文件夹)
cd server

# 安装依赖
pip install fastapi uvicorn jmcomic pydantic aiofiles

# 启动服务器 (默认端口 8000)
python server.py
