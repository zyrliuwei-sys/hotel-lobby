# IndexNow 一键安装包（ShipAny TanStack 项目）

装好后，管理后台会多一个 **IndexNow** 页面：粘贴 Bing 给的 key、点保存，网站会自动在根目录提供 `/{key}.txt` 验证文件，然后可以一键把 sitemap 里的所有网址提交给 Bing、Yandex 等搜索引擎。

## 安装

解压后在 `indexnow-installer` 的上一级目录运行：

```bash
node indexnow-installer/install.mjs /path/to/你的项目
cd /path/to/你的项目 && pnpm build
```

- 改动前会把被修改的文件备份到 `<项目>/.indexnow-backup-时间戳/`
- 已经装过会拒绝覆盖；加 `--force` 可以强制覆盖
- 卸载：同一条命令加 `--uninstall`（卸载前同样会先备份）

## 会改动哪些文件

| 文件                                           | 作用                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `src/modules/indexnow/service.ts`（新增）      | 读写 key、检测 key 文件、读取 sitemap、调用 api.indexnow.org |
| `src/routes/{$key}[.]txt.ts`（新增）           | 在 `/{key}.txt` 返回 key（只有已保存的那个 key 才返回 200）  |
| `src/routes/api/admin/indexnow.ts`（新增）     | 后台接口，权限与「设置」页一致：admin.settings.read / write  |
| `src/routes/admin/indexnow.tsx`（新增）        | 后台页面                                                     |
| `src/routes/admin/route.tsx`（修改）           | 在「设置」前加一条导航                                       |
| `messages/en.json`、`messages/zh.json`（修改） | 新增 22 条 `admin.indexnow.*` 文案，不覆盖已有的 key         |

key 保存在数据库的 `config` 表里（`indexnow_key`），不需要改环境变量，也不需要改数据库结构。

## 使用

1. 部署后打开 `/admin/indexnow`
2. 到 https://www.bing.com/indexnow/getstarted 复制 key，粘贴并保存
3. 「密钥文件」显示 ✔ 后，点「提交 sitemap 全部网址」
4. 返回 HTTP 200 或 202 就是成功；403 表示 key 文件访问不到（刚保存的话，等 1 分钟让配置缓存刷新）

## 建议

把 `.indexnow-backup-*` 加进目标项目的 `.gitignore`。

## 更新安装包（维护用）

`sync.mjs` 只在 hotel lobby 项目里使用：改了 IndexNow 相关代码后运行 `node tools/indexnow-installer/sync.mjs`，把最新代码同步进安装包，然后重新打包。
