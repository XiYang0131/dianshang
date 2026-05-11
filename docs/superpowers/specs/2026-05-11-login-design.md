# 邮箱密码登录设计

## 背景

当前项目已经使用 Next.js App Router、Prisma 和 Postgres 存储任务元数据。Prisma schema 已有 `User`、`Asset`、`Job` 等模型，但业务流程仍以匿名用户或 `mock-user` 为主。新增登录功能后，用户需要先注册或登录，上传素材、创建任务、查看历史和操作任务时都应绑定到当前用户。

## 目标

- 支持邮箱 + 密码注册。
- 支持邮箱 + 密码登录。
- 使用 httpOnly cookie 保存登录态。
- 将上传的 `Asset` 和创建的 `Job` 绑定到当前用户。
- 用户只能查看、删除、重试自己的任务。
- 数据连接使用 `DATABASE_URL` 环境变量，运行时指向 Neon Postgres。

## 非目标

- 不接入第三方 OAuth。
- 不做邮箱验证、找回密码、角色权限或管理后台。
- 不把数据库连接串硬编码进代码或示例文件。

## 推荐方案

采用自建邮箱密码认证。Prisma 新增认证所需字段和会话表：

- `User.passwordHash String?`：保存 scrypt 后的密码哈希。
- `Session`：保存服务端会话，包含 `id`、`userId`、`tokenHash`、`expiresAt`、`createdAt`、`updatedAt`。

密码使用 Node `crypto.scrypt` 加盐哈希。登录成功后生成随机 session token，数据库只保存 token hash，浏览器 cookie 保存原始 token。cookie 设置为 httpOnly、sameSite=lax，并在生产环境启用 secure。

## 页面与交互

- 新增 `/register` 页面：邮箱、密码、确认密码，注册成功后自动登录并跳转 `/create`。
- 新增 `/login` 页面：邮箱、密码，登录成功后跳转 `/create`。
- 导航栏未登录时显示登录、注册入口；登录后显示邮箱和退出按钮。
- `/create`、`/history`、`/jobs/[id]` 需要登录。未登录访问时跳转 `/login`。

UI 沿用当前 shadcn 风格组件、紧凑卡片、图标按钮和现有导航样式，不引入新的视觉体系。

## API 与数据流

- 新增 `lib/server/auth.ts`，集中处理密码哈希、session token、cookie 读写、当前用户查询和登录校验。
- 新增 API：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- 上传接口 `POST /api/upload` 要求登录，并保存 `asset.userId`。
- 任务接口 `GET /api/jobs`、`POST /api/jobs` 要求登录，列表只返回当前用户任务，创建时写入 `job.userId`。
- 单任务接口 `GET/DELETE /api/jobs/[id]`、`POST /api/jobs/[id]/retry`、`POST /api/jobs/[id]/sync` 要求登录，并校验任务归属。
- 本地 mock/json 和 Vercel Blob 回退路径继续可用；当没有 `DATABASE_URL` 时仍能跑通基础开发，但正式登录数据以 Postgres 为准。

## 错误处理

- 注册邮箱已存在返回 409。
- 登录邮箱或密码错误返回统一 401，避免泄露账号存在性。
- 未登录返回 401，页面端跳转到 `/login`。
- 已登录用户访问 `/login` 或 `/register` 可直接跳转 `/create`。
- session 过期或数据库中不存在时清理 cookie 并要求重新登录。

## 测试与验证

- 新增 auth 服务层测试，覆盖密码校验、session 创建、token hash 查询、过期 session 失效。
- 新增 API 级测试或轻量 route handler 测试，覆盖注册、登录、当前用户、退出。
- 手动验证完整路径：注册 -> 创建任务 -> 历史只显示当前用户任务 -> 退出 -> 无法访问受保护页面。
- 最终运行 `npm run typecheck` 和 `npm run build`。

## 环境变量

- `.env.local` 设置真实 `DATABASE_URL`，指向用户提供的 Neon Postgres。
- `.env.example` 继续使用占位符，并补充认证相关说明。
- 不在 README、源码或提交记录中写入真实数据库密码。
