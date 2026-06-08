# CSDN Export

基于 Puppeteer 的 CSDN 博客文章批量导出工具，将文章保存为带 front-matter 的 Markdown 文件，支持图片本地化下载，可直接迁移至 Hexo 等静态博客平台。

## 功能特性

- **批量导出文章** — 自动遍历文章列表分页，逐篇抓取 Markdown 原文
- **扫码登录** — 通过 CSDN App 扫码登录，使用 `browser_data` 目录持久化登录状态，避免重复登录
- **Front-matter 生成** — 自动注入 `title`、`date`、`tags` 等元信息，兼容 Hexo / Hugo / VuePress
- **图片本地化** — PowerShell 脚本批量下载文章中的远程图片，并替换为本地相对路径

![](/assets/CSDN/1780889307677-75e92ff7-6c0b-489b-b9ae-92bc6ff374aa.png)
![](/assets/CSDN/Snipaste_2026-06-08_16-36-06.png)

## 项目结构

```
csdnExport/
├── export.js                # 核心导出脚本（Puppeteer）
├── app.js                   # Express Web 服务
├── bin/www                  # 服务启动入口
├── DownloadCsdnImages.ps1   # 图片下载 & 路径替换脚本
├── articles/                # 导出的 Markdown 文件（173 篇）
├── assets/                  # 本地化图片资源
├── browser_data/            # Puppeteer 浏览器持久化数据（登录态）
├── routes/                  # Express 路由
├── views/                   # Pug 模板
└── public/                  # 静态资源
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 导出文章

```bash
node export.js
```

运行后会打开 Chrome 浏览器窗口，按提示使用 CSDN App 扫码登录。登录成功后自动抓取所有文章并保存到 `articles/` 目录。

> 首次运行需扫码登录，后续运行会复用 `browser_data/` 中的登录态。

### 3. 下载图片（可选）

在 PowerShell 中执行：

```powershell
.\DownloadCsdnImages.ps1
```

该脚本会：
1. 扫描 `articles/` 下所有 `.md` 文件
2. 下载文中的远程图片到 `assets/{文章名}/` 目录
3. 将 Markdown 中的图片 URL 替换为本地相对路径 `/assets/{文章名}/{文件名}`


## 配置说明

在 `export.js` 中修改以下常量：

| 常量 | 说明 | 默认值 |
|------|------|--------|
| `CSDN_USERNAME` | CSDN 用户名 | `qq_31745863` |
| `OUTPUT_DIR` | 文章输出目录 | `./articles` |

## 技术栈

- **Node.js** — 运行时
- **Puppeteer** — 无头浏览器自动化，模拟登录 & 抓取
- **Express + Pug** — Web 预览服务
- **PowerShell** — 图片批量下载脚本

## 注意事项

- 导出过程会打开可见的 Chrome 窗口（`headless: false`），用于扫码登录
- 抓取间隔 1-2 秒，避免触发 CSDN 反爬策略
- `browser_data/` 目录包含浏览器会话数据，请勿随意删除（删除后需重新扫码）
- 图片下载脚本仅支持 Windows PowerShell 环境
