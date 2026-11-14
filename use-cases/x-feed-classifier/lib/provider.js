// OpenRouter's documented TypeSafe-compatible System One surface.
// https://openrouter.ai/docs/guides/community/typesafe-sdk
export const API='https://openrouter.ai/api/v1/systemone';
export const API_ORIGIN='https://openrouter.ai/*';
export const MODEL='typesafe/jev-1.14';
export const KEY_URL='https://openrouter.ai/settings/keys';
export function validOpenRouterKey(value){return typeof value==='string'&&value.trim().startsWith('sk-or-')&&value.trim().length>=20&&value.length<=500&&!/\s/.test(value.trim());}
