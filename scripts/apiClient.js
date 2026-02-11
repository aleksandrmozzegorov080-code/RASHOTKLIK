// apiClient: вызов VseLLM/DeepSeek (resumeJson + prompt → audit text). См. ASSEMBLY_PLAN.md модуль 6.
// Вызывается из service worker (background), только fetch доступен.

const VSELLM_BASE = 'https://api.vsellm.ru/v1';
const MODEL = 'deepseek/deepseek-chat';
const PLACEHOLDER = 'RESUME_JSON';

/**
 * Подставляет JSON резюме в шаблон промпта вместо RESUME_JSON.
 * @param {string} promptTemplate - шаблон с плейсхолдером RESUME_JSON
 * @param {object} resumeJson - объект резюме
 * @returns {string} итоговый промпт
 */
function fillPrompt(promptTemplate, resumeJson) {
  const jsonStr = typeof resumeJson === 'string' ? resumeJson : JSON.stringify(resumeJson, null, 2);
  return promptTemplate.replace(PLACEHOLDER, jsonStr);
}

/**
 * Отправляет запрос к VseLLM (DeepSeek), возвращает текст ответа.
 * @param {object} resumeJson - резюме в виде объекта
 * @param {string} promptTemplate - промпт с плейсхолдером RESUME_JSON
 * @param {string} apiKey - API-ключ VseLLM
 * @returns {Promise<string>} текст аудита или throw Error
 */
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
