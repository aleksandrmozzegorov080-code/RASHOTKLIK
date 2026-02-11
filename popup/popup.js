// Popup UI: кнопки и отображение статуса/аудита. См. ASSEMBLY_PLAN.md модуль 2.

const el = (id) => document.getElementById(id);
const statusEl = el('status');
const auditPreviewEl = el('audit-preview');
const btnDownloadHh = el('btn-download-hh');
const btnGetResume = el('btn-get-resume');
const btnViewResume = el('btn-view-resume');
const btnSaveResume = el('btn-save-resume');
const btnSaveForAudit = el('btn-save-for-audit');
const btnSendAi = el('btn-send-ai');
const btnDownload = el('btn-download');

const hasRequiredElements = statusEl && auditPreviewEl && btnGetResume && btnSendAi && btnDownload;

/** Скачать файл с диалогом «Сохранить как» (выбор папки и имени). */
function downloadWithSaveAs(blob, suggestedFilename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download(
    { url, filename: suggestedFilename, saveAs: true },
    () => {
      if (chrome.runtime.lastError) setStatus('Ошибка: ' + chrome.runtime.lastError.message, true);
      else setStatus('Выберите папку и имя файла в диалоге.');
    }
  );
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function getTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/T/g, '_').replace(/:/g, '-');
}

/** Преобразовать резюме (формат инструкции fields / API HH / старый basic_info) в один текст. */
function resumeToPlainText(resume) {
  if (!resume) return '';
  const lines = [];
  // Формат инструкции: { source, url, scraped_at, fields: { name, title, city, salary, experience, education, skills, about, other } }
  if (resume.fields) {
    const f = resume.fields;
    if (f.name) lines.push(f.name);
    if (f.title) lines.push('Должность: ' + f.title);
    if (f.city) lines.push('Город: ' + f.city);
    if (f.salary) lines.push('Зарплата: ' + f.salary);
    if (f.experience && f.experience.length > 0) {
      lines.push('', 'Опыт работы:', '');
      f.experience.forEach((exp) => {
        const parts = [exp.company, exp.position, exp.period, exp.description].filter(Boolean);
        lines.push(parts.join(' | '));
      });
    }
    if (f.education && f.education.length > 0) {
      lines.push('', 'Образование:', '');
      f.education.forEach((e) => {
        lines.push([e.institution, e.degree, e.year, e.raw].filter(Boolean).join(' — '));
      });
    }
    if (f.skills && f.skills.length > 0) lines.push('', 'Навыки: ' + f.skills.join(', '));
    if (f.about) lines.push('', 'О себе:', f.about);
    if (f.other && Object.keys(f.other).length) {
      Object.entries(f.other).forEach(([k, v]) => { if (v) lines.push('', k + ': ' + v); });
    }
    if (resume.url) lines.push('', 'Источник: ' + resume.url);
    return lines.join('\n').trim();
  }
  const fromApi = resume && ('first_name' in resume || 'title' in resume) && !resume.basic_info;
  if (fromApi) {
    if (resume.first_name || resume.last_name) lines.push([resume.first_name, resume.last_name].filter(Boolean).join(' '));
    if (resume.title) lines.push('Должность: ' + resume.title);
    if (resume.contacts) {
      const c = resume.contacts;
      if (c.phone) lines.push('Телефон: ' + (typeof c.phone === 'string' ? c.phone : c.phone.number || ''));
      if (c.email) lines.push('Email: ' + (typeof c.email === 'string' ? c.email : c.email.value || ''));
    }
    if (resume.experience && resume.experience.length > 0) {
      lines.push('', 'Опыт работы:', '');
      resume.experience.forEach((exp) => {
        const pos = exp.position || exp.title || '';
        const emp = exp.employer?.name || '';
        const period = exp.start_date && exp.end_date ? `${exp.start_date} — ${exp.end_date}` : '';
        lines.push([pos, emp, period].filter(Boolean).join(' | '));
      });
    }
    const edu = resume.education;
    if (edu && (edu.primary?.length || edu.additional?.length)) {
      lines.push('', 'Образование:', '');
      (edu.primary || []).concat(edu.additional || []).forEach((e) => {
        const name = e.name || e.organization?.name || '';
        const level = e.level?.name || '';
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

let lastState = { lastResume: null, lastAudit: null, lastAuditTime: null };

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = isError ? 'error' : '';
}

function setAuditPreview(text) {
  if (!auditPreviewEl) return;
  auditPreviewEl.textContent = text || '';
}

function sendToBackground(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function loadState() {
  sendToBackground({ action: 'getState' })
    .then((state) => {
      lastState = state || {};
      const hasResume = !!lastState.lastResume;
      const hasAudit = !!lastState.lastAudit;
      setStatus(
        (hasResume ? 'Резюме загружено. ' : 'Резюме не загружено. ') +
          (hasAudit ? 'Есть последний аудит.' : 'Нет аудита.')
      );
      setAuditPreview(hasAudit ? lastState.lastAudit : '');
      if (btnSendAi) btnSendAi.disabled = !hasResume;
    })
    .catch((err) => setStatus('Ошибка: ' + err.message, true));
}

if (hasRequiredElements) {
  if (btnDownloadHh) {
    btnDownloadHh.addEventListener('click', () => {
      setStatus('Скачиваю резюме (TXT)...');
      btnDownloadHh.disabled = true;
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url || !tab.url.includes('hh.ru/resume/')) {
          setStatus('Откройте страницу резюме на hh.ru', true);
          btnDownloadHh.disabled = false;
          return;
        }
        
        // 1. Получаем URL скачивания от content script
        chrome.tabs.sendMessage(tab.id, { action: 'downloadResume', format: 'txt' }, (response) => {
          if (chrome.runtime.lastError) {
            setStatus('Обновите страницу (F5) и попробуйте снова', true);
            btnDownloadHh.disabled = false;
            return;
          }
          if (!response || response.error || !response.downloadUrl) {
            setStatus('Ошибка: ' + (response?.error || 'URL не получен'), true);
            btnDownloadHh.disabled = false;
            return;
          }
          
          // 2. Скачиваем через background с диалогом "Сохранить как"
          const filename = `resume_${getTimestamp()}.txt`;
          sendToBackground({
            action: 'downloadResumeFile',
            url: response.downloadUrl,
            filename: filename,
          }).then((res) => {
            btnDownloadHh.disabled = false;
            if (res && res.error) {
              setStatus('Ошибка: ' + res.error, true);
            } else {
              setStatus('✓ Выберите папку для сохранения');
            }
          }).catch((err) => {
            btnDownloadHh.disabled = false;
            setStatus('Ошибка: ' + err.message, true);
          });
        });
      });
    });
  }

  btnGetResume.addEventListener('click', () => {
    setStatus('Запрос…');
    btnGetResume.disabled = true;
    sendToBackground({ action: 'getResume' })
      .then((res) => {
        if (res && res.error) {
          setStatus('Ошибка: ' + res.error, true);
          return;
        }
        const resume = res?.resume || res;
        lastState.lastResume = resume;
        btnSendAi.disabled = false;
        if (res && res.resume) setAuditPreview('');
        // Показываем, что именно загрузилось (проверка загрузки)
        const fromApi = res?.source === 'api' || (resume && 'first_name' in resume && 'title' in resume);
        const fromFields = resume?.fields;
        let detail;
        if (fromFields) {
          detail = [fromFields.name, fromFields.title, fromFields.city].filter(Boolean).join(' · ') || 'Резюме (формат инструкции)';
        } else if (fromApi) {
          const name = [resume.first_name, resume.last_name].filter(Boolean).join(' ');
          detail = [name, resume.title].filter(Boolean).join(' · ') || 'JSON из API HH';
        } else {
          const name = resume?.basic_info?.name;
          const position = resume?.basic_info?.position;
          const subtitle = resume?.basic_info?.subtitle;
          detail = [name, position, subtitle].filter(Boolean).join(' · ') || 'Данные извлечены';
        }
        setStatus('Резюме загружено: ' + detail);
      })
      .catch((err) => setStatus('Ошибка: ' + err.message, true))
      .finally(() => { btnGetResume.disabled = false; });
  });

  btnSendAi.addEventListener('click', () => {
    setStatus('Отправляем в ИИ…');
    btnSendAi.disabled = true;
    sendToBackground({ action: 'runAudit' })
      .then((res) => {
        if (res && res.error) {
          setStatus('Ошибка: ' + res.error, true);
          return;
        }
        const text = res?.audit ?? res;
        setStatus('Аудит получен.');
        lastState.lastAudit = text;
        lastState.lastAuditTime = res?.timestamp ?? Date.now();
        setAuditPreview(text || '');
      })
      .catch((err) => setStatus('Ошибка: ' + err.message, true))
      .finally(() => { btnSendAi.disabled = false; });
  });

  if (btnViewResume) {
    btnViewResume.addEventListener('click', () => {
      const resume = lastState.lastResume;
      if (!resume) {
        setStatus('Сначала загрузите резюме с HH.ru.', true);
        setAuditPreview('');
        return;
      }
      setStatus('Сохранённое резюме (chrome.storage.local → lastResume):');
      setAuditPreview(JSON.stringify(resume, null, 2));
    });
  }

  if (btnSaveResume) {
    btnSaveResume.addEventListener('click', () => {
      const resume = lastState.lastResume;
      if (!resume) {
        setStatus('Сначала загрузите резюме с HH.ru.', true);
        return;
      }
      const filename = `resume_${getTimestamp()}.json`;
      const blob = new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json;charset=utf-8' });
      downloadWithSaveAs(blob, filename);
    });
  }

  if (btnSaveForAudit) {
    btnSaveForAudit.addEventListener('click', () => {
      const resume = lastState.lastResume;
      if (!resume) {
        setStatus('Сначала загрузите резюме с HH.ru.', true);
        return;
      }
      const resume_text = resumeToPlainText(resume);
      const payload = { resume_text };
      const blob = new Blob([JSON.stringify(payload, null, 0)], { type: 'application/json;charset=utf-8' });
      downloadWithSaveAs(blob, 'resume_for_analysis.json');
      setStatus('Сохранён формат для Rezume/resume (run_audit.py).');
    });
  }

  btnDownload.addEventListener('click', () => {
    const text = lastState.lastAudit;
    if (!text) {
      setStatus('Нет результата для скачивания.', true);
      return;
    }
    const filename = `audit_resume_${getTimestamp()}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadWithSaveAs(blob, filename);
  });

  loadState();
} else if (statusEl) {
  setStatus('Ошибка: не найдены элементы popup. Проверьте разметку.', true);
}
