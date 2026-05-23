# 行为津贴查询测算系统

这个目录是可发布版本，适合部署到 GitHub Pages。朋友在微信里打开公开链接后，会从 `data/behavior-data.json` 读取最新数据。

## 文件

- `index.html`: 页面主体。
- `sync-config.js`: GitHub 同步配置，发布前填写 GitHub 用户名、仓库名、分支和数据文件路径。
- `sync.js`: 管理员端上传后的同步逻辑。
- `data/behavior-data.json`: 朋友端读取的线上数据文件。

## 管理员同步

后台上传 Excel 后，页面会先保存到当前设备。填写 GitHub 写入令牌后，上传结果会提交到 `data/behavior-data.json`，GitHub Pages 刷新后，朋友端就能读取。

令牌只保存在管理员自己的浏览器里，不要发给别人。这个方案适合轻量共享；如果数据包含敏感个人信息，建议改成带登录权限的正式后端。
