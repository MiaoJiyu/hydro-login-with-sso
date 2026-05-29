import {
    Context, ForbiddenError, Handler, Schema, Service, superagent, SystemModel,
    TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

const icon = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M7 10V7a5 5 0 1 1 10 0v3h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8c0-1.1.9-2 2-2h2zm2 0h6V7a3 3 0 1 0-6 0v3zm-2 4v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>';

export default class LoginWithSsoService extends Service {
    static inject = ['oauth'];
    static Config = Schema.object({
        id: Schema.string().description('OIDC Client ID').required(),
        secret: Schema.string().description('OIDC Client Secret').role('secret').required(),
        issuer: Schema.string().description('OIDC Issuer URL (e.g., https://accounts.example.com)').required(),
        scope: Schema.string().description('OIDC Scopes').default('openid profile email'),
        canRegister: Schema.boolean().default(true),
        // 新增：手动指定自动发现地址（优先级高于默认 issuer/.well-known）
        discoveryUrl: Schema.string().description('Custom discovery URL (overrides issuer/.well-known/openid-configuration)'),
        // 新增：手动覆盖端点，填写后将跳过自动发现
        authorizationEndpoint: Schema.string().description('Manual authorization endpoint (overrides discovery)'),
        tokenEndpoint: Schema.string().description('Manual token endpoint (overrides discovery)'),
        userinfoEndpoint: Schema.string().description('Manual userinfo endpoint (overrides discovery)'),
    });

    constructor(ctx: Context, config: ReturnType<typeof LoginWithSsoService.Config>) {
        super(ctx, 'oauth.oidc');

        // 获取端点：优先手动覆盖 -> 自定义发现地址 -> 默认 issuer 发现
        const endpointsPromise = (async () => {
            // 如果三个端点全部手动指定，则直接使用
            if (config.authorizationEndpoint && config.tokenEndpoint && config.userinfoEndpoint) {
                return {
                    authorization_endpoint: config.authorizationEndpoint,
                    token_endpoint: config.tokenEndpoint,
                    userinfo_endpoint: config.userinfoEndpoint,
                };
            }
            // 否则执行自动发现
            const discoveryUrl = config.discoveryUrl
                || `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
            const { body } = await superagent.get(discoveryUrl);
            if (!body.authorization_endpoint || !body.token_endpoint || !body.userinfo_endpoint) {
                throw new Error('Invalid OIDC discovery document: missing required endpoints');
            }
            // 手动指定的端点可以部分覆盖发现结果
            return {
                authorization_endpoint: config.authorizationEndpoint || body.authorization_endpoint,
                token_endpoint: config.tokenEndpoint || body.token_endpoint,
                userinfo_endpoint: config.userinfoEndpoint || body.userinfo_endpoint,
            };
        })();

        ctx.oauth.provide('oidc', {
            text: 'Login with SSO',
            name: 'SSO',
            icon,
            canRegister: config.canRegister,
            callback: async function callback({ state, code }) {
                const s = await TokenModel.get(state, TokenModel.TYPE_OAUTH);
                if (!s) throw new ValidationError('token');
                const url = SystemModel.get('server.url');
                const redirectUri = `${url}oauth/oidc/callback`;
                const { token_endpoint, userinfo_endpoint } = await endpointsPromise;

                const res = await superagent.post(token_endpoint)
                    .type('form')
                    .send({
                        client_id: config.id,
                        client_secret: config.secret,
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                        state,
                    });
                if (res.body.error) {
                    throw new UserFacingError(
                        res.body.error,
                        res.body.error_description,
                        res.body.error_uri,
                    );
                }
                const accessToken = res.body.access_token;

                const userInfo = await superagent.get(userinfo_endpoint)
                    .set('User-Agent', 'Hydro-OIDC')
                    .set('Authorization', `Bearer ${accessToken}`);

                const profile = userInfo.body;
                const ret = {
                    _id: profile.sub,
                    email: '',
                    bio: '',
                    uname: [
                        profile.preferred_username,
                        profile.name,
                        profile.sub,
                    ].filter(Boolean),
                    avatar: profile.picture || '',
                };

                if (profile.email && profile.email_verified) {
                    ret.email = profile.email;
                }

                await TokenModel.del(s._id, TokenModel.TYPE_OAUTH);
                if (!ret.email) throw new ForbiddenError("You don't have a verified email.");
                return ret;
            },
            get: async function get(this: Handler) {
                const { authorization_endpoint } = await endpointsPromise;
                const url = SystemModel.get('server.url');
                const redirectUri = `${url}oauth/oidc/callback`;
                const [state] = await TokenModel.add(
                    TokenModel.TYPE_OAUTH,
                    600,
                    { redirect: this.request.referer },
                );
                const scope = encodeURIComponent(config.scope);
                this.response.redirect = `${authorization_endpoint}?client_id=${config.id}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
            },
        });

        ctx.i18n.load('zh', {
            'Login With SSO': '使用 SSO 登录',
        });
    }
}
