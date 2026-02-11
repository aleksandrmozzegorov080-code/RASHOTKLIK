// Background (service worker): скачивание резюме и аудит через VseLLM API.

const VSELLM_BASE = 'https://api.vsellm.ru/v1';
let MODEL = 'deepseek/deepseek-v3.2';
const PLACEHOLDER = 'RESUME_JSON';

function fillPrompt(promptTemplate, resumeJson) {
  const jsonStr = typeof resumeJson === 'string' ? resumeJson : JSON.stringify(resumeJson, null, 2);
  return promptTemplate.replace(PLACEHOLDER, jsonStr);
}

function callDeepSeekAudit(resumeJson, promptTemplate, apiKey) {
  const content = fillPrompt(promptTemplate, resumeJson);
  const url = VSELLM_BASE + '/chat/completions';
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content }],
    max_tokens: 4096,
  };
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
  })
    .then((r) => {
      if (r.status === 401) throw new Error('Неверный API-ключ VseLLM.');
      if (r.status === 429) throw new Error('Превышен лимит запросов. Попробуйте позже.');
      if (!r.ok) return r.text().then((t) => { throw new Error(r.status + ': ' + (t || r.statusText)); });
      return r.json();
    })
    .then((data) => {
      const text = data?.choices?.[0]?.message?.content;
      if (text == null) throw new Error('Пустой ответ от API');
      return text;
    });
}

const STORAGE_KEYS = {
  lastAudit: 'lastAudit',
  lastAuditTime: 'lastAuditTime',
};

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'getState') {
    getStorage([STORAGE_KEYS.lastAudit, STORAGE_KEYS.lastAuditTime])
      .then((data) => sendResponse({
        lastAudit: data[STORAGE_KEYS.lastAudit] ?? null,
        lastAuditTime: data[STORAGE_KEYS.lastAuditTime] ?? null,
      }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'runAudit') {
    const resume = msg.resume;
    if (!resume) {
      sendResponse({ error: 'Нет данных резюме. Откройте страницу резюме на hh.ru.' });
      return true;
    }

    const configUrl = chrome.runtime.getURL('server_data/config.json');
    const promptUrl = chrome.runtime.getURL('server_data/prompts/default-audit.txt');

    Promise.all([
      fetch(configUrl).then(r => r.json()),
      fetch(promptUrl).then(r => r.text()),
    ])
      .then(([config, prompt]) => {
        const apiKey = config.vsellm_api_key;
        if (config.model) MODEL = config.model;
        if (!apiKey || apiKey === 'ВАШ_КЛЮЧ_VSELLM_СЮДА' || !apiKey.trim()) {
          sendResponse({ error: 'Укажите API-ключ в server_data/config.json' });
          return;
        }
        if (!prompt || !prompt.trim()) {
          sendResponse({ error: 'Не найден промпт в server_data/prompts/default-audit.txt' });
          return;
        }
        return callDeepSeekAudit(resume, prompt, apiKey.trim())
          .then((auditText) => {
            const timestamp = Date.now();
            return setStorage({
              [STORAGE_KEYS.lastAudit]: auditText,
              [STORAGE_KEYS.lastAuditTime]: timestamp,
            }).then(() => sendResponse({ audit: auditText, timestamp }));
          })
          .catch((err) => sendResponse({ error: err.message }));
      })
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'downloadResumeFile') {
    const url = msg.url;
    const filename = msg.filename || 'resume.txt';
    if (!url) {
      sendResponse({ error: 'Нет URL для скачивания' });
      return true;
    }
    chrome.downloads.download(
      { url: url, filename: filename, saveAs: true },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId: downloadId });
        }
      }
    );
    return true;
  }

  sendResponse({ error: 'Неизвестное действие' });
  return true;
});
