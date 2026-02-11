// Проверка полноты извлечённого резюме (запуск: node scripts/check-resume-json.js [путь/к/resume.json])
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '../Rezume/resume_2026-02-11_11-57-13.json');
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error('Ошибка чтения файла:', e.message);
  process.exit(1);
}

const checks = [
  ['basic_info.position', !!data.basic_info?.position],
  ['basic_info.name', !!data.basic_info?.name],
  ['basic_info.subtitle', !!data.basic_info?.subtitle],
  ['basic_info.contacts', !!data.basic_info?.contacts],
  ['experience (не пусто)', Array.isArray(data.experience) && data.experience.length > 0],
  ['education (не пусто)', Array.isArray(data.education) && data.education.length > 0],
  ['skills (не пусто)', Array.isArray(data.skills) && data.skills.length > 0],
  ['languages', Array.isArray(data.languages) && data.languages.length > 0],
  ['about', !!data.about],
  ['source_url', !!data.source_url],
  ['extracted_at', !!data.extracted_at],
];

console.log('Проверка:', file);
console.log('---');
checks.forEach(([label, ok]) => console.log(ok ? '[OK]' : '[--]', label));
console.log('---');
const filled = checks.filter(([, ok]) => ok).length;
console.log('Заполнено:', filled, 'из', checks.length);
