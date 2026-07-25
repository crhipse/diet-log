const SESSION_KEY = "diet-log:anthropic-key:session";
const REMEMBERED_KEY = "diet-log:anthropic-key:remembered";
const REMEMBER_FLAG = "diet-log:anthropic-key:remember";

export interface StoredApiKey {
  apiKey: string;
  remembered: boolean;
}

export function loadApiKey(): StoredApiKey {
  const remembered = localStorage.getItem(REMEMBER_FLAG) === "true";
  if (remembered) {
    return {
      apiKey: localStorage.getItem(REMEMBERED_KEY) ?? "",
      remembered: true
    };
  }
  return {
    apiKey: sessionStorage.getItem(SESSION_KEY) ?? "",
    remembered: false
  };
}

export function saveApiKey(apiKey: string, remember: boolean): void {
  const trimmed = apiKey.trim();
  clearApiKey();
  if (!trimmed) return;

  if (remember) {
    localStorage.setItem(REMEMBERED_KEY, trimmed);
    localStorage.setItem(REMEMBER_FLAG, "true");
  } else {
    sessionStorage.setItem(SESSION_KEY, trimmed);
  }
}

export function clearApiKey(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBERED_KEY);
  localStorage.removeItem(REMEMBER_FLAG);
}
