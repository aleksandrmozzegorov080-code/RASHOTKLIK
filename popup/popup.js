// Popup UI: кнопки и отображение статуса/аудита. См. ASSEMBLY_PLAN.md модуль 2.

const el = (id) => document.getElementById(id);
const statusEl = el('status');
const auditPreviewEl = el('audit-preview');
const btnDownloadHh = el('btn-download-hh');
const btnSendAi = el('btn-send-ai');
const btnDownload = el('btn-download');

const hasRequiredElements = statusEl && auditPreviewEl && btnSendAi && btnDownload;

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

let lastState = { lastAudit: null, lastAuditTime: null };

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
      const hasAudit = !!lastState.lastAudit;
      setStatus(hasAudit ? 'Есть последний аудит.' : 'Готово к работе.');
      setAuditPreview(hasAudit ? lastState.lastAudit : '');
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

  btnSendAi.addEventListener('click', () => {
    setStatus('Получаю резюме со страницы…');
    btnSendAi.disabled = true;
    
    // Шаг 1: Берём резюме прямо со страницы HH.ru
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url || !tab.url.includes('hh.ru/resume/')) {
        setStatus('Откройте страницу резюме на hh.ru', true);
        btnSendAi.disabled = false;
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, { action: 'extractResume' }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus('Обновите страницу (F5) и попробуйте снова', true);
          btnSendAi.disabled = false;
          return;
        }
        const resume = response?.resume ?? response;
        if (!resume || response?.error) {
          setStatus('Ошибка: ' + (response?.error || 'Не удалось извлечь резюме'), true);
          btnSendAi.disabled = false;
          return;
        }
        
        // Шаг 2: Отправляем резюме на аудит через API
        setStatus('Отправляем в ИИ (DeepSeek)…');
        sendToBackground({ action: 'runAudit', resume: resume })
          .then((res) => {
            if (res && res.error) {
              setStatus('Ошибка: ' + res.error, true);
              return;
            }
            const text = res?.audit ?? res;
            setStatus('✓ Аудит получен.');
            lastState.lastAudit = text;
            lastState.lastAuditTime = res?.timestamp ?? Date.now();
            setAuditPreview(text || '');
          })
          .catch((err) => setStatus('Ошибка: ' + err.message, true))
          .finally(() => { btnSendAi.disabled = false; });
      });
    });
  });

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
