# Справка: OAuth 2.0 API HeadHunter (hh.ru)

Краткая выжимка из официальной документации для реализации авторизации пользователя в расширении.

---

## Уровни авторизации

- **Авторизация приложения** — запросы от имени приложения.
- **Авторизация пользователя** — запросы от имени пользователя (нужен пользовательский токен).

Для получения резюме через `api.hh.ru/resumes/{id}` нужна **авторизация пользователя**.

---

## Шаг 1: Редирект на страницу авторизации

Открыть в браузере:

```
https://hh.ru/oauth/authorize?
  response_type=code&
  client_id={client_id}&
  state={state}&
  redirect_uri={redirect_uri}
```

| Параметр        | Обязательный | Описание |
|-----------------|-------------|----------|
| `response_type` | да          | Всегда `code` (authorization code). |
| `client_id`     | да          | Идентификатор приложения с [dev.hh.ru](https://dev.hh.ru). |
| `state`         | нет         | Строка для защиты от CSRF; вернётся в редиректе. |
| `redirect_uri`  | нет         | URL редиректа после авторизации. Если не указать — берётся из настроек приложения. При указании — валидация (см. ниже). Рекомендуется `encodeURIComponent`. |

---

## Правила формирования redirect_uri

Значение должно быть «расширением» того, что сохранено в настройках приложения на dev.hh.ru.

**Разрешено (пример при сохранённом `http://example.com/oauth`):**

- `http://www.example.com/oauth` — поддомен;
- `http://www.example.com/oauth/sub/path` — уточнение пути;
- `http://example.com/oauth?lang=RU` — дополнительный query-параметр;
- `http://www.example.com/oauth/sub/path?lang=RU` — поддомен + путь + параметр.

**Запрещено:**

- Другой протокол: `https://example.com/oauth` при сохранённом `http://...`;
- Другой домен: `http://wwwexample.com/oauth`;
- Другой путь: `http://example.com/oauths` или `http://wwwexample.com/`;
- Указание порта, которого не было в настройках: `http://example.com:80/oauth`.

---

## Шаг 2: Поведение после редиректа

- **Пользователь отклонил доступ:** редирект на  
  `{redirect_uri}?error=access_denied` (и `&state={state}`, если был передан).
- **Успех:** редирект на  
  `{redirect_uri}?code={authorization_code}` (и при наличии — `&state={state}`).

`authorization_code` живёт недолго, обменять на токены нужно сразу.

---

## Шаг 3: Обмен code на access и refresh токены

**Метод:** `POST`  
**URL:** `https://api.hh.ru/token`  
**Content-Type:** `application/x-www-form-urlencoded`

В теле запроса передать (в формате form-urlencoded):

- `grant_type=authorization_code`
- `client_id={client_id}`
- `client_secret={client_secret}` — секрет приложения с dev.hh.ru (для конфиденциальных клиентов).
- `code={authorization_code}`
- `redirect_uri={redirect_uri}` — тот же, что при запросе authorize.

В ответе ожидаются поля: `access_token`, `refresh_token`, `expires_in` (срок жизни access в секундах).

---

## Шаг 4: Использование access_token

В заголовках запросов к API:

```
Authorization: Bearer {access_token}
```

Пример проверки: `GET https://api.hh.ru/me` с этим заголовком.

---

## Шаг 5: Обновление пары токенов (refresh)

Когда `access_token` истёк — запрос новой пары по `refresh_token`.

**Метод:** `POST`  
**URL:** `https://api.hh.ru/token`  
**Content-Type:** `application/x-www-form-urlencoded`

В теле:

- `grant_type=refresh_token`
- `refresh_token={refresh_token}`

В ответе — новая пара `access_token`, `refresh_token` и `expires_in`.  
`refresh_token` обычно можно использовать только один раз; после обновления хранить и использовать новую пару.

---

## Хранение в расширении (рекомендация)

В `chrome.storage.local` хранить объект:

- `access_token` — для заголовка `Authorization: Bearer ...`
- `refresh_token` — для запроса обновления
- `expires_in` или `access_expires_at` (timestamp) — чтобы до истечения вызывать refresh

Перед запросами к API проверять срок действия access и при необходимости обновлять токены через `POST https://api.hh.ru/token` с `grant_type=refresh_token`.

---

## Регистрация приложения

- Кабинет разработчика: [https://dev.hh.ru](https://dev.hh.ru) / [https://dev.hh.ru/admin](https://dev.hh.ru/admin).
- Создать приложение, получить `client_id` и `client_secret`.
- В настройках приложения указать **redirect_uri** (например, страница расширения или отдельный URL). Для Chrome-расширения можно использовать страницу вроде `chrome-extension://<id>/options/oauth_callback.html` и добавить этот URL в настройки приложения на dev.hh.ru (если HH принимает extension scheme — уточнить в документации).

---

*Источник: официальная документация API hh.ru (авторизация пользователя, OAuth 2.0).*
