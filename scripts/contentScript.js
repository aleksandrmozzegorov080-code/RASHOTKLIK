// Content script (hh.ru): извлекает резюме из DOM в JSON по формату инструкции.
// Формат: { source, url, scraped_at, fields: { name, title, city, salary, experience, education, skills, about, other } }
// Передаёт в background через sendResponse (запрос extractResume) и опционально sendMessage(type: RESUME_EXTRACTED).

const RESUME_URL_PATTERN = /^https?:\/\/([\w.-]*\.)?hh\.ru\/resume\//;
const DEBUG = true; // Включить для отладки в консоль

function log(...args) {
  if (DEBUG) console.log('[RESUME_PARSER]', ...args);
}

function isResumePage() {
  return RESUME_URL_PATTERN.test(document.location.href);
}

function text(el) {
  return el ? el.textContent.trim() : '';
}

function findSectionByHeading(headingTexts) {
  const headings = Array.isArray(headingTexts) ? headingTexts : [headingTexts];
  const all = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  for (const el of all) {
    const t = text(el).toLowerCase();
    const matched = headings.some((h) => t.includes(h.toLowerCase()));
    
    if (matched) {
      log('Found heading:', text(el));
      // Ищем родительский контейнер секции
      let container = el.closest('section') || el.closest('[class*="section"]') || el.closest('[class*="block"]');
      
      if (container && container !== el) {
        const content = text(container);
        // Убираем сам заголовок из контента
        const headingText = text(el);
        const cleanContent = content.replace(headingText, '').trim();
        if (cleanContent) {
          log('Found section content:', cleanContent.substring(0, 100) + '...');
          return cleanContent;
        }
      }
      
      // Fallback: собираем следующие элементы до следующего заголовка
      let next = el.nextElementSibling;
      const parts = [];
      const stopTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
      let count = 0;
      
      while (next && !stopTags.includes(next.tagName) && count < 20) {
        const txt = text(next);
        if (txt && txt.length > 0) parts.push(txt);
        next = next.nextElementSibling;
        count++;
      }
      
      const full = parts.join('\n').trim();
      if (full) {
        log('Found content after heading:', full.substring(0, 100) + '...');
        return full;
      }
    }
  }
  
  log('Section not found for headings:', headings);
  return '';
}

function collectName() {
  log('Collecting name...');
  
  // Сначала пробуем найти h1 - обычно это и есть имя или должность
  const h1 = document.querySelector('h1');
  if (h1) {
    const h1Text = text(h1);
    log('Found h1:', h1Text);
    // Если h1 похоже на имя (короткий текст, 2-4 слова)
    const words = h1Text.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && h1Text.length < 80) {
      return h1Text;
    }
  }
  
  // Пробуем старые селекторы
  const personalEl = document.querySelector('[data-qa="resume-block-personal-info"]') ||
    document.querySelector('.resume-block__personal-info') ||
    document.querySelector('[class*="personal"]');
    
  if (personalEl) {
    const personalText = text(personalEl);
    const namePart = personalText.split(',')[0].trim();
    if (namePart && namePart.length < 80 && namePart.length > 5) {
      log('Found name from personal block:', namePart);
      return namePart;
    }
  }
  
  // Fallback: если h1 существует, возвращаем его независимо от длины
  if (h1) return text(h1);
  
  log('Name not found');
  return '';
}

function collectTitle() {
  log('Collecting title...');
  
  // Пробуем найти по старым селекторам
  const positionEl = document.querySelector('[data-qa="resume-block-title-position"]') ||
    document.querySelector('.resume-block__title-text') ||
    document.querySelector('[class*="position"]');
    
  if (positionEl) {
    const title = text(positionEl);
    log('Found title:', title);
    return title;
  }
  
  // h1 может быть должностью
  const h1 = document.querySelector('h1');
  if (h1) {
    const h1Text = text(h1);
    log('Using h1 as title:', h1Text);
    return h1Text;
  }
  
  log('Title not found');
  return '';
}

function collectCity() {
  log('Collecting city...');
  
  // Ищем текст, который может содержать город
  // Обычно это в начале страницы после имени/должности
  const allText = document.body.textContent;
  
  // Список крупных городов России для pattern matching
  const cities = ['Москва', 'Санкт-Петербург', 'Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 
                  'Нижний Новгород', 'Челябинск', 'Омск', 'Самара', 'Ростов-на-Дону', 'Уфа', 'Красноярск',
                  'Воронеж', 'Пермь', 'Волгоград', 'Краснодар', 'Саратов', 'Тюмень', 'Тольятти'];
  
  for (const city of cities) {
    if (allText.includes(city)) {
      log('Found city:', city);
      return city;
    }
  }
  
  // Пробуем старые селекторы
  const personalEl = document.querySelector('[data-qa="resume-block-personal-info"]') ||
    document.querySelector('.resume-block__personal-info') ||
    document.querySelector('[class*="personal"]') ||
    document.querySelector('[class*="location"]');
    
  if (personalEl) {
    const full = text(personalEl);
    const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
    // Ищем часть, которая похожа на город (не возраст, не цифры)
    for (let i = 0; i < Math.min(parts.length, 3); i++) {
      const p = parts[i];
      if (p && p.length >= 3 && p.length < 50 && !/^\d+\s*лет?$/i.test(p) && !/^\d+$/.test(p) && !/₽|руб/i.test(p)) {
        log('Found city from personal block:', p);
        return p;
      }
    }
  }
  
  log('City not found');
  return '';
}

function collectSalary() {
  log('Collecting salary...');
  
  // Ищем текст с рублями или зарплатой
  const salaryEl = document.querySelector('[data-qa="resume-block-salary"]') ||
    document.querySelector('.resume-block__salary') ||
    Array.from(document.querySelectorAll('*')).find((el) => {
      const t = text(el);
      return t.length < 100 && (t.includes('₽') || t.includes('руб')) && /\d{2,}/.test(t);
    });
    
  if (salaryEl) {
    const salary = text(salaryEl);
    log('Found salary:', salary);
    return salary;
  }
  
  const byHeading = findSectionByHeading(['Зарплата', 'Salary', 'Желаемая зарплата']);
  if (byHeading) {
    log('Found salary from heading:', byHeading);
    return byHeading;
  }
  
  log('Salary not found');
  return '';
}

function collectExperience() {
  const items = [];
  log('Collecting experience...');
  
  // Ищем заголовок "Опыт работы"
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const expHeading = headings.find((h) => {
    const t = text(h).toLowerCase();
    return t.includes('опыт работы') || (t.includes('опыт') && t.includes('лет')) || t.includes('experience');
  });
  
  if (!expHeading) {
    log('Experience heading not found');
    return items;
  }
  
  log('Found experience heading:', text(expHeading));
  
  // Находим секцию после заголовка "Опыт работы"
  let section = expHeading.parentElement;
  
  // Поднимаемся выше, пока не найдём большую секцию
  while (section && section !== document.body) {
    const sectionText = text(section);
    // Если секция содержит много текста (вероятно весь опыт), останавливаемся
    if (sectionText.length > 500) break;
    section = section.parentElement;
  }
  
  if (!section || section === document.body) {
    log('Experience section container not found');
    return items;
  }
  
  log('Found experience section, length:', text(section).length);
  
  // Стратегия: ищем все подзаголовки внутри секции (это отдельные позиции)
  // На HH.ru обычно название компании/проекта идёт отдельным блоком
  const allInnerElements = section.querySelectorAll('*');
  let currentItem = null;
  let collectingText = [];
  
  for (const el of allInnerElements) {
    const tagName = el.tagName;
    const elementText = el.textContent?.trim() || '';
    
    // Пропускаем пустые и очень короткие элементы
    if (!elementText || elementText.length < 3) continue;
    
    // Если это заголовок следующей секции (Навыки, Образование и т.д.), останавливаемся
    if (['H1', 'H2', 'H3', 'H4'].includes(tagName)) {
      const lowerText = elementText.toLowerCase();
      if (lowerText.includes('навык') || lowerText.includes('образование') || 
          lowerText.includes('о себе') || lowerText.includes('skill') ||
          (lowerText.includes('опыт') && lowerText.includes('лет'))) {
        break;
      }
    }
    
    // Ищем блоки с названием компании/проекта (обычно жирный текст или div с классом)
    const hasExperienceMarker = el.className && (
      el.className.includes('experience') ||
      el.className.includes('item') ||
      el.className.includes('Item') ||
      el.className.includes('block')
    );
    
    // Определяем новую запись: если элемент содержит годы/месяцы в тексте
    const hasDatePattern = /\d{4}|год|месяц|лет/i.test(elementText);
    const isLikelyJobTitle = elementText.length > 10 && elementText.length < 200 && hasDatePattern;
    
    if (isLikelyJobTitle || hasExperienceMarker) {
      // Сохраняем предыдущую запись
      if (currentItem && collectingText.length > 0) {
        currentItem.description = collectingText.join('\n');
        items.push(currentItem);
        collectingText = [];
      }
      
      // Начинаем новую запись
      currentItem = {
        raw: elementText,
        position: undefined,
        company: undefined,
        period: undefined,
        description: undefined
      };
      
      collectingText.push(elementText);
    } else if (currentItem) {
      // Добавляем текст к текущей записи
      collectingText.push(elementText);
    }
  }
  
  // Сохраняем последнюю запись
  if (currentItem && collectingText.length > 0) {
    currentItem.description = collectingText.join('\n');
    items.push(currentItem);
  }
  
  // Если ничего не нашли структурированно, берём весь текст как одну запись
  if (items.length === 0) {
    const fullText = text(section);
    if (fullText && fullText.length > 100) {
      log('Using fallback: entire section as one item');
      items.push({ description: fullText });
    }
  }
  
  log('Collected experience items:', items.length);
  return items;
}

function collectEducation() {
  const items = [];
  log('Collecting education...');
  
  // Ищем заголовок "Образование"
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const eduHeading = headings.find((h) => {
    const t = text(h).toLowerCase();
    return t === 'образование' || t === 'education' || t.startsWith('образование');
  });
  
  if (!eduHeading) {
    log('Education heading not found');
    return items;
  }
  
  log('Found education heading:', text(eduHeading));
  
  // Находим секцию после заголовка
  let section = eduHeading.parentElement;
  
  // Поднимаемся выше для захвата всей секции
  let attempts = 0;
  while (section && section !== document.body && attempts < 5) {
    const sectionText = text(section);
    // Если секция содержит достаточно текста, останавливаемся
    if (sectionText.length > 200 || section.querySelectorAll('*').length > 10) break;
    section = section.parentElement;
    attempts++;
  }
  
  if (!section || section === document.body) {
    log('Education section container not found');
    return items;
  }
  
  log('Found education section');
  
  // Собираем весь текст секции до следующего заголовка
  const sectionStart = eduHeading;
  let nextHeading = null;
  
  // Ищем следующий h4 заголовок (обычно это следующая секция)
  const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const currentIndex = allHeadings.indexOf(eduHeading);
  if (currentIndex !== -1 && currentIndex < allHeadings.length - 1) {
    nextHeading = allHeadings[currentIndex + 1];
  }
  
  // Собираем все элементы между заголовком образования и следующим заголовком
  const allElements = Array.from(document.body.querySelectorAll('*'));
  const startIdx = allElements.indexOf(sectionStart);
  const endIdx = nextHeading ? allElements.indexOf(nextHeading) : allElements.length;
  
  if (startIdx !== -1) {
    const educationElements = allElements.slice(startIdx + 1, endIdx);
    const eduTexts = educationElements
      .map(el => text(el))
      .filter(t => t && t.length > 5 && t.length < 500)
      .filter((t, idx, arr) => arr.indexOf(t) === idx); // уникальные
    
    if (eduTexts.length > 0) {
      // Пробуем найти отдельные записи по ключевым словам
      const combined = eduTexts.join('\n');
      const lines = combined.split('\n').map(l => l.trim()).filter(Boolean);
      
      let currentEdu = null;
      let currentTexts = [];
      
      for (const line of lines) {
        // Ключевые слова для определения нового учебного заведения
        const isNewInstitution = (
          /универс|институт|колледж|школа|академ|university|institute|college/i.test(line) &&
          line.length > 10 && line.length < 150
        );
        
        if (isNewInstitution) {
          // Сохраняем предыдущую запись
          if (currentEdu && currentTexts.length > 0) {
            currentEdu.raw = currentTexts.join('\n');
            items.push(currentEdu);
          }
          
          // Новая запись
          currentEdu = {
            institution: line,
            degree: undefined,
            year: undefined,
            raw: line
          };
          currentTexts = [line];
        } else if (currentEdu) {
          currentTexts.push(line);
          
          // Пытаемся извлечь год
          const yearMatch = line.match(/\b(19|20)\d{2}\b/);
          if (yearMatch && !currentEdu.year) {
            currentEdu.year = yearMatch[0];
          }
        }
      }
      
      // Сохраняем последнюю запись
      if (currentEdu && currentTexts.length > 0) {
        currentEdu.raw = currentTexts.join('\n');
        items.push(currentEdu);
      }
      
      // Fallback: если не удалось разбить, берём весь текст как одну запись
      if (items.length === 0 && combined.length > 20) {
        items.push({ raw: combined });
      }
    }
  }
  
  log('Collected education items:', items.length);
  return items;
}

function collectSkills() {
  log('Collecting skills...');
  
  // Ищем заголовок навыков
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const skillsHeading = headings.find((h) => {
    const t = text(h).toLowerCase();
    return t.includes('навык') || t.includes('skill') || t.includes('ключевые');
  });
  
  let section = null;
  
  if (skillsHeading) {
    log('Found skills heading:', text(skillsHeading));
    section = skillsHeading.closest('section') || skillsHeading.closest('[class*="section"]') || skillsHeading.closest('[class*="block"]');
  }
  
  // Fallback: ищем по старым селекторам
  if (!section) {
    section = document.querySelector('[data-qa="resume-block-skills"]') ||
      document.querySelector('.resume-block__skills') ||
      document.querySelector('[class*="skills"]') ||
      Array.from(document.querySelectorAll('section, [class*="block"]')).find((el) => {
        const t = text(el).toLowerCase();
        return t.includes('навык') || t.includes('skill');
      });
  }
  
  if (!section) {
    log('Skills section not found, trying heading fallback');
    const raw = findSectionByHeading(['Ключевые навыки', 'Навыки', 'Skills']);
    if (raw) {
      const skills = raw.split(/[,;\n]\s*/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 100);
      log('Found skills from heading:', skills.length);
      return skills;
    }
    log('Skills not found');
    return [];
  }
  
  log('Found skills section');
  
  // Ищем теги/бейджи навыков (обычно span или button элементы)
  const tags = section.querySelectorAll('span, button, [class*="tag"], [class*="Tag"], [class*="badge"], [class*="Badge"], [class*="chip"], [class*="Chip"]');
  const list = [];
  
  tags.forEach((t) => {
    const s = text(t);
    // Фильтруем: только короткие тексты (вероятно навыки), не кнопки действий
    if (s && s.length > 2 && s.length < 100 && !s.includes('Посмотреть') && !s.includes('Редактировать')) {
      list.push(s);
    }
  });
  
  if (list.length > 0) {
    log('Found', list.length, 'skill tags');
    return [...new Set(list)];
  }
  
  // Fallback: парсим текст секции как список через запятую
  const raw = text(section);
  if (raw) {
    log('Using fallback: parsing section text');
    const skills = raw.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 100);
    return [...new Set(skills)];
  }
  
  log('No skills found');
  return [];
}

function collectAbout() {
  log('Collecting about...');
  
  // Ищем заголовок "О себе"
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const aboutHeading = headings.find((h) => {
    const t = text(h).toLowerCase();
    return t === 'о себе' || t === 'about' || t.startsWith('о себе');
  });
  
  if (!aboutHeading) {
    log('About heading not found');
    return '';
  }
  
  log('Found about heading:', text(aboutHeading));
  
  // Ищем следующий заголовок той же или более высокого уровня
  const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const currentIndex = allHeadings.indexOf(aboutHeading);
  let nextHeading = null;
  
  if (currentIndex !== -1 && currentIndex < allHeadings.length - 1) {
    nextHeading = allHeadings[currentIndex + 1];
  }
  
  // Собираем весь текст между заголовками
  const allElements = Array.from(document.body.querySelectorAll('*'));
  const startIdx = allElements.indexOf(aboutHeading);
  const endIdx = nextHeading ? allElements.indexOf(nextHeading) : allElements.length;
  
  if (startIdx === -1) {
    log('Could not find about heading in elements');
    return '';
  }
  
  const aboutElements = allElements.slice(startIdx + 1, endIdx);
  const aboutTexts = aboutElements
    .map(el => {
      const t = text(el);
      // Фильтруем: только параграфы и блоки с текстом
      return t && t.length > 20 && t.length < 2000 ? t : null;
    })
    .filter(Boolean)
    .filter((t, idx, arr) => {
      // Убираем дубликаты (часто один текст содержится в другом)
      return !arr.some((other, otherIdx) => otherIdx !== idx && other.includes(t) && other.length > t.length);
    });
  
  const aboutText = aboutTexts.join('\n\n').trim();
  
  log('About section length:', aboutText.length);
  log('About section preview:', aboutText ? aboutText.substring(0, 100) + '...' : 'empty');
  
  return aboutText || '';
}

function collectOther() {
  const other = {};
  const contactSection = document.querySelector('[data-qa="resume-block-contact"]') ||
    document.querySelector('.resume-block__contact') ||
    document.querySelector('[class*="contact"]');
  if (contactSection) other.contacts = text(contactSection);
  const languages = document.querySelector('[data-qa="resume-block-languages"]') ||
    document.querySelector('.resume-block__languages') ||
    document.querySelector('[class*="languages"]');
  if (languages) other.languages = text(languages);
  if (!Object.keys(other).length) return undefined;
  return other;
}

/** Собрать полное резюме в формате инструкции для backend/ИИ. */
function extractResume(includeRawHtml = false) {
  if (!isResumePage()) {
    return { error: 'Это не страница просмотра резюме. Откройте резюме на hh.ru (например /resume/...).' };
  }

  log('=== Starting resume extraction ===');
  log('URL:', window.location.href);

  const resume = {
    source: 'hh.ru',
    url: window.location.href,
    scraped_at: new Date().toISOString(),
    fields: {
      name: collectName(),
      title: collectTitle(),
      city: collectCity(),
      salary: collectSalary(),
      experience: collectExperience(),
      education: collectEducation(),
      skills: collectSkills(),
      about: collectAbout(),
      other: collectOther(),
    },
  };
  
  if (includeRawHtml) resume.raw_html = document.documentElement.outerHTML;

  log('=== Extraction results ===');
  log('Name:', resume.fields.name);
  log('Title:', resume.fields.title);
  log('City:', resume.fields.city);
  log('Salary:', resume.fields.salary);
  log('Experience items:', resume.fields.experience.length);
  log('Education items:', resume.fields.education.length);
  log('Skills count:', resume.fields.skills.length);
  log('About length:', resume.fields.about?.length || 0);
  log('Other fields:', resume.fields.other ? Object.keys(resume.fields.other) : 'none');

  const f = resume.fields;
  const hasAny = f.name || f.title || f.city || f.salary ||
    (f.experience && f.experience.length > 0) ||
    (f.education && f.education.length > 0) ||
    (f.skills && f.skills.length > 0) ||
    f.about ||
    (f.other && Object.keys(f.other).length > 0);

  if (!hasAny) {
    log('ERROR: No data extracted!');
    return { error: 'Не удалось извлечь данные резюме. Возможно, изменилась вёрстка hh.ru или страница ещё не загрузилась. Обновите страницу (F5) и попробуйте снова.' };
  }

  log('=== Extraction successful ===');
  return { resume };
}

// === MESSAGE LISTENER ===
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'extractResume') {
    try {
      const includeRawHtml = !!msg.includeRawHtml;
      const result = extractResume(includeRawHtml);
      if (result.resume) {
        chrome.runtime.sendMessage({ type: 'RESUME_EXTRACTED', payload: result.resume }).catch(() => {});
      }
      sendResponse(result);
    } catch (e) {
      sendResponse({ error: e.message || 'Ошибка парсинга резюме.' });
    }
  }
  
  if (msg.action === 'downloadResume') {
    const format = msg.format || 'pdf';
    log('📥 Ищу ссылку для скачивания резюме в формате:', format);
    
    // Шаг 0: Проверяем что это страница резюме
    if (!window.location.href.match(/\/resume\//i)) {
      sendResponse({ error: 'Это не страница резюме на HH.ru' });
      return true;
    }

    // --- Способ 1: Поиск ссылки на скачивание уже в DOM ---
    function findDownloadLink() {
      // Ищем все ссылки <a> с href содержащим resume_converter или /resume-pdf
      const allLinks = document.querySelectorAll('a[href*="resume_converter"], a[href*="resume-pdf"], a[href*="resume/download"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        const text = (link.textContent || '').toLowerCase();
        // PDF
        if (format === 'pdf' && (text.includes('pdf') || text.includes('adobe') || href.includes('.pdf') || href.includes('type=pdf'))) {
          return link.href; // полный абсолютный URL
        }
        if (format === 'doc' && (text.includes('doc') || text.includes('word') || href.includes('.doc') || href.includes('type=doc'))) {
          return link.href;
        }
        if (format === 'rtf' && (text.includes('rtf') || href.includes('.rtf') || href.includes('type=rtf'))) {
          return link.href;
        }
        if (format === 'txt' && (text.includes('txt') || text.includes('простой') || text.includes('текст') || href.includes('.txt') || href.includes('type=txt'))) {
          return link.href;
        }
        if (format === 'htm' && href.includes('resume_converter')) {
          return link.href;
        }
      }
      // Если формат не важен — берём первую ссылку resume_converter
      if (allLinks.length > 0) {
        return allLinks[0].href;
      }
      return null;
    }

    // Проверяем, может ссылка уже видна
    let url = findDownloadLink();
    if (url) {
      log('✓ Найдена ссылка (DOM):', url);
      sendResponse({ success: true, downloadUrl: url });
      return true;
    }

    // --- Способ 2: Кликаем кнопку скачивания, ждём выпадающее меню ---
    const downloadBtn = document.querySelector('[data-qa="resume-download-button"]') 
      || document.querySelector('button[data-qa*="download"]')
      || document.querySelector('[class*="download"] button');
    
    if (!downloadBtn) {
      // --- Способ 3: Строим URL вручную ---
      const match = window.location.href.match(/\/resume\/([a-f0-9]+)/i);
      if (match) {
        const resumeHash = match[1];
        const host = window.location.hostname;
        const typeParam = format === 'htm' ? '' : `?type=${format}`;
        const fallbackUrl = `https://${host}/resume_converter/${resumeHash}${typeParam}`;
        log('⚠ Кнопка не найдена, пробую URL:', fallbackUrl);
        sendResponse({ success: true, downloadUrl: fallbackUrl });
      } else {
        sendResponse({ error: 'Кнопка скачивания не найдена и невозможно определить ID резюме.' });
      }
      return true;
    }
    
    // Кликаем кнопку — появится выпадающее меню
    downloadBtn.click();
    log('Кликнул кнопку скачивания, жду меню...');
    
    let attempts = 0;
    const maxAttempts = 15;
    
    const tryFindLink = () => {
      attempts++;
      
      // Ищем ссылки после появления меню
      url = findDownloadLink();
      if (url) {
        log('✓ Найдена ссылка (после клика):', url);
        // Закрываем меню — кликаем в пустое место
        document.body.click();
        sendResponse({ success: true, downloadUrl: url });
        return;
      }
      
      // Ищем также по тексту кнопок/ссылок в меню
      const menuItems = document.querySelectorAll('[data-qa*="download"] a, [class*="dropdown"] a, [class*="menu"] a, [role="menu"] a, [role="listbox"] a');
      for (const item of menuItems) {
        const href = item.getAttribute('href') || '';
        const text = (item.textContent || '').toLowerCase();
        if (href && (href.includes('resume_converter') || href.includes('resume-pdf') || href.includes('resume/download'))) {
          const isMatch =
            (format === 'pdf' && (text.includes('pdf') || text.includes('adobe'))) ||
            (format === 'doc' && (text.includes('doc') || text.includes('word'))) ||
            (format === 'rtf' && text.includes('rtf')) ||
            (format === 'txt' && (text.includes('txt') || text.includes('простой') || text.includes('текст')));
          if (isMatch) {
            log('✓ Найдена ссылка (меню):', item.href);
            document.body.click();
            sendResponse({ success: true, downloadUrl: item.href });
            return;
          }
        }
      }
      
      if (attempts < maxAttempts) {
        setTimeout(tryFindLink, 300);
      } else {
        // Не нашли — используем fallback URL
        const match = window.location.href.match(/\/resume\/([a-f0-9]+)/i);
        if (match) {
          const resumeHash = match[1];
          const host = window.location.hostname;
          const typeParam = format === 'htm' ? '' : `?type=${format}`;
          const fallbackUrl = `https://${host}/resume_converter/${resumeHash}${typeParam}`;
          log('⚠ Меню не появилось, пробую URL:', fallbackUrl);
          document.body.click();
          sendResponse({ success: true, downloadUrl: fallbackUrl });
        } else {
          document.body.click();
          sendResponse({ error: 'Не удалось найти ссылку для скачивания.' });
        }
      }
    };
    
    setTimeout(tryFindLink, 500);
    return true;
  }
  
  return true;
});
