// Утилита для загрузки токена HH из config.json (hh-applicant-tool)
// В Chrome Extensions нет прямого доступа к файловой системе,
// поэтому пользователь должен либо:
// 1. Вставить токен вручную в настройках
// 2. Или мы создадим Native Messaging Host (сложнее)
// 
// Простое решение: добавить кнопку в Options "Импорт токена из файла"
// и позволить пользователю выбрать config.json через file input.

/**
 * Парсит config.json и извлекает access_token
 * @param {string} configJsonText - содержимое config.json
 * @returns {string|null} - access_token или null
 */
function extractTokenFromConfig(configJsonText) {
  try {
    const config = JSON.parse(configJsonText);
    const token = config?.token?.access_token;
    return token || null;
  } catch (e) {
    console.error('Error parsing config.json:', e);
    return null;
  }
}

// Для использования в options.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractTokenFromConfig };
}
