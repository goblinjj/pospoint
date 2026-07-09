# 小众点评 · 私家觅食地图

和朋友们一起记录、打分、分享好吃好玩的地方 —— 私人版大众点评。

- **首页**：按「离我多远」由近及远排列圈子里分享的店铺（浏览器定位 WGS-84 自动转高德 GCJ-02 坐标系再算距离）
- **店铺详情**：大家的评分（1–5 星）、短评和照片；一键唤起高德 App 标点或导航
- **分享好店**：在高德地图 App 里「分享 → 复制链接」，粘贴进来自动解析出店名、地址、坐标
- **私密圈子**：邀请码注册，第一位注册的用户自动成为管理员

技术栈：Cloudflare Workers（Hono）+ D1（数据库）+ R2（照片）+ Vite/React。数据表在首次请求时自动创建，无需手动迁移。

## 本地开发

```bash
npm install
npm run dev        # 打开 http://localhost:5173（本地模拟 D1/R2，数据存在 .wrangler/ 下）
```

## 部署到 Cloudflare

1. 登录并创建资源（只需一次）：

   ```bash
   npx wrangler login
   npx wrangler d1 create pospoint          # 把输出的 database_id 填进 wrangler.jsonc
   npx wrangler r2 bucket create pospoint-photos
   ```

2. 部署：

   ```bash
   npm run deploy
   ```

   部署后会得到 `https://pospoint.<你的子域>.workers.dev`。第一时间打开注册，抢到管理员。

3. （可选）走 GitHub 自动部署：把仓库推到 GitHub，在 Cloudflare 控制台 → Workers & Pages → 创建 → 连接 GitHub 仓库，构建命令 `npm run build`，部署命令 `npx wrangler deploy`。之后每次 push 自动上线。

> `workers.dev` 域名在国内偶尔不稳，如果朋友们反馈打不开，在 Cloudflare 里给 Worker 绑一个自己的域名即可。

## 日常使用流程

**分享一家店**：高德地图找到店铺 → 分享 → 复制链接 → 打开小众点评 → ＋ → 粘贴 → 解析 → 保存。

**去朋友推荐的店**：首页点开店铺 → 「在高德地图打开」或「导航去这里」→ 自动唤起高德 App。

**邀请朋友**：我的 → 生成新邀请码 → 复制发给朋友。
