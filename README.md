# AI 电商视频商品替换工具 MVP

基于 Next.js App Router、TypeScript、Tailwind CSS、shadcn/ui 风格组件、Prisma、PostgreSQL、Redis/BullMQ 预留接口实现的 AI 商品替换工作台。

默认使用本地 mock，设置 `AI_PROVIDER=kling` 可通过云雾中转调用可灵 3.0 Omni；设置 `AI_PROVIDER=fal` 可调用 fal.ai 的真实视频 inpainting 服务：

- 上传文件保存到 `public/uploads`
- 如果配置 `BLOB_READ_WRITE_TOKEN`，上传文件会保存到 Vercel Blob，并返回公网 URL
- Job/Asset 数据保存到 `.data/mock-db.json`
- mock 模式下任务进度按时间推进到 100%，输出视频复用原始上传视频
- kling 模式下会调用云雾可灵 Omni Video，使用 `video_list.refer_type=base` 做视频编辑，并把框选坐标写入 prompt
- fal 模式下会上传源视频、商品图、框选 mask 到 fal storage，并提交 `fal-ai/wan-vace-14b/inpainting`
- BullMQ、PostgreSQL、对象存储接口仍保留替换点

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 数据库

`prisma/schema.prisma` 已定义 `User`、`Asset`、`Job`、`JobProductImage`、`JobStep`。接入真实 PostgreSQL 后：

```bash
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
```

### Neon/Postgres 元数据存储

把 Neon 连接串配置到 `.env.local` 或 Vercel Project Settings 的 `DATABASE_URL`。只要存在 `DATABASE_URL`，Job/Asset 元数据会优先通过 Prisma 写入 Postgres；否则回退到 Vercel Blob JSON 或 `.data/mock-db.json`。

本地执行 Prisma CLI 时，Prisma 默认读取 `.env` 或当前 shell 环境；如果连接串只放在 `.env.local`，请先把同一行 `DATABASE_URL` 同步到 `.env`，或临时设置 shell 环境变量。

新 Neon 数据库首次建表可以执行：

```bash
npm run prisma:migrate:deploy
```

## 登录与用户数据

应用使用邮箱密码登录。注册、登录会话、上传素材、创建任务和历史记录都保存在 `DATABASE_URL` 指向的 Postgres 数据库中，登录态通过 httpOnly cookie 保存。登录后，用户只能查看、删除和重试自己的任务。

登录和注册页面接入 Cloudflare Turnstile 人机验证。把 Turnstile site key 和 secret key 配置到 `.env.local` 或 Vercel Project Settings：

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your-turnstile-site-key"
TURNSTILE_SECRET_KEY="your-turnstile-secret-key"
```

首次连接新的 Neon 数据库后执行：

```bash
npm run prisma:migrate:deploy
```

## 接入云雾可灵

创建 `.env.local`：

```bash
AI_PROVIDER="kling"
KLING_API_KEY="your-yunwu-key"
BLOB_READ_WRITE_TOKEN="your-vercel-blob-read-write-token"
KLING_BASE_URL="https://yunwu.ai"
KLING_CREATE_PATH="/kling/v1/videos/omni-video"
KLING_QUERY_PATH="/kling/v1/videos/omni-video/{task_id}"
KLING_MODEL_NAME="kling-v3-omni"
KLING_MODE="pro"
KLING_USE_DATA_URI="false"
```

然后重启开发服务：

```bash
npm run dev
```

说明：

- 云雾/可灵 Omni Video 通常要求素材是公网 URL。
- 云雾可灵的 `video_url/image_url` 通常需要公网可访问 URL。
- 配置 `BLOB_READ_WRITE_TOKEN` 后，上传素材会自动走 Vercel Blob，云雾可以访问。
- 本地 `public/uploads` 只有你的电脑能访问，云雾服务器访问不到。
- 如果不用 Vercel Blob，请接入其他对象存储/CDN，设置 `MEDIA_PUBLIC_BASE_URL`，保持 `KLING_USE_DATA_URI=false`。
- 只有在你确认云雾后台接受 video data URI 时，才设置 `KLING_USE_DATA_URI=true`。
- 当前可灵 Omni 公开参数没有标准 mask 字段，所以框选区域会写入 prompt；如果云雾提供 mask/selection 字段，可在 `lib/server/kling-provider.ts` 里追加。

## 接入 fal.ai

创建 `.env.local`：

```bash
AI_PROVIDER="fal"
FAL_KEY="your-fal-key"
FAL_MODEL_ID="fal-ai/wan-vace-14b/inpainting"
```

然后重启开发服务：

```bash
npm run dev
```

真实生成流程：

1. 服务端读取本地上传的视频和商品图。
2. 根据用户框选区域生成黑白 mask PNG。
3. 上传源视频、mask、商品参考图到 fal storage。
4. 提交 fal queue 任务。
5. 用户打开详情页时轮询 fal 状态。
6. fal 完成后保存真实输出视频 URL 并展示下载。

## 核心限制

- 只支持 5 秒以内 MP4
- 只支持一个物品替换
- 必须人工框选旧商品
- 商品图数量为 1 到 5 张
- 不支持 NSFW、换脸、去水印、仿冒品牌 Logo、违法违禁商品、长视频批量搬运、多物品同时替换
- 不承诺 100% 生成成功
