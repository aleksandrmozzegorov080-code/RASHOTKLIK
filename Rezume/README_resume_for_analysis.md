# Формат resume_for_analysis.json для Rezume/resume

В проекте **Rezume** (папка на уровень выше RASHOTKLIK) аудит резюме запускается так:

```bash
python resume/run_audit.py
```

Скрипт **ожидает файл** `resume/resume_for_analysis.json` (рядом с `run_audit.py`), а не в папке RASHOTKLIK/Rezume/.

## Как получить правильный файл в Rezume/resume/

**Вариант 1 — скрипт (рекомендуется)**  
Из папки **RASHOTKLIK** выполните:

```bash
node scripts/to-resume-for-analysis.js
```

Скрипт возьмёт последний `Rezume/resume_*.json` и **запишет** `resume_for_analysis.json` в папку **Rezume/resume/** (туда, где лежит run_audit.py). После этого из корня Rezume запустите `python resume/run_audit.py`.

**Вариант 2 — кнопка в расширении**  
Нажмите в popup «Скачать для аудита (resume_text)». В диалоге сохранения **указать папку**  
`C:\Users\musae\Downloads\AnalitikSkyPro\Rezume\resume\`  
и имя файла `resume_for_analysis.json`. Не сохраняйте в RASHOTKLIK/Rezume/.

## Формат (как в pdf_to_json.py)

Один JSON-объект с полем `resume_text` — строка с текстом резюме:

```json
{"resume_text": "Должность: ...\n\nОпыт работы: ..."}
```
