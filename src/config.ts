/**
 * Everything the Connector needs arrives through the environment. Never through
 * argv: a command line is visible to every process on the machine (`ps`), a
 * config file's `env` block is not, and the snippet DokuTrak's "Connect an
 * agent" screen hands out is an `env` block.
 *
 * The variable names are a contract with that screen
 * (`apps/web/src/features/settings/agent-connection-config.ts` in the product
 * repo): change them together or nobody's agent authenticates.
 */
export const CONNECTION_ENV_VAR = 'DOKUTRAK_API_KEY';
export const API_URL_ENV_VAR = 'DOKUTRAK_API_URL';
export const DEFAULT_API_URL = 'https://app.dokutrak.com/api';

export interface ConnectorConfig {
  apiKey: string;
  baseUrl: string;
}

export class ConfigError extends Error {}

export function readConfig(
  env: Record<string, string | undefined> = process.env
): ConnectorConfig {
  const apiKey = env[CONNECTION_ENV_VAR]?.trim();
  if (!apiKey) {
    throw new ConfigError(
      `${CONNECTION_ENV_VAR} is not set. Create an Agent Connection in DokuTrak ` +
        `(Settings → Connect an agent) and put the key in the "env" block of ` +
        `your MCP client configuration.`
    );
  }

  const baseUrl = (env[API_URL_ENV_VAR]?.trim() || DEFAULT_API_URL).replace(
    /\/+$/,
    ''
  );

  return { apiKey, baseUrl };
}
