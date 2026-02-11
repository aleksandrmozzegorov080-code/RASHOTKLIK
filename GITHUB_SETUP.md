# Выкладка RASHOTKLIK на GitHub

Отдельный репозиторий только для папки **RASHOTKLIK**.

---

## Шаги

### 1. Создать репозиторий на GitHub

1. [github.com](https://github.com) → **«+» → «New repository»**
2. Имя, например: **RASHOTKLIK**
3. **Не** добавлять README / .gitignore / license — репозиторий уже есть локально
4. **Create repository** → скопировать URL, например:  
   `https://github.com/ТВОЙ_ЛОГИН/RASHOTKLIK.git`

### 2. Добавить remote и отправить код

В терминале **в папке RASHOTKLIK**:

```powershell
cd "C:\Users\musae\Downloads\AnalitikSkyPro\Rezume\RASHOTKLIK"

git remote add origin https://github.com/ТВОЙ_ЛОГИН/RASHOTKLIK.git
git branch -M main
git push -u origin main
```

Подставь свой URL вместо `https://github.com/ТВОЙ_ЛОГИН/RASHOTKLIK.git`.

### 3. Дальше

- Обновлять репозиторий: `git add .` → `git commit -m "..."` → `git push origin main`.
- **Релизы, ветки, несколько программистов:** см. [CONTRIBUTING.md](CONTRIBUTING.md) (как добавлять коллег, делать релизы и пуши по-программистски).

---

## Если remote уже есть или ошибка доступа

- Удалить remote: `git remote remove origin`
- Ошибка доступа при push — использовать токен вместо пароля или SSH:  
  `git remote set-url origin git@github.com:ЛОГИН/RASHOTKLIK.git`
