# Gemini Council - 项目备忘录

本文档记录项目的关键技术决策和实现细节，供后续开发参考。

---

## 1. 图片上传与转发机制

### 问题背景
当用户选择非官方模型（外部模型）时，需要拦截用户上传的图片，并通过 OpenRouter API 转发出去。由于 OpenRouter 不支持直接的多部分文件上传，需要使用 Cloudflare R2 作为临时图片托管。

### 解决方案

#### 1.1 R2 客户端初始化
**文件**: `src/core/services/R2Client.ts`

```typescript
import { S3Client } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY,
        secretAccessKey: R2_SECRET_KEY,
    },
    signatureVersion: "v4",
});
```

#### 1.2 图片上传与预签名 URL
**文件**: `src/core/services/R2Uploader.ts`

核心函数：
- `uploadImage()` - 接受 base64/ArrayBuffer/Blob 数据，上传到 R2
- `uploadBase64Image()` - 便捷函数，直接上传 base64 数据
- `detectMimeType()` - 根据文件扩展名检测 MIME 类型
- `generateUniqueKey()` - 生成唯一对象键（时间戳+UUID）

返回结果：
```typescript
interface UploadResult {
    objectKey: string;      // R2 中的对象键
    presignedUrl: string;   // 预签名下载 URL（3600秒过期）
    publicUrl: string;     // 公网访问 URL
}
```

#### 1.3 OpenRouter Vision 模型集成
**文件**: `src/core/services/OpenRouterService.ts`

新增 `generateWithVision()` 方法：
```typescript
async generateWithVision(
    imageUrl: string,
    prompt: string,
    model: string = "google/gemini-pro-vision"
): Promise<string>
```

消息格式遵循 OpenAI Vision 规范：
```json
{
    "model": "google/gemini-pro-vision",
    "messages": [{
        "role": "user",
        "content": [
            { "type": "text", "text": "prompt" },
            { "type": "image_url", "image_url": { "url": "imageUrl" } }
        ]
    }]
}
```

### 环境变量配置
在 `.env` 文件中配置：
```
R2_ACCESS_KEY=your_access_key
R2_SECRET_KEY=your_secret_key
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
BUCKET_NAME=gemini-council-images
```

**重要**: 需要在 `build.ts` 中添加环境变量注入：
```typescript
define: {
    "process.env.R2_ACCESS_KEY": JSON.stringify(Bun.env.R2_ACCESS_KEY || ""),
    "process.env.R2_SECRET_KEY": JSON.stringify(Bun.env.R2_SECRET_KEY || ""),
    "process.env.R2_ENDPOINT": JSON.stringify(Bun.env.R2_ENDPOINT || ""),
    "process.env.BUCKET_NAME": JSON.stringify(Bun.env.BUCKET_NAME || ""),
}
```

---

## 2. 模型列表管理

### 获取可用模型
OpenRouter API 端点: `GET https://openrouter.ai/api/v1/models`

**注意**: OpenRouter 模型 ID 命名规则与官方不同，必须通过 API 获取准确的模型 ID。

示例代码：
```typescript
const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${API_KEY}` }
});
const data = await res.json();
const gptModels = data.data
  .filter(m => m.id.startsWith("openai/") && m.id.toLowerCase().includes("gpt"))
  .map(m => m.id);
```

### 当前可用 GPT 模型（截至 2026-03）
```
openai/gpt-5.4-pro
openai/gpt-5.4
openai/gpt-5.3-codex
openai/gpt-5.3-chat
openai/gpt-5.2-codex
openai/gpt-5.2-chat
openai/gpt-5.2-pro
openai/gpt-5.2
openai/gpt-5-pro
openai/gpt-5
openai/gpt-5-mini
openai/gpt-5-nano
openai/gpt-5-image
openai/gpt-5-image-mini
openai/gpt-4o
openai/gpt-4o-mini
```

### 模型选择器配置
**文件**: `src/features/council/ui/ModelSelector.ts`

当前配置：
```typescript
const EXTERNAL_MODEL_GROUPS: ModelGroup[] = [
    {
        name: "OpenAI",
        icon: "🤖",
        models: [
            { id: "openai/gpt-5.4-pro", name: "GPT-5.4 Pro", description: "Most advanced" },
            { id: "openai/gpt-5.4", name: "GPT-5.4", description: "Flagship" },
            { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex", description: "Coding focused" },
            { id: "openai/gpt-5-pro", name: "GPT-5 Pro", description: "Advanced" },
            { id: "openai/gpt-5", name: "GPT-5", description: "Standard" },
            { id: "openai/gpt-5-mini", name: "GPT-5 Mini", description: "Fast & efficient" },
        ]
    },
    // ... 其他模型组
];
```

---

## 3. 文件拦截机制（待集成）

### FileInterceptor
**文件**: `src/features/council/parsers/FileInterceptor.ts`

已实现的图片拦截功能：
- 拦截 `FileReader` 的 `readAsDataURL`、`readAsText` 方法
- 监听 DOM 变化，捕获图片预览
- 支持 `data:` 和 `blob:` URL 格式

**注意**: 目前 FileInterceptor 尚未与主流程集成，需要在选择外部模型时触发图片拦截和转发。

---

## 4. 构建与发布

### 构建命令
```bash
bun run build        # Chrome 版本
bun run build:firefox # Firefox 版本
```

### 测试
```bash
bun run test        # 运行单元测试
bun run test:watch  # 监听模式
```

### 环境变量注入
构建时通过 `build.ts` 中的 `define` 选项将环境变量注入到代码中。确保 `.env` 文件包含所有必要的配置。

---

## 5. 技术栈

- **运行时**: Bun
- **测试**: Vitest + jsdom
- **存储**: IndexedDB (Dexie.js)
- **云存储**: Google Drive API (appDataFolder)
- **图片存储**: Cloudflare R2 (S3 兼容)
- **API 网关**: OpenRouter
- **类型检查**: TypeScript + Zod

---

## 6. 目录结构

```
src/
├── core/
│   ├── services/
│   │   ├── R2Client.ts        # R2 客户端初始化
│   │   ├── R2Uploader.ts     # 图片上传模块
│   │   ├── OpenRouterService.ts  # OpenRouter API（含 Vision）
│   │   ├── StorageService.ts # IndexedDB 封装
│   │   ├── SyncManager.ts   # 同步协调
│   │   └── GistClient.ts    # GitHub Gist 同步
│   └── types/
│       └── storage.types.ts  # Zod 存储类型
├── features/
│   └── council/
│       ├── parsers/
│       │   └── FileInterceptor.ts  # 文件拦截
│       ├── ui/
│       │   └── ModelSelector.ts   # 模型选择器
│       └── storage/
├── content.ts    # Content Script 入口
└── background.ts # Background Script 入口
```

---

*最后更新: 2026-03-06*
