# 部署指南

本项目采用混合部署架构：
- **前端 + 轻量级 API**：部署到 Vercel
- **训练服务**：部署到 Railway

## 一、Vercel 部署（前端 + API）

### 1. 准备工作

1. 注册 [Vercel](https://vercel.com) 账号
2. 安装 Vercel CLI（可选）：
   ```bash
   npm i -g vercel
   ```

### 2. 部署步骤

#### 方式一：通过 Git 仓库

1. 将代码推送到 GitHub/GitLab/Bitbucket
2. 在 Vercel Dashboard 中导入项目
3. Vercel 会自动检测 Vite 项目并配置构建

#### 方式二：通过 CLI

```bash
cd /path/to/project
vercel
```

### 3. 配置环境变量

在 Vercel Dashboard → Project → Settings → Environment Variables 中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `VITE_TRAINING_API` | `https://your-railway-app.railway.app` | Railway 训练服务地址 |
| `LLM_BASE_URL` | `https://liai-app.chj.cloud/v1` | LLM API 地址 |
| `LLM_API_KEY` | `app-xxx` | LLM API 密钥 |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_xxx` | Vercel Blob 令牌（可选） |

### 4. 配置 Vercel Blob（可选）

如需使用数据集管理功能：

1. 在 Vercel Dashboard → Storage → Create → Blob
2. 复制生成的 `BLOB_READ_WRITE_TOKEN`
3. 添加到环境变量

### 5. 上传模型文件（可选）

如需在 Vercel 上运行 YOLO/音频推理：

1. 在 Vercel Dashboard → Storage → Blob
2. 上传模型文件（.pt/.pkl）
3. 复制文件 URL，添加到环境变量：
   - `YOLO_MODEL_URL_PAINT`
   - `AUDIO_MODEL_URL`

> ⚠️ 注意：YOLO 推理需要 Vercel Pro 版本以支持更长执行时间和更大部署包

---

## 二、Railway 部署（训练服务）

### 1. 准备工作

1. 注册 [Railway](https://railway.app) 账号
2. 安装 Railway CLI（可选）：
   ```bash
   npm i -g @railway/cli
   ```

### 2. 部署步骤

#### 方式一：通过 Dashboard

1. 在 Railway Dashboard 中点击 "New Project"
2. 选择 "Deploy from GitHub repo" 或 "Empty Project"
3. 如果是空项目，使用 CLI 部署：
   ```bash
   railway login
   railway init
   railway up
   ```

#### 方式二：通过 CLI

```bash
cd /path/to/project
railway login
railway init
railway up
```

### 3. 配置

Railway 会自动识别 `railway.json` 配置文件并执行：
- 安装 `training/requirements.txt` 依赖
- 启动 `training/train_server.py`

### 4. 配置持久化存储

训练服务需要持久化存储来保存模型和数据集：

1. 在 Railway Dashboard → Project → Service → Settings
2. 添加 Volume：
   - Mount Path: `/app/training/runs`（训练结果）
   - Mount Path: `/app/training/datasets`（数据集）

### 5. 获取服务 URL

部署完成后，在 Railway Dashboard 中获取服务 URL：
- 格式：`https://your-app.railway.app`
- 将此 URL 配置到 Vercel 的 `VITE_TRAINING_API` 环境变量

---

## 三、部署验证

### 1. 验证 Vercel

访问 Vercel 部署的 URL，检查：
- [ ] 前端页面正常加载
- [ ] 导航和路由正常工作

### 2. 验证 Railway

访问 Railway 服务 URL：
```bash
curl https://your-railway-app.railway.app/train/status
```

应返回训练状态 JSON。

### 3. 验证服务连通性

在前端尝试：
- [ ] 启动训练任务
- [ ] 查看训练状态
- [ ] 使用 LLM 分析功能

---

## 四、故障排除

### Vercel 相关

1. **构建失败**
   - 检查 `package.json` 中的依赖版本
   - 查看 Vercel 构建日志

2. **API 调用 404**
   - 检查 `vercel.json` 的 rewrites 配置
   - 确认 `api/` 目录下的函数文件存在

3. **YOLO/音频服务不可用**
   - 需要 Vercel Pro 版本
   - 检查模型文件是否已上传到 Blob

### Railway 相关

1. **部署失败**
   - 检查 `training/requirements.txt` 依赖
   - 查看 Railway 部署日志

2. **训练失败**
   - 检查 Volume 是否正确挂载
   - 查看训练服务日志

3. **跨域错误**
   - 训练服务已配置 `CORS(app)`，允许所有来源
   - 如需限制，修改 `training/train_server.py`

---

## 五、费用说明

### Vercel

- **Hobby（免费）**：适合测试，Serverless 执行时间限制 10s
- **Pro（$20/月）**：推荐，执行时间 60s，支持 YOLO 推理

### Railway

- **Hobby（免费）**：500 小时/月，适合轻度使用
- **Pro（$5/月起）**：按使用量计费，适合频繁训练

---

## 六、架构图

```
┌─────────────────────────────────────────────────────┐
│                     用户浏览器                        │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────────┐       ┌───────────────────┐
│      Vercel       │       │     Railway       │
├───────────────────┤       ├───────────────────┤
│  前端静态资源      │       │   训练服务         │
│  /api/llm/*       │       │   - 模型训练       │
│  /api/datasets/*  │       │   - 训练队列       │
│  /api/detect/*    │       │   - 模型管理       │
│  /api/audio/*     │       │                   │
├───────────────────┤       ├───────────────────┤
│  Vercel Blob      │       │  Volume (持久化)  │
│  (模型/数据集)     │       │  (训练结果/数据)   │
└───────────────────┘       └───────────────────┘
```
