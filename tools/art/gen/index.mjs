// The generation adapters. Each is { name, defaultModel, generate(), checkKey() } and `generate` returns
//   { png, model, params, requestId, keyed }   keyed: null (the picture has its own alpha) or the key colour to remove.
import * as openai from './openai.mjs';
import * as flux from './bfl.mjs';

export const adapters = { openai, flux };
export const adapter = n => { const a = adapters[n]; if (!a) throw new Error(`unknown API "${n}" (${Object.keys(adapters).join(', ')})`); return a; };

// Node's fetch ignores HTTPS_PROXY unless asked (Node 22.21+): in a cloud session every call goes through the agent proxy, which
// also adds the saved key, so the command starts itself again with the switch on.
export function needsProxyRestart(env = process.env) { return !!(env.HTTPS_PROXY || env.https_proxy) && !env.NODE_USE_ENV_PROXY; }

// is a key available here? (the cloud proxy supplies it, anywhere else it is an environment variable)
export function keyHint(api, env = process.env) {
  const v = { openai: 'OPENAI_API_KEY', flux: 'BFL_API_KEY' }[api];
  return env[v] || env.CCR_AGENT_PROXY_ENABLED ? null : `${v} is not set (in a cloud session the key is a network secret: docs/ART_PIPELINE.md, "Keys")`;
}
