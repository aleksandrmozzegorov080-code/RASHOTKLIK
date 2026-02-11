# Правило: Service Worker в Chrome Extension (Manifest V3)

**Дата:** 2025-02-11  
**Проблема:** Service worker не запускался.  
**Решение:** Убрать `importScripts()` и встроить код в один файл `background.js`.

---

## Правило

В **Manifest V3** при любой ошибке во время загрузки фона (в т.ч. при загрузке скрипта через `importScripts()`) Chrome **не регистрирует** service worker — воркер «не запускается», под расширением на `chrome://extensions` может быть ошибка или ссылка «Service worker» не активна.

**Рекомендация:** не использовать `importScripts()` в service worker. Код, который нужен в фоне, держать в одном файле (`scripts/background.js`) или встроить его туда.

---

## Что было сделано

- **Было:** `background.js` вызывал `importScripts('scripts/apiClient.js')`; при сбое загрузки второго файла воркер не стартовал.
- **Стало:** Логика из `apiClient.js` (VSELLM_BASE, fillPrompt, callDeepSeekAudit) перенесена в `background.js`. Вызов `importScripts` удалён. Воркер один файл — запуск стабильный.

Файл `scripts/apiClient.js` оставлен в проекте для справки; background его больше не подключает.

---

## На будущее

- Если снова понадобится вынести часть кода в отдельный файл и подключать из фона — либо по‑прежнему встраивать этот код в `background.js`, либо подключать через `importScripts()` только в **try/catch** и обрабатывать ошибку (логировать, не давать воркеру «молча» падать).
- Путь в `importScripts()` задаётся **от корня расширения**, например: `scripts/apiClient.js`.
