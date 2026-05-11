/**
 * Monde V2 API Authentication (JWT Token)
 *
 * API V2 usa JWT com validade de 1h.
 * Cache em memória para evitar re-autenticação a cada request.
 *
 * Credenciais: MONDE_V2_LOGIN e MONDE_V2_PASSWORD (Supabase secrets)
 * Se não existirem, tenta MONDE_USERNAME/MONDE_PASSWORD (V3) como fallback.
 */

const TOKEN_MARGIN_MS = 5 * 60 * 1000; // Refresh 5min antes de expirar

let cachedToken: { token: string; expiresAt: number } | null = null;

export interface MondeV2AuthConfig {
  apiUrl: string;
  login: string;
  password: string;
}

/**
 * Obtém credenciais V2 do Monde a partir de env vars e integration_settings.
 * Fallback: se MONDE_V2_LOGIN não existe, usa MONDE_USERNAME.
 */
export function getMondeV2Credentials(
  config: Record<string, string>
): MondeV2AuthConfig {
  const apiUrl =
    config["MONDE_V2_API_URL"] || "https://web.monde.com.br/api/v2";

  // V2-specific credentials, fallback to V3
  const login =
    Deno.env.get("MONDE_V2_LOGIN") || Deno.env.get("MONDE_USERNAME") || "";
  const password =
    Deno.env.get("MONDE_V2_PASSWORD") ||
    Deno.env.get("MONDE_PASSWORD") ||
    "";

  return { apiUrl, login, password };
}

/**
 * Autentica na API V2 do Monde e retorna JWT token.
 * Cache automático — só re-autentica quando token está próximo de expirar.
 */
export async function getMondeV2Token(
  auth: MondeV2AuthConfig
): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_MARGIN_MS) {
    return cachedToken.token;
  }

  const url = `${auth.apiUrl}/tokens`;

  // Trim credentials to remove any trailing whitespace/newlines from secrets
  const login = auth.login.trim();
  const password = auth.password.trim();

  console.log(`[monde-v2-auth] Authenticating at ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "tokens",
        attributes: {
          login,
          password,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Monde V2 auth failed (${response.status}): ${body}`
    );
  }

  const json = await response.json();
  const token = json?.data?.attributes?.token;

  if (!token) {
    throw new Error("Monde V2 auth: no token in response");
  }

  // Cache for 55 minutes (token valid for 1h)
  cachedToken = {
    token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  return token;
}

/**
 * Headers padrão para requests autenticados na API V2.
 */
export function mondeV2Headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
  };
}

/**
 * Invalida o token cacheado (ex: após receber 401).
 */
export function invalidateMondeV2Token(): void {
  cachedToken = null;
}
