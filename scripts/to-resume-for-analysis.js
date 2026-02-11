/**
 * Конвертация структурированного резюме (resume_*.json из расширения)
 * в формат Rezume/resume: resume_for_analysis.json с полем resume_text.
 *
 * run_audit.py читает файл из папки Rezume/resume/ (рядом с run_audit.py).
 * По умолчанию скрипт пишет именно туда (папка на уровень выше RASHOTKLIK → resume/).
 *
 * Запуск из папки RASHOTKLIK:
 *   node scripts/to-resume-for-analysis.js
 *   node scripts/to-resume-for-analysis.js Rezume/resume_2026-02-11_11-57-13.json
 *   node scripts/to-resume-for-analysis.js Rezume/resume_xxx.json "C:\...\Rezume\resume\resume_for_analysis.json"
 */
const fs = require('fs');
const path = require('path');

const RASHOTKLIK_ROOT = path.resolve(__dirname, '..');
// Папка Rezume/resume/ (проект-родитель): там лежат run_audit.py и pdf_to_json.py
const REZUME_RESUME_DIR = path.resolve(RASHOTKLIK_ROOT, '..', 'resume');
const DEFAULT_OUT = path.join(REZUME_RESUME_DIR, 'resume_for_analysis.json');
const REZUME_DIR = path.join(RASHOTKLIK_ROOT, 'Rezume');

function resumeToPlainText(resume) {
  if (!resume) return '';
  const lines = [];
  const fromApi = resume && ('first_name' in resume || 'title' in resume) && !resume.basic_info;
  if (fromApi) {
    if (resume.first_name || resume.last_name) lines.push([resume.first_name, resume.last_name].filter(Boolean).join(' '));
    if (resume.title) lines.push('Должность: ' + resume.title);
    if (resume.contacts) {
      const c = resume.contacts;
      if (c.phone) lines.push('Телефон: ' + (typeof c.phone === 'string' ? c.phone : (c.phone.number || '')));
      if (c.email) lines.push('Email: ' + (typeof c.email === 'string' ? c.email : (c.email.value || '')));
    }
    if (resume.experience && resume.experience.length > 0) {
      lines.push('', 'Опыт работы:', '');
      resume.experience.forEach((exp) => {
        const pos = exp.position || exp.title || '';
        const emp = exp.employer && (exp.employer.name || '');
        const period = exp.start_date && exp.end_date ? `${exp.start_date} — ${exp.end_date}` : '';
        lines.push([pos, emp, period].filter(Boolean).join(' | '));
      });
    }
    const edu = resume.education;
    if (edu && ((edu.primary && edu.primary.length) || (edu.additional && edu.additional.length))) {
      lines.push('', 'Образование:', '');
      (edu.primary || []).concat(edu.additional || []).forEach((e) => {
        const name = e.name || (e.organization && e.organization.name) || '';
        const level = e.level && e.level.name || '';
        lines.push([name, level].filter(Boolean).join(' — '));
      });
    }
    if (resume.skills) lines.push('', 'Навыки: ' + (typeof resume.skills === 'string' ? resume.skills : (resume.skills || []).map((s) => s.name || s).join(', ')));
    if (resume.about) lines.push('', 'О себе:', resume.about);
    return lines.join('\n').trim();
  }
  const b = resume.basic_info || {};
  if (b.position) lines.push('Должность: ' + b.position);
  if (b.name) lines.push('ФИО: ' + b.name);
  if (b.subtitle) lines.push(b.subtitle);
  if (b.contacts) lines.push('Контакты: ' + b.contacts);
  if (resume.experience && resume.experience.length > 0) {
    lines.push('', 'Опыт работы:', '');
    resume.experience.forEach((item) => {
      if (item.raw) lines.push(item.raw);
      else lines.push([item.title, item.period, item.description].filter(Boolean).join(' | '));
    });
  }
  if (resume.education && resume.education.length > 0) {
    lines.push('', 'Образование:', '');
    resume.education.forEach((item) => {
      lines.push(item.raw || [item.name, item.organization].filter(Boolean).join(' — '));
    });
  }
  if (resume.skills && resume.skills.length > 0) {
    lines.push('', 'Навыки: ' + resume.skills.join(', '));
  }
  if (resume.languages && resume.languages.length > 0) {
    lines.push('', 'Языки: ' + resume.languages.join('; '));
  }
  if (resume.about) lines.push('', 'О себе:', resume.about);
  if (resume.source_url) lines.push('', 'Источник: ' + resume.source_url);
  return lines.join('\n').trim();
}

function main() {
  let inputPath = process.argv[2];
  let outputPath = process.argv[3] || DEFAULT_OUT;

  if (!inputPath) {
    if (!fs.existsSync(REZUME_DIR)) {
      console.error('Папка Rezume/ не найдена. Укажите файл: node scripts/to-resume-for-analysis.js путь/к/resume_xxx.json');
      process.exit(1);
    }
    const files = fs.readdirSync(REZUME_DIR)
      .filter((f) => f.startsWith('resume_') && f.endsWith('.json'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(REZUME_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) {
      console.error('В Rezume/ нет файлов resume_*.json');
      process.exit(1);
    }
    inputPath = path.join(REZUME_DIR, files[0].name);
    console.log('Беру последний по дате:', files[0].name);
  }

  if (!fs.existsSync(inputPath)) {
    console.error('Файл не найден:', inputPath);
    process.exit(1);
  }

  const resume = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const resume_text = resumeToPlainText(resume);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPathAbs = path.resolve(outputPath);
  fs.writeFileSync(outPathAbs, JSON.stringify({ resume_text }, null, 0), 'utf8');
  console.log('Сохранено:', outPathAbs);
  console.log('Символов resume_text:', resume_text.length);
  if (path.resolve(path.dirname(outPathAbs)) === path.resolve(REZUME_RESUME_DIR)) {
    console.log('Файл в папке Rezume/resume/. Запуск аудита: из корня Rezume выполните  python resume/run_audit.py');
  }
}

main();
