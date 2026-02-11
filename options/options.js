// Options: токен HH, ключ VseLLM, промпт аудита.
// Промпт по умолчанию загружается из папки prompts/ (prompts/default-audit.txt).
// В дальнейшем планируется загрузка промпта из удалённого URL.

const KEYS = { HH_TOKEN: 'hhToken', VSELLM_KEY: 'vsellmApiKey', AUDIT_PROMPT: 'auditPrompt' };
const DEFAULT_PROMPT_URL = 'prompts/default-audit.txt';

const el = (id) => document.getElementById(id);

function showStatus(msg, isError = false) {
  const s = el('options-status');
  if (!s) return;
  s.textContent = msg;
  s.style.color = isError ? '#c00' : '#000';
}

function loadDefaultPrompt() {
  const auditPromptEl = el('audit-prompt');
  if (!auditPromptEl) return;
  const url = chrome.runtime.getURL(DEFAULT_PROMPT_URL);
  fetch(url)
    .then((r) => r.text())
    .then((text) => {
      auditPromptEl.value = text;
      showStatus('Промпт по умолчанию загружен из папки prompts/');
    })
    .catch((err) => showStatus('Ошибка загрузки промпта: ' + err.message, true));
}

function loadOptions() {
  const hhTokenEl = el('hh-token');
  const vsellmKeyEl = el('vsellm-key');
  const auditPromptEl = el('audit-prompt');
  if (!hhTokenEl || !vsellmKeyEl || !auditPromptEl) return;
  chrome.storage.local.get([KEYS.HH_TOKEN, KEYS.VSELLM_KEY, KEYS.AUDIT_PROMPT], (data) => {
    hhTokenEl.value = data[KEYS.HH_TOKEN] || '';
    vsellmKeyEl.value = data[KEYS.VSELLM_KEY] || '';
    const prompt = data[KEYS.AUDIT_PROMPT];
    if (prompt) {
      auditPromptEl.value = prompt;
    } else {
      loadDefaultPrompt();
    }
  });
}

function saveOptions() {
  const hhTokenEl = el('hh-token');
  const vsellmKeyEl = el('vsellm-key');
  const auditPromptEl = el('audit-prompt');
  if (!hhTokenEl || !vsellmKeyEl || !auditPromptEl) {
    showStatus('Не найдены поля настроек.', true);
    return;
  }
  const payload = {
    [KEYS.HH_TOKEN]: hhTokenEl.value.trim(),
    [KEYS.VSELLM_KEY]: vsellmKeyEl.value.trim(),
    [KEYS.AUDIT_PROMPT]: auditPromptEl.value.trim(),
  };
  chrome.storage.local.set(payload, () => {
    showStatus('Настройки сохранены');
  });
}

function testConnection() {
  const vsellmKeyEl = el('vsellm-key');
  if (!vsellmKeyEl) return;
  const key = vsellmKeyEl.value.trim();
  if (!key) {
    showStatus('Введите API-ключ VseLLM', true);
    return;
  }
  showStatus('Проверка…');
  // Тестовый запрос к VseLLM (уточнить endpoint по документации vsellm.ru)
  fetch('https://api.vsellm.ru/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: 'Ответь одним словом: ок' }],
      max_tokens: 10,
    }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.json();
    })
    .then(() => showStatus('Подключение успешно'))
    .catch((err) => showStatus('Ошибка: ' + err.message, true));
}

const btnLoadPrompt = el('btn-load-default-prompt');
const btnSave = el('btn-save');
const btnTest = el('btn-test');

if (btnLoadPrompt) btnLoadPrompt.addEventListener('click', loadDefaultPrompt);
if (btnSave) btnSave.addEventListener('click', saveOptions);
if (btnTest) btnTest.addEventListener('click', testConnection);

// Автообновление токена из storage каждые 2 секунды
setInterval(() => {
  chrome.storage.local.get(['hhToken'], (data) => {
    const hhTokenEl = el('hh-token');
    if (hhTokenEl && data.hhToken) {
      hhTokenEl.value = data.hhToken;
    }
  });
}, 2000);

loadOptions();
