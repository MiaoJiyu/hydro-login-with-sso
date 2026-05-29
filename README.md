# login-with-sso

Hydro OJ 的 OpenID Connect (OIDC) 单点登录插件。  
允许用户通过符合 OIDC 标准的身份提供者（如 Keycloak、Auth0、Azure AD、Dex 等）登录 Hydro。

> 使用AIGC进行开发

## 安装

### 本地安装
将插件目录放入 Hydro 的 `addons` 目录，然后执行：
```bash
hydrooj addon add login-with-sso
pm2 restart hydrooj
```

## 配置

在 Hydro 的系统设置中配置以下参数，或在 `hydrooj` 配置文件（YAML/JSON）中添加对应字段。

### 基本参数

| 参数        | 类型    | 必需 | 默认值                     | 说明                                                                 |
|-------------|---------|------|----------------------------|----------------------------------------------------------------------|
| `id`        | string  | 是   | -                          | OIDC 客户端 ID                                                        |
| `secret`    | string  | 是   | -                          | OIDC 客户端密钥（将在数据库中加密存储）                                |
| `issuer`    | string  | 是   | -                          | OIDC 发行者 URL，例如 `https://accounts.example.com`                  |
| `scope`     | string  | 否   | `openid profile email`     | 请求的 OIDC 作用域，使用空格分隔                                      |
| `canRegister` | boolean | 否 | `true`                     | 是否允许尚未注册的用户通过 SSO 自动创建账号                           |

### 高级参数（可选）

| 参数                     | 类型   | 说明                                                                                     |
|--------------------------|--------|------------------------------------------------------------------------------------------|
| `discoveryUrl`           | string | 自定义的 OpenID Connect Discovery URL，若不提供则使用 `issuer/.well-known/openid-configuration` |
| `authorizationEndpoint`  | string | 手动指定授权端点，填写后将跳过自动发现（三个端点需同时提供）                             |
| `tokenEndpoint`          | string | 手动指定令牌端点，填写后将跳过自动发现                                                   |
| `userinfoEndpoint`       | string | 手动指定用户信息端点，填写后将跳过自动发现                                               |

> **说明**：  
> - 若同时提供了 `authorizationEndpoint`、`tokenEndpoint`、`userinfoEndpoint`，插件将**不使用**自动发现，直接使用指定的端点。  
> - 若仅提供部分端点，插件会先进行自动发现，然后用手动提供的值**覆盖**发现结果中对应的端点。  
> - 若你遇到 `issuer/.well-known/openid-configuration` 不可达或格式不符的情况，请使用 `discoveryUrl` 指定一个可用的 Discovery 端点。

## 配置示例

### 最小配置（使用自动发现）
```yaml
login-with-sso:
  id: my-hydro-client
  secret: a-very-secret
  issuer: https://sso.example.com
```

### 手动指定 Discovery 端点
```yaml
login-with-sso:
  id: hydro-app
  secret: my-secret
  issuer: https://keycloak.example.com
  discoveryUrl: https://keycloak.example.com/realms/hydro/.well-known/openid-configuration
```

### 完全手动指定端点（跳过自动发现）
```yaml
login-with-sso:
  id: hydro
  secret: secret-key
  issuer: http://localhost:8080
  authorizationEndpoint: http://localhost:8080/realms/test/protocol/openid-connect/auth
  tokenEndpoint: http://localhost:8080/realms/test/protocol/openid-connect/token
  userinfoEndpoint: http://localhost:8080/realms/test/protocol/openid-connect/userinfo
```

## 使用要求

- **邮箱验证**：插件要求用户在身份提供者处拥有已验证的邮箱（`email` 和 `email_verified` 字段均为真）。若缺少已验证邮箱，登录将被拒绝。请确保你的 SSO 提供者返回该字段。
- **用户名生成**：优先使用 `preferred_username`，其次 `name`，最后回退到 `sub`。你可以在 Hydro 中自行修改用户名。
- **头像**：若提供 `picture` 字段，将作为用户头像使用。
- **路由**：插件注册的回调路由为 `oauth/oidc/callback`，确保你的 OIDC 提供者允许该回调地址（即 `{your-hydro-url}/oauth/oidc/callback`）。

## 常见问题

### 1. 登录时提示 "Not Found" (404)
请确认：
- 插件已正确安装并启用；
- Hydro 版本 ≥ 5.0.0（OIDC 模块在 5.0.0 引入）；
- 重启了 Hydro 服务。

### 2. 自动发现失败
检查 `issuer` 是否可公开访问，或使用 `discoveryUrl` 手动指定一个可用的 Discovery 文档 URL。也可以使用手动端点完全跳过发现过程。

### 3. 邮箱验证失败
确保你的 OIDC 提供者返回了 `email_verified: true`。如果无法满足，可考虑修改插件代码移除邮箱强制检查（不推荐，可能导致账号重复问题）。

## 许可

与 Hydro 主项目一致：AGPL-3.0-or-later。  
请遵守相应开源协议。
