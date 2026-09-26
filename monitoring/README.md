# 商城可用性监测

独立的 Node.js 22 脚本，不依赖商城 npm 包。Kubernetes CronJob 每 5 分钟运行一次。

- 网站：请求配置的 URL，2xx 为成功；重定向判定失败，请配置最终地址，避免登录跳转被当成正常页面。
- Supabase：携带 API key 请求 `/rest/v1/Product?select=id&limit=0`，要求 2xx 和 JSON 数组，不读取商品记录。检查 REST/数据库路由，不证明 Prisma 连接、图片存储或完整业务流程正常。
- 每个请求默认超时 10 秒，并行运行。日志为 JSON 行，包含服务名、状态码、耗时、错误分类和汇总；不输出密钥、响应正文或完整 URL。
- 退出码：0 全部成功，1 至少一个服务失败，2 配置错误。HTTP 401/403 也会失败，应检查密钥和权限，不能直接推断停机。
- CronJob 不重叠执行、不立即重试；保留最近 3 个成功 Job 和 5 个失败 Job。无历史数据库、通知或自动修复。电脑休眠/集群停止时不会监测。

## 本地运行

在仓库根目录执行（Node.js 22）：

```sh
node --env-file=.env monitoring/check.mjs
node --test monitoring/check.test.mjs
```

脚本使用 `MONITOR_WEBSITE_URL`，未设置时读取已有的 `NEXT_PUBLIC_WEBSITE_URL`；还需要 `SUPABASE_URL` 和 `SUPABASE_KEY`。可选 `MONITOR_TIMEOUT_MS` 范围 1–30000。使用能读取 Product 路由的最小权限 key，不需要数据库密码或 Stripe/Clerk 私钥。

## 部署到本地 Kubernetes

先启动 Docker Desktop 并启用 Kubernetes，或准备已有本地集群。以下命令应在仓库根目录运行。先确认目标，避免误部署到其他集群：

```sh
kubectl config current-context
kubectl get nodes
```

构建镜像（构建上下文仅含监测目录，白名单排除配置、密钥和测试文件）：

```sh
docker build -t store-monitor:local monitoring
```

确保镜像存在于集群使用的镜像存储中。Docker Desktop 取决于集群/镜像存储设置；若出现 ImagePullBackOff，检查镜像是否对集群可见。kind 可使用 `kind load docker-image store-monitor:local --name <集群名>`；minikube 可使用 `minikube image load store-monitor:local`。云端集群需要推送到自己的镜像仓库，并修改 CronJob 的 image。

检查 `monitoring/k8s/configmap.yaml` 中的目标地址，然后部署。Secret 由本地 `.env` 生成并直接传给 kubectl，不写入仓库；不要单独运行 secret.mjs 或把其输出记录到日志。

```sh
kubectl create namespace store-monitor --dry-run=client -o yaml | kubectl apply -f -
node --env-file=.env monitoring/secret.mjs | kubectl apply -f -
kubectl apply -f monitoring/k8s/configmap.yaml
kubectl apply -f monitoring/k8s/cronjob.yaml
```

第一次手动触发（后续测试请换一个 Job 名称）：

```sh
kubectl -n store-monitor create job store-monitor-manual-1 --from=cronjob/store-monitor
kubectl -n store-monitor logs -f job/store-monitor-manual-1
kubectl -n store-monitor get jobs
```

如果 Pod 尚未启动，稍后再次执行 logs；使用 `kubectl -n store-monitor describe pods` 查看镜像、Secret 或调度错误。服务异常时 Job 显示 Failed 是预期结果，详情在日志里。

修改脚本后重新构建/载入镜像；推荐用新的镜像标签并更新 CronJob，避免节点复用旧镜像。修改配置后重新 apply，下一次任务生效。

暂停检查：

```sh
kubectl -n store-monitor patch cronjob store-monitor -p '{"spec":{"suspend":true}}'
```

恢复时把 true 改为 false。移除本功能所有集群资源（包括监测日志）：

```sh
kubectl delete namespace store-monitor
```

参考：[Kubernetes CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)、[Supabase REST API](https://supabase.com/docs/guides/api/creating-routes)。

## Supabase 暂停自动恢复

新增独立 `supabase-resume` CronJob，每 5 分钟通过 Management API 查询固定项目 `brtdiatgxjrwjkzejhbq`：

- `ACTIVE_HEALTHY`：无需操作。
- `INACTIVE`（暂停）：启用自动恢复时调用 `POST /v1/projects/{ref}/restore`。
- 恢复中、启动中、未知状态或 API 错误：记录日志，不调用恢复。
- 接口接受恢复请求不代表恢复完成；后续周期检查状态。恢复请求超时不立即重发，下一周期先查询状态。如果仍是 INACTIVE，下一周期会再次尝试。
- 单个任务最多调用一次恢复，不会暂停、重启或重建项目。手动暂停也会被自动恢复；计划维护前请暂停该 CronJob。
- 项目已删除、恢复期限已过、权限不足等需要人工处理。电脑必须保持运行。

需要独立管理令牌，项目的 anon/service_role key 不能替代。到 https://supabase.com/dashboard/account/tokens 创建 Access Token，保存到本地 `.env` 的 `SUPABASE_ACCESS_TOKEN`，不要提交或粘贴到聊天。若使用细粒度令牌，限定本项目并授予 `project_admin_read` 和 `project_admin_write`。

先只读验证（默认不恢复）：

```sh
SUPABASE_PROJECT_REF=brtdiatgxjrwjkzejhbq SUPABASE_AUTO_RESUME=false node --env-file=.env monitoring/resume.mjs
```

令牌准备好后，在项目根目录部署到本地集群（原监测任务继续运行）：

```sh
set -o pipefail
docker build -t store-monitor:resume-v1 monitoring
node --env-file=.env monitoring/resume-secret.mjs | kubectl --context docker-desktop apply -f -
kubectl --context docker-desktop apply -f monitoring/k8s/resume-cronjob.yaml
kubectl --context docker-desktop -n store-monitor create job supabase-resume-manual-1 --from=cronjob/supabase-resume
kubectl --context docker-desktop -n store-monitor logs -f job/supabase-resume-manual-1
```

暂停自动恢复（不影响原网站监测）：

```sh
kubectl --context docker-desktop -n store-monitor patch cronjob supabase-resume -p '{"spec":{"suspend":true}}'
```

单元测试使用模拟响应，不暂停真实项目：`node --test monitoring/resume.test.mjs`。

API 参考：[获取项目状态](https://supabase.com/docs/reference/api/v1-get-project)、[恢复项目](https://supabase.com/docs/reference/api/v1-restore-a-project)。
