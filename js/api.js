// api.js — Anthropic API 호출 (BYOK)
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (권장)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (고성능)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (빠름)" }
];
const DEFAULT_MODEL = "claude-sonnet-4-6";

function apiErrorMessage(status) {
  switch (status) {
    case 401: return "API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
    case 429: return "사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
    case 529: return "Anthropic 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.";
    default: return `요청에 실패했습니다. (오류 코드 ${status})`;
  }
}

async function callClaude({ apiKey, model, system, messages, maxTokens = 4000 }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
  });
  if (!res.ok) throw new Error(apiErrorMessage(res.status));
  return res.json();
}

// 키 검증: max_tokens 1짜리 테스트 호출
async function validateApiKey(apiKey, model) {
  await callClaude({
    apiKey,
    model,
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 1
  });
  return true;
}
