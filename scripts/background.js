// Background (service worker): оркестрация запросов резюме и вызова API. См. ASSEMBLY_PLAN.md модуль 4.
// apiClient встроен ниже (без importScripts), чтобы воркер гарантированно запускался в MV3.

const VSELLM_BASE = 'https://api.vsellm.ru/v1';
const MODEL = 'deepseek/deepseek-chat';
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
      if (r.status === 401) throw new Error('Неверный API-ключ VseLLM. Проверьте настройки.');
      if (r.status === 429) throw new Error('Превышен лимит запросов VseLLM. Попробуйте позже.');
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
  lastResume: 'lastResume',
  lastAudit: 'lastAudit',
  lastAuditTime: 'lastAuditTime',
  vsellmApiKey: 'vsellmApiKey',
  auditPrompt: 'auditPrompt',
  hhToken: 'hhToken',
};

const HH_API_BASE = 'https://api.hh.ru';
const RESUME_ID_PATTERN = /\/resume\/([a-f0-9]{32})\/?/i;

/** Извлечь resume_id из URL страницы hh.ru (как в hh-applicant-tool). */
function getResumeIdFromUrl(url) {
  const m = (url || '').match(RESUME_ID_PATTERN);
  return m ? m[1] : null;
}

/** Получить резюме как JSON с api.hh.ru (заголовки как в hh-applicant-tool). */
function fetchResumeFromApi(resumeId, accessToken) {
  const url = `${HH_API_BASE}/resumes/${resumeId}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-hh-app-active': 'true',
    'Accept': 'application/json',
  };
  return fetch(url, { method: 'GET', headers })
    .then((r) => {
      if (r.status === 401) throw new Error('Токен HH недействителен или истёк. Обновите токен в настройках.');
      if (r.status === 403) throw new Error('Доступ к резюме запрещён. Проверьте токен и что резюме — ваше.');
      if (r.status === 404) throw new Error('Резюме не найдено по ID.');
      if (!r.ok) return r.text().then((t) => { throw new Error(r.status + ': ' + (t || r.statusText)); });
      return r.json();
    });
}

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
  // Инструкция: content script шлёт type: RESUME_EXTRACTED, payload: resume
  if (msg.type === 'RESUME_EXTRACTED' && msg.payload) {
    setStorage({ [STORAGE_KEYS.lastResume]: msg.payload })
      .then(() => sendResponse && sendResponse({ ok: true }))
      .catch((err) => sendResponse && sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'getState') {
    getStorage([STORAGE_KEYS.lastResume, STORAGE_KEYS.lastAudit, STORAGE_KEYS.lastAuditTime])
      .then((data) => sendResponse({
        lastResume: data[STORAGE_KEYS.lastResume] ?? null,
        lastAudit: data[STORAGE_KEYS.lastAudit] ?? null,
        lastAuditTime: data[STORAGE_KEYS.lastAuditTime] ?? null,
      }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'getResume') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ error: 'Нет активной вкладки.' });
        return;
      }
      const url = tab.url || '';
      if (!url.includes('hh.ru')) {
        sendResponse({ error: 'Откройте страницу резюме на hh.ru' });
        return;
      }

      // Простой DOM-парсинг
      chrome.tabs.sendMessage(tab.id, { action: 'extractResume' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: 'Не удалось получить резюме. Убедитесь, что открыта страница просмотра резюме на hh.ru и обновите страницу.' });
          return;
        }
        if (response && response.error) {
          sendResponse({ error: response.error });
          return;
        }
        const resume = response?.resume ?? response;
        if (!resume) {
          sendResponse({ error: 'Резюме не найдено на странице.' });
          return;
        }
        setStorage({ [STORAGE_KEYS.lastResume]: resume })
          .then(() => sendResponse({ resume }))
          .catch((err) => sendResponse({ error: err.message }));
      });
    });
    return true;
  }

  if (msg.action === 'runAudit') {
    getStorage([STORAGE_KEYS.lastResume, STORAGE_KEYS.vsellmApiKey, STORAGE_KEYS.auditPrompt])
      .then((data) => {
        const resume = data[STORAGE_KEYS.lastResume];
        const apiKey = data[STORAGE_KEYS.vsellmApiKey];
        const prompt = data[STORAGE_KEYS.auditPrompt];
        if (!apiKey || !apiKey.trim()) {
          sendResponse({ error: 'Укажите API-ключ VseLLM в настройках.' });
          return;
        }
        if (!prompt || !prompt.trim()) {
          sendResponse({ error: 'Укажите промпт аудита в настройках.' });
          return;
        }
        if (!resume) {
          sendResponse({ error: 'Сначала получите резюме с HH.ru.' });
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
    const filename = msg.filename || 'resume.pdf';
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

