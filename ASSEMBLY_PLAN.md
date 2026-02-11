# План сборки расширения «Аудит резюме» (RASHOTKLIK)

**Для ИИ (новый чат):** открой этот файл (`ASSEMBLY_PLAN.md`) и выполни сборку **строго по модулям по порядку**. После каждого модуля проект должен оставаться рабочим (расширение загружается в Chrome без ошибок, где применимо).

**Контекст:** см. [PLAN_AND_ARCHITECTURE.md](PLAN_AND_ARCHITECTURE.md) — цель, архитектура, поток данных.

---

## Структура проекта (уже создана)

```
RASHOTKLIK/
├── manifest.json
├── ASSEMBLY_PLAN.md          ← этот файл (инструкция для сборки)
├── PLAN_AND_ARCHITECTURE.md  ← архитектура и логика
├── prompts/                  ← промпты для аудита (пока локально; позже — удалённый URL)
│   ├── default-audit.txt     ← промпт по умолчанию (плейсхолдер RESUME_JSON)
│   └── README.md
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
└── scripts/
    ├── background.js
    ├── contentScript.js
    └── apiClient.js
```

---

## Модуль 1. Manifest и базовая проверка

**Цель:** убедиться, что расширение загружается в Chrome (Load unpacked).

**Шаги:**

1. Проверь [manifest.json](manifest.json):
   - `manifest_version: 3`
   - `permissions`: `storage`, `activeTab`, `scripting`
   - `host_permissions`: `https://*.hh.ru/*`, `https://api.vsellm.ru/*`, `https://vsellm.ru/*`
   - `action.default_popup`: `popup/popup.html`
   - `background.service_worker`: `scripts/background.js`
   - `content_scripts`: один скрипт для `https://*.hh.ru/*` — `scripts/contentScript.js`
   - `options_ui.page`: `options/options.html`

2. Убедись, что все пути к файлам существуют и что popup/options открываются без ошибок в консоли.

**Критерий готовности:** в chrome://extensions по кнопке «Загрузить распакованное» расширение загружается, по клику на иконку открывается popup с заголовком и кнопками (пока без логики).

---

## Модуль 2. Popup — UI и связь с background

**Цель:** popup показывает статус, кнопки отправляют сообщения в background и получают ответы.

**Файлы:** [popup/popup.html](popup/popup.html), [popup/popup.js](popup/popup.js), [popup/popup.css](popup/popup.css).

**Шаги:**

1. **popup.html** — оставить разметку: заголовок, `#status`, кнопки «Получить резюме с HH.ru», «Отправить в ИИ (DeepSeek)», «Скачать результат», блок `#audit-preview`. Подключить `popup.css` и `popup.js`.

2. **popup.css** — базовые стили: размер popup (например min-width 320px), отступы, кнопки, блок превью аудита (скролл при длинном тексте).

3. **popup.js** — реализовать:
   - При открытии popup: запросить у background последнее сохранённое резюме и последний аудит (через `chrome.runtime.sendMessage`). Показать в `#status` краткий статус («Резюме загружено» / «Резюме не загружено»; «Есть последний аудит» / «Нет»). Вывести начало текста аудита в `#audit-preview` (если есть).
   - Кнопка «Получить резюме с HH.ru»: отправить в background сообщение типа `{ action: 'getResume' }`. Показать в статусе «Запрос…» / «Готово» / «Ошибка: откройте страницу резюме на hh.ru».
   - Кнопка «Отправить в ИИ»: отправить `{ action: 'runAudit' }`. Показать «Отправляем в ИИ…» / «Аудит получен» / текст ошибки.
   - Кнопка «Скачать результат»: взять последний аудит из ответа background (или из ранее полученных данных), сформировать Blob (text/plain или text/markdown), скачать через `URL.createObjectURL` и `<a download>`.
   - Все запросы к background — через `chrome.runtime.sendMessage`; ответы обрабатывать и обновлять `#status` и `#audit-preview`.

**Критерий готовности:** в popup отображаются статусы; по нажатию кнопок в background приходят сообщения (в background пока можно отвечать заглушками).

---

## Модуль 3. Options — сохранение настроек

**Цель:** пользователь вводит токен HH.ru (опционально), API-ключ VseLLM и промпт аудита; данные сохраняются в `chrome.storage.local`.

**Файлы:** [options/options.html](options/options.html), [options/options.js](options/options.js), [options/options.css](options/options.css).

**Шаги:**

1. **options.html** — поля: токен HH.ru (type=password), API-ключ VseLLM (type=password), текстовое поле для промпта аудита (многострочное). Кнопки «Сохранить», «Загрузить промпт по умолчанию», «Проверить подключение». Блок `#options-status` для сообщений.

2. **options.js** — реализовать:
   - При загрузке: прочитать из `chrome.storage.local` ключи `hhToken`, `vsellmApiKey`, `auditPrompt`. Если `auditPrompt` пустой — загрузить промпт из файла: `fetch(chrome.runtime.getURL('prompts/default-audit.txt')).then(r => r.text())` и подставить в поле.
   - Кнопка «Загрузить промпт по умолчанию»: тот же fetch к `prompts/default-audit.txt`, подставить текст в textarea.
   - По «Сохранить»: записать значения в `chrome.storage.local`, показать «Настройки сохранены» в `#options-status`.
   - По «Проверить подключение»: взять `vsellmApiKey`, тестовый запрос к API VseLLM, показать успех/ошибку в `#options-status`.
   - *На будущее:* заложить возможность загрузки промпта по URL (удалённый источник вне расширения).

3. **options.css** — оформление формы (поля, кнопки, отступы).

**Критерий готовности:** при пустом промпте подгружается `prompts/default-audit.txt`; кнопка «Загрузить промпт по умолчанию» заполняет поле из файла; после сохранения настройки видны при повторном открытии; «Проверить подключение» при валидном ключе возвращает успех или явную ошибку.

---

## Модуль 4. Background — оркестрация и chrome.storage

**Цель:** background обрабатывает сообщения от popup: запрос резюме, запрос аудита; хранит и отдаёт последнее резюме и последний аудит.

**Файлы:** [scripts/background.js](scripts/background.js).

**Шаги:**

1. В `background.js`:
   - Подписаться на `chrome.runtime.onMessage`.
   - Сообщение `getResume`: получить активную вкладку (`chrome.tabs.query({ active: true, currentWindow: true })`). Если URL не hh.ru — ответить ошибкой «Откройте страницу резюме на hh.ru». Иначе вызвать `chrome.scripting.executeScript({ target: { tabId }, files: ['scripts/contentScript.js'] })` или отправить сообщение в content script (если content script уже инжектирован — тогда отправить `chrome.tabs.sendMessage(tabId, { action: 'extractResume' })` и в ответ получить JSON). Сохранённый JSON резюме записать в `chrome.storage.local` (ключ например `lastResume`) и вернуть в popup успех/данные.
   - Сообщение `runAudit`: прочитать из storage `lastResume`, `vsellmApiKey`, `auditPrompt`. Если чего-то нет — ответить ошибкой. Иначе вызвать функцию вызова API (модуль 6 — логику apiClient встроить в background.js, **не использовать importScripts()**; см. RULES_SERVICE_WORKER_MV3.md). Результат аудита сохранить в `chrome.storage.local` (например `lastAudit`, `lastAuditTime`) и вернуть текст в popup.
   - Сообщение «отдать последние данные» (например `{ action: 'getState' }`): прочитать `lastResume`, `lastAudit`, `lastAuditTime` из storage и вернуть в popup для отображения статуса и превью.

2. Не подключать apiClient через importScripts — в MV3 при ошибке загрузки воркер не стартует. Код вызова VseLLM держать в одном файле background.js.

**Критерий готовности:** popup по кнопке «Получить резюме» получает ответ от background (пока от content script может приходить заглушка); по «Отправить в ИИ» background вызывает API (модуль 6) и возвращает результат; по открытию popup приходят последние сохранённые данные.

---

## Модуль 5. Content script — парсинг резюме с HH.ru

**Цель:** на странице резюме hh.ru собрать данные в единый JSON и отдать в background по запросу.

**Файлы:** [scripts/contentScript.js](scripts/contentScript.js).

**Шаги:**

1. В content script слушать сообщения от background: например `chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { if (msg.action === 'extractResume') { ... sendResponse(...) } })`.

2. Реализовать функцию извлечения данных со страницы:
   - Определить, что текущая страница — страница просмотра резюме (по URL или по наличию характерных блоков).
   - Парсинг DOM: найти блоки с ФИО, контактами, опытом работы, образованием, навыками, языками (селекторы подобрать по актуальной вёрстке hh.ru; при необходимости описать в коде комментарии с URL примера страницы).
   - Собрать объект в формате: `{ basic_info: {}, experience: [], education: [], skills: [], languages: [] }` (или согласовать с форматом из PLAN_AND_ARCHITECTURE).
   - Вернуть этот объект в `sendResponse` (или отправить в background через `chrome.runtime.sendMessage` с типом «resumeData»).

3. Если на странице несколько резюме (список) — на первом этапе можно брать первое или то, что в фокусе; в комментарии зафиксировать ограничение.

4. Обработка ошибок: если страница не резюме или структура DOM изменилась — вернуть сообщение об ошибке с кратким описанием.

**Критерий готовности:** на открытой странице резюме hh.ru по запросу из popup приходит заполненный JSON; background сохраняет его и popup показывает «Резюме загружено».

---

## Модуль 6. apiClient — вызов VseLLM (DeepSeek)

**Цель:** по JSON резюме и промпту отправить запрос в API VseLLM (модель DeepSeek), вернуть текст ответа.

**Файлы:** [scripts/apiClient.js](scripts/apiClient.js).

**Шаги:**

1. Уточнить endpoint и формат API VseLLM (документация на vsellm.ru; типично OpenAI-совместимый endpoint с `model`, `messages`, `max_tokens` и т.д.). Указать в коде константы: базовый URL API, имя модели (например DeepSeek).

2. Реализовать функцию вида `callDeepSeekAudit(resumeJson, promptTemplate, apiKey)`:
   - Подставить `JSON.stringify(resumeJson)` в промпт вместо плейсхолдера `RESUME_JSON` (или в блок «резюме»).
   - Сформировать тело запроса (messages: [{ role: 'user', content: finalPrompt }]).
   - Выполнить `fetch` с заголовком `Authorization: Bearer ${apiKey}`.
   - Распарсить ответ, извлечь текст из ответа API (например `response.choices[0].message.content`).
   - Вернуть Promise с текстом или с ошибкой (сетевые ошибки, 401, 429, тело ошибки от API).

3. Учесть, что apiClient будет вызываться из service worker (background): использовать только те API, что доступны в worker (fetch — доступен).

**Критерий готовности:** из background при нажатии «Отправить в ИИ» уходит запрос в VseLLM, приходит текст аудита и сохраняется; в popup отображается результат.

---

## Модуль 7. Интеграция и экспорт

**Цель:** полный цикл «резюме → аудит → скачивание» и понятные сообщения об ошибках.

**Файлы:** [popup/popup.js](popup/popup.js), [scripts/background.js](scripts/background.js).

**Шаги:**

1. Popup: при отсутствии резюме кнопку «Отправить в ИИ» можно дизейблить или показывать предупреждение; после успешного «Получить резюме» — включать кнопку.
2. Popup: при отсутствии API-ключа в настройках по «Отправить в ИИ» показывать: «Укажите API-ключ VseLLM в настройках».
3. Скачивание: имя файла включать дату/время (например `audit_resume_YYYY-MM-DD_HH-mm.txt`), контент — текст последнего аудита (при желании — в начале файла метаданные: дата, источник).
4. Background: при ошибках от apiClient (сеть, 401, лимиты) возвращать в popup читаемое сообщение на русском; popup выводить его в `#status`.

**Критерий готовности:** пользователь может пройти цикл: открыть резюме на hh.ru → «Получить резюме» → «Отправить в ИИ» → «Скачать результат»; при сбоях видны понятные сообщения.

---

## Модуль 8. README и финальная проверка

**Цель:** любой разработчик (или ИИ в новом чате) может установить расширение и понять, как им пользоваться.

**Файлы:** [README.md](README.md).

**Шаги:**

1. Обновить README:
   - Название и краткое описание проекта.
   - Что нужно: Chrome, API-ключ VseLLM (ссылка на vsellm.ru/account/dashboard), опционально токен HH.ru.
   - Как установить: «Загрузить распакованное расширение» из папки проекта.
   - Как пользоваться: открыть страницу резюме на hh.ru → в расширении «Получить резюме» → в настройках указать ключ VseLLM и промпт → «Отправить в ИИ» → «Скачать результат».
   - Структура проекта (дерево файлов) и ссылка на PLAN_AND_ARCHITECTURE.md и ASSEMBLY_PLAN.md.

2. Проверить: расширение загружается без ошибок, все модули работают по сценарию выше.

**Критерий готовности:** README описывает установку и использование; сборка по этому плану воспроизводима.

---

## Порядок выполнения для ИИ

1. Модуль 1 — проверить manifest и пути.  
2. Модуль 2 — popup UI и сообщения в background.  
3. Модуль 3 — options и сохранение в storage.  
4. Модуль 4 — background: обработка сообщений и вызов content script / API.  
5. Модуль 5 — content script: парсинг резюме с hh.ru.  
6. Модуль 6 — apiClient: запрос к VseLLM/DeepSeek.  
7. Модуль 7 — доработка интеграции и экспорта.  
8. Модуль 8 — README и финальная проверка.

В новом чате достаточно открыть **ASSEMBLY_PLAN.md** и сказать: «Собери расширение по этому плану, модуль за модулем» (или начать с конкретного модуля, если часть уже сделана).
