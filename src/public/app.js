let state = {
  profile: null,
  jobs: [],
  settings: null,
  agentPrompts: [],
  activeJobId: null,
  activeLang: 'pt-BR',
  seniorityFilter: 'all',
  workMode: 'remoto_br',
  activeAgentSlug: 'cv-adapter.md'
};

const WORK_MODE_LOCATIONS = {
  remoto_br: { pt: 'Brasil (100% Remoto)', en: 'Brazil (100% Remote)' },
  remoto_global: { pt: 'Global / LatAm (100% Remoto)', en: 'Remote - Worldwide / LatAm' },
  hibrido_sp: { pt: 'Brasil (Híbrido / Presencial)', en: 'Brazil (Hybrid / On-site)' }
};

const SENIORITY_LABELS = {
  estagio: 'Estágio / Trainee',
  junior: 'Júnior',
  junior_pleno: 'Júnior / Pleno',
  pleno: 'Pleno',
  senior: 'Sênior',
  especialista: 'Especialista / Staff'
};

function escapeHtmlClient(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer = null;
let initialBrowserThemeApplied = false;

function showToast(msg) {
  const banner = document.getElementById('toast-banner');
  const textEl = document.getElementById('toast-banner-text');
  if (textEl) {
    textEl.textContent = msg;
  } else {
    banner.textContent = msg;
  }
  banner.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => banner.classList.add('hidden'), 2600);
}

document.getElementById('toast-banner').addEventListener('click', () => {
  document.getElementById('toast-banner').classList.add('hidden');
});

function applyTheme(themeMode) {
  const resolved =
    themeMode === 'light' || themeMode === 'dark'
      ? themeMode
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  document.documentElement.setAttribute('data-theme', resolved);
  const isDark = resolved === 'dark';
  const sw = document.getElementById('btn-theme-toggle');
  if (sw) {
    sw.setAttribute('aria-checked', isDark ? 'true' : 'false');
    const iconEl = sw.querySelector('.dn-thumb-icon');
    if (iconEl) iconEl.textContent = isDark ? '🌙' : '☀️';
  }
}

async function toggleDayNightSwitch() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: next })
  });
}

async function loadBootstrap() {
  const res = await fetch('/api/bootstrap');
  const data = await res.json();
  state.profile = data.profile;
  state.jobs = data.jobs;
  state.settings = data.settings;
  state.agentPrompts = data.agentPrompts || [];

  // Auto mode runs ONLY when the user first opens the site, setting the mode according to the browser's current scheme
  if (!initialBrowserThemeApplied) {
    initialBrowserThemeApplied = true;
    const browserPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(browserPrefersLight ? 'light' : 'dark');
  }

  renderHeader();
  renderKanban();
}

function renderHeader() {
  if (!state.profile) return;
  const allOpt = document.querySelector('#filter-seniority option[value="all"]');
  if (allOpt) {
    allOpt.textContent = 'Todas';
  }
  const loc = (state.profile.locationPt || '').toLowerCase();
  if (loc.includes('global') || loc.includes('latam') || loc.includes('worldwide')) {
    state.workMode = 'remoto_global';
  } else if (loc.includes('híbrido') || loc.includes('hibrido') || loc.includes('presencial')) {
    state.workMode = 'hibrido_sp';
  } else {
    state.workMode = 'remoto_br';
  }
  const workModeEl = document.getElementById('select-work-mode');
  if (workModeEl) {
    workModeEl.value = state.workMode;
  }
}

// Day & Night On/Off Switch button (Landing Page only)
const themeBtnEl = document.getElementById('btn-theme-toggle');
if (themeBtnEl) themeBtnEl.addEventListener('click', toggleDayNightSwitch);

// Global ESC key handler to close any open popup/modal
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.getElementById('toast-banner')?.classList.add('hidden');

  const miniModals = [
    'scrape-confirm-modal-backdrop',
    'skill-edit-modal-backdrop',
    'cert-edit-modal-backdrop',
    'edu-edit-modal-backdrop',
    'proj-edit-modal-backdrop',
    'exp-edit-modal-backdrop'
  ];
  for (const id of miniModals) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
      return;
    }
  }

  const mainModals = [
    'job-modal-backdrop',
    'profile-modal-backdrop',
    'settings-modal-backdrop',
    'ingest-modal-backdrop'
  ];
  for (const id of mainModals) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
      return;
    }
  }
});

// Unified Seniority dropdown (filters Kanban & sets scrape seniority)
document.getElementById('filter-seniority').addEventListener('change', (e) => {
  state.seniorityFilter = e.target.value;
  renderKanban();
});

// Localização / Modalidade dropdown (outside Profile, next to Seniority)
document.getElementById('select-work-mode').addEventListener('change', async (e) => {
  state.workMode = e.target.value;
  const mapped = WORK_MODE_LOCATIONS[state.workMode] || WORK_MODE_LOCATIONS.remoto_br;
  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileInfo: {
        locationPt: mapped.pt,
        locationEn: mapped.en
      }
    })
  });
  await loadBootstrap();
  showToast(`Localização / Modalidade alterada para: ${mapped.pt}`);
});

// Kanban Render + Native Drag and Drop
function renderKanban() {
  const cols = ['abertas', 'em_processo', 'sem_sucesso', 'ruins'];
  const filteredJobs = state.jobs.filter(
    (j) => state.seniorityFilter === 'all' || j.seniority === state.seniorityFilter
  );

  for (const col of cols) {
    const container = document.getElementById(`col-${col}`);
    const list = filteredJobs.filter((j) => j.status === col);
    document.getElementById(`count-${col}`).textContent = String(list.length);
    container.innerHTML = '';

    for (const job of list) {
      const card = document.createElement('div');
      card.className = 'job-card';
      card.setAttribute('draggable', 'true');
      card.dataset.jobId = String(job.id);

      card.addEventListener('dragstart', (ev) => {
        card.classList.add('dragging');
        ev.dataTransfer.setData('text/plain', String(job.id));
        ev.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.kanban-col').forEach((c) => c.classList.remove('drag-over'));
      });

      card.addEventListener('click', () => openJobModal(job.id));

      let recruiterBadge = '';
      if (job.recruiterStatus === 'aguardando_aceite') {
        recruiterBadge = `<div class="recruiter-alert-badge">⏳ Conexão Enviada (${escapeHtmlClient(job.recruiterName || 'Recruiter')}) — Mandar DM quando aceitar!</div>`;
      } else if (job.recruiterStatus === 'dm_enviada') {
        recruiterBadge = `<div class="recruiter-done-badge">✅ DM Completa Enviada (${escapeHtmlClient(job.recruiterName || 'Recruiter')})</div>`;
      }

      const seniorityLabel = SENIORITY_LABELS[job.seniority] || 'Júnior / Pleno';

      card.innerHTML = `
        <div class="job-card-top">
          <div class="job-card-title">${escapeHtmlClient(job.title)}</div>
          <span class="score-pill">${Number(job.matchScore)}% Match</span>
        </div>
        <div class="job-card-meta">
          <strong>${escapeHtmlClient(job.company)}</strong> •
          <span>${escapeHtmlClient(job.platform)}</span> •
          <span class="seniority-tag">${escapeHtmlClient(seniorityLabel)}</span>
        </div>
        <div class="job-card-meta">
          <span>${escapeHtmlClient(job.location)}</span> •
          <span>${job.language === 'en' ? '🇺🇸 EN' : '🇧🇷 PT'}</span>
        </div>
        ${recruiterBadge}
      `;
      container.appendChild(card);
    }
  }
}

// Setup column drop zones once
document.querySelectorAll('.kanban-col').forEach((colEl) => {
  const targetStatus = colEl.dataset.status;

  colEl.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    colEl.classList.add('drag-over');
  });

  colEl.addEventListener('dragleave', () => {
    colEl.classList.remove('drag-over');
  });

  colEl.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    colEl.classList.remove('drag-over');
    const jobId = Number(ev.dataTransfer.getData('text/plain'));
    if (!jobId || !targetStatus) return;

    const job = state.jobs.find((j) => j.id === jobId);
    if (!job || job.status === targetStatus) return;

    await fetch(`/api/jobs/${jobId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: targetStatus,
        reason: targetStatus === 'ruins' ? 'Arrastada para Vagas Ruins no Kanban' : ''
      })
    });
    await loadBootstrap();
    showToast(
      targetStatus === 'ruins'
        ? 'Vaga movida para Vagas Ruins — o filtro aprendeu seu gosto!'
        : `Vaga movida para "${targetStatus}"!`
    );
  });
});

// Job Detail Popup
async function openJobModal(jobId, forcedLang) {
  state.activeJobId = jobId;
  const langQuery = forcedLang ? `?lang=${encodeURIComponent(forcedLang)}` : '';
  const res = await fetch(`/api/jobs/${jobId}/detail${langQuery}`);
  const detail = await res.json();
  const { job, analysis, tailoredCv, recruiterMessages } = detail;
  state.activeLang = tailoredCv.language;

  document.getElementById('modal-job-title').textContent = job.title;
  document.getElementById('modal-job-score').textContent = `${analysis.matchScore}% Match`;
  document.getElementById('modal-job-platform').textContent = job.platform;
  document.getElementById('modal-job-company').textContent = job.company;
  document.getElementById('modal-job-location').textContent = job.location;
  document.getElementById('modal-job-seniority').value = job.seniority || 'junior_pleno';
  document.getElementById('modal-job-url').href = job.url;

  document.getElementById('btn-lang-pt').classList.toggle('active', state.activeLang === 'pt-BR');
  document.getElementById('btn-lang-en').classList.toggle('active', state.activeLang === 'en');

  const alertsEl = document.getElementById('modal-preference-alerts');
  if (analysis.preferenceAlerts && analysis.preferenceAlerts.length > 0) {
    alertsEl.innerHTML = analysis.preferenceAlerts.map(escapeHtmlClient).join('<br/>');
    alertsEl.classList.remove('hidden');
  } else {
    alertsEl.classList.add('hidden');
  }

  document.getElementById('modal-highlighted-description').innerHTML = analysis.highlightedHtml;

  // Tab 1: CV + Relevant Personal Projects
  const adjustments = [...(tailoredCv.honestAdjustmentsMade || [])];
  if (tailoredCv.relevantProjects && tailoredCv.relevantProjects.length > 0) {
    adjustments.push(
      `Projeto(s) pessoal(is) incluído(s) por relevância com a vaga: ${tailoredCv.relevantProjects.map((p) => p.name).join(', ')}`
    );
  }
  document.getElementById('modal-cv-adjustments').innerHTML = adjustments
    .map((a) => `<li>${escapeHtmlClient(a)}</li>`)
    .join('');

  document.getElementById('modal-cv-summary').value = tailoredCv.summary;
  document.getElementById('modal-cv-bullets').innerHTML = tailoredCv.experienceBullets
    .map((b) => `<li>${escapeHtmlClient(b)}</li>`)
    .join('');

  // Tab 2: Gupy Mode
  document.getElementById('modal-gupy-apresentese').value = tailoredCv.gupyKit.apresenteseText;
  document.getElementById('modal-gupy-summary').value = tailoredCv.gupyKit.profileSummaryToUpdate;
  document.getElementById('modal-gupy-tags').innerHTML = tailoredCv.gupyKit.skillsTagsToAdd
    .map((t) => `<span class="tag-chip">${escapeHtmlClient(t)}</span>`)
    .join('');

  if (job.platform.toLowerCase() === 'gupy') {
    activateJobSubtab('tab-gupy');
  } else {
    activateJobSubtab('tab-cv');
  }

  // Tab 3: Tech Recruiter
  document.getElementById('input-recruiter-name').value = job.recruiterName || '';
  document.getElementById('select-recruiter-status').value = job.recruiterStatus || 'nao_enviado';
  document.getElementById('btn-find-recruiter-linkedin').href = recruiterMessages.linkedinSearchUrl;
  document.getElementById('modal-recruiter-invite').value = recruiterMessages.inviteNote;
  document.getElementById('modal-invite-counter').textContent = `${recruiterMessages.inviteCharCount}/200c`;
  document.getElementById('modal-recruiter-dm').value = recruiterMessages.postAcceptDm;

  document.getElementById('btn-download-pdf').href = `/api/jobs/${job.id}/cv.pdf?lang=${encodeURIComponent(state.activeLang)}`;
  document.getElementById('modal-apply-log').classList.add('hidden');
  document.getElementById('job-modal-backdrop').classList.remove('hidden');
}

function activateJobSubtab(tabId) {
  document.querySelectorAll('#job-modal-backdrop .subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  ['tab-cv', 'tab-gupy', 'tab-recruiter'].forEach((id) => {
    document.getElementById(id).classList.toggle('hidden', id !== tabId);
  });
}

document.querySelectorAll('#job-modal-backdrop .subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateJobSubtab(btn.dataset.tab));
});

document.getElementById('modal-job-seniority').addEventListener('change', async (e) => {
  if (!state.activeJobId) return;
  await fetch(`/api/jobs/${state.activeJobId}/seniority`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seniority: e.target.value })
  });
  await loadBootstrap();
  showToast('Senioridade da vaga atualizada!');
});

document.getElementById('btn-lang-pt').addEventListener('click', () => {
  if (state.activeJobId) openJobModal(state.activeJobId, 'pt-BR');
});
document.getElementById('btn-lang-en').addEventListener('click', () => {
  if (state.activeJobId) openJobModal(state.activeJobId, 'en');
});
document.getElementById('btn-close-job-modal').addEventListener('click', () => {
  document.getElementById('job-modal-backdrop').classList.add('hidden');
});

document.querySelectorAll('[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (target) {
      await navigator.clipboard.writeText(target.value);
      showToast('Texto copiado para a área de transferência!');
    }
  });
});

document.querySelectorAll('[data-move]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!state.activeJobId) return;
    const status = btn.dataset.move;
    const reason = status === 'ruins' ? 'Descartada pelo usuário no popup' : '';
    await fetch(`/api/jobs/${state.activeJobId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, reason })
    });
    await loadBootstrap();
    document.getElementById('job-modal-backdrop').classList.add('hidden');
    showToast(status === 'ruins' ? 'Vaga movida para Vagas Ruins — o filtro aprendeu seu gosto!' : `Vaga movida para ${status}!`);
  });
});

document.getElementById('btn-save-recruiter').addEventListener('click', async () => {
  if (!state.activeJobId) return;
  const recruiterName = document.getElementById('input-recruiter-name').value;
  const recruiterStatus = document.getElementById('select-recruiter-status').value;
  await fetch(`/api/jobs/${state.activeJobId}/recruiter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recruiterName, recruiterStatus })
  });
  await loadBootstrap();
  showToast('Status da conexão com Tech Recruiter salvo no Kanban!');
});

document.getElementById('btn-auto-apply').addEventListener('click', async () => {
  if (!state.activeJobId) return;
  const job = state.jobs.find((j) => j.id === state.activeJobId);

  // 1. Open the original job site in a new tab
  if (job && job.url) {
    window.open(job.url, '_blank', 'noopener');
  }

  // 2. Trigger automatic download of the tailored ATS PDF CV
  const pdfUrl = `/api/jobs/${state.activeJobId}/cv.pdf?lang=${encodeURIComponent(state.activeLang)}`;
  const dlLink = document.createElement('a');
  dlLink.href = pdfUrl;
  dlLink.setAttribute('download', `CV-${(job?.company || 'Vaga').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
  document.body.appendChild(dlLink);
  dlLink.click();
  document.body.removeChild(dlLink);

  // 3. Move the job card to "em_processo"
  await fetch(`/api/jobs/${state.activeJobId}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'em_processo', reason: '' })
  });

  await loadBootstrap();
  document.getElementById('job-modal-backdrop').classList.add('hidden');
  showToast('Site da vaga aberto, CV ajustado baixado e card movido para "Em Processo"!');
});

let hasConfirmedFirstSearch = false;

async function executeJobScrape() {
  const btn = document.getElementById('btn-scrape');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Buscando Vagas...';
  showToast('Buscando vagas reais com base no seu Título Profissional, Senioridade e Localização/Modalidade...');
  try {
    const res = await fetch('/api/jobs/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        seniorityFilter: state.seniorityFilter,
        workMode: state.workMode
      })
    });
    const data = await res.json();
    await loadBootstrap();
    showToast(`Busca concluída! ${data.added || 0} novas vagas adicionadas (${data.total} no Kanban).`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.getElementById('btn-scrape').addEventListener('click', async () => {
  if (!hasConfirmedFirstSearch) {
    const rawTitle = (state.profile?.titlePt || 'DevOps Engineer').split(/[|•–—/]/)[0].trim();
    document.getElementById('confirm-scrape-title').textContent = rawTitle || 'DevOps Engineer';
    document.getElementById('confirm-scrape-seniority').value = state.seniorityFilter || 'all';
    document.getElementById('confirm-scrape-workmode').value = state.workMode || 'remoto_br';
    document.getElementById('scrape-confirm-modal-backdrop').classList.remove('hidden');
    return;
  }
  await executeJobScrape();
});

document.getElementById('btn-close-scrape-confirm').addEventListener('click', () => {
  document.getElementById('scrape-confirm-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-scrape-confirm').addEventListener('click', () => {
  document.getElementById('scrape-confirm-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-confirm-scrape-run').addEventListener('click', async () => {
  hasConfirmedFirstSearch = true;
  state.seniorityFilter = document.getElementById('confirm-scrape-seniority').value;
  state.workMode = document.getElementById('confirm-scrape-workmode').value;
  document.getElementById('filter-seniority').value = state.seniorityFilter;
  document.getElementById('select-work-mode').value = state.workMode;
  document.getElementById('scrape-confirm-modal-backdrop').classList.add('hidden');

  const mapped = WORK_MODE_LOCATIONS[state.workMode] || WORK_MODE_LOCATIONS.remoto_br;
  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileInfo: {
        locationPt: mapped.pt,
        locationEn: mapped.en
      }
    })
  });
  await executeJobScrape();
});

// ============================================================================
// INPUT MASKS & VALIDATORS FOR PERSONAL DATA IN PROFILE
// ============================================================================
function formatPhoneMaskClient(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  digits = digits.slice(0, 13);
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`;
  const cc = digits.slice(0, 2);
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);
  if (rest.length <= 4) return `+${cc} (${ddd}) ${rest}`;
  if (rest.length <= 8) return `+${cc} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `+${cc} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

function isValidEmailClient(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

document.getElementById('prof-phone').addEventListener('input', (e) => {
  e.target.value = formatPhoneMaskClient(e.target.value);
});

document.getElementById('prof-email').addEventListener('input', (e) => {
  const cleaned = e.target.value.replace(/\s+/g, '').toLowerCase();
  e.target.value = cleaned;
  e.target.style.borderColor = cleaned && !isValidEmailClient(cleaned) ? '#ef4444' : '';
});

document.getElementById('prof-name').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[0-9]/g, '').replace(/\s{2,}/g, ' ');
});

['prof-linkedin', 'prof-github'].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\s+/g, '');
  });
  el.addEventListener('blur', (e) => {
    const val = e.target.value.trim();
    if (val && !/^https?:\/\//i.test(val)) {
      e.target.value = `https://${val}`;
    }
  });
});

['new-cert-year', 'new-edu-year', 'edit-cert-year', 'edit-edu-year'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }
});

// ============================================================================
// MODAL 2: PERFIL (6 Separated Tabs + Languages + Pencil Editing + CV Extractor)
// ============================================================================
function renderProfileModalContent() {
  if (!state.profile) return;
  const p = state.profile;
  document.getElementById('prof-name').value = p.name || '';
  document.getElementById('prof-email').value = p.email || '';
  document.getElementById('prof-phone').value = formatPhoneMaskClient(p.phone || '');
  document.getElementById('prof-linkedin').value = p.linkedin || '';
  document.getElementById('prof-github').value = p.github || '';
  document.getElementById('prof-title-pt').value = p.titlePt || '';

  // Languages inside Tab 1 (Dados Pessoais)
  const langsEl = document.getElementById('langs-list');
  if (langsEl) {
    langsEl.innerHTML = '';
    for (const lg of p.languages || []) {
      const row = document.createElement('div');
      row.className = 'list-row-card';
      row.innerHTML = `
        <div>
          <strong>🗣️ ${escapeHtmlClient(lg.language)}</strong>
          <span class="seniority-tag" style="margin-left:8px;">${escapeHtmlClient(lg.proficiency)}</span>
        </div>
        <button type="button" class="btn btn-xs btn-danger" data-del-lang="${lg.id}" title="Remover Idioma">✕</button>
      `;
      langsEl.appendChild(row);
    }
    langsEl.querySelectorAll('[data-del-lang]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch('/api/profile/languages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deleteId: Number(btn.dataset.delLang) })
        });
        await loadBootstrap();
        renderProfileModalContent();
        showToast('Idioma removido.');
      });
    });
  }

  // Tab 2: Professional Experience (with Pencil ✏️ Edit & Delete)
  const expEl = document.getElementById('exp-list');
  if (expEl) {
    expEl.innerHTML = '';
    for (const ex of p.experiences || []) {
      const row = document.createElement('div');
      row.className = 'list-row-card';
      row.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong>💼 ${escapeHtmlClient(ex.role)}</strong>
            <span class="tag-chip">${escapeHtmlClient(ex.company)}</span>
            ${ex.period ? `<span class="seniority-tag">${escapeHtmlClient(ex.period)}</span>` : ''}
          </div>
          <div style="font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4;">
            ${escapeHtmlClient(ex.descriptionPt)}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-xs btn-secondary" data-edit-exp="${ex.id}" title="Editar Experiência">✏️</button>
          <button type="button" class="btn btn-xs btn-danger" data-del-exp="${ex.id}" title="Remover Experiência">✕</button>
        </div>
      `;
      expEl.appendChild(row);
    }
    expEl.querySelectorAll('[data-edit-exp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.editExp);
        const exp = (state.profile?.experiences || []).find((x) => x.id === id);
        if (!exp) return;
        document.getElementById('edit-exp-id').value = String(exp.id);
        document.getElementById('edit-exp-role').value = exp.role || '';
        document.getElementById('edit-exp-company').value = exp.company || '';
        document.getElementById('edit-exp-period').value = exp.period || '';
        document.getElementById('edit-exp-pt').value = exp.descriptionPt || '';
        document.getElementById('edit-exp-en').value = exp.descriptionEn || '';
        document.getElementById('exp-edit-modal-backdrop').classList.remove('hidden');
      });
    });
    expEl.querySelectorAll('[data-del-exp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch('/api/profile/experiences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deleteId: Number(btn.dataset.delExp) })
        });
        await loadBootstrap();
        renderProfileModalContent();
        showToast('Experiência removida.');
      });
    });
  }

  // Tab 3: Skills (Read-only card + Pencil button ✏️ that opens the Edit Skill Mini Popup)
  const LEVEL_BADGES = {
    evolving: '🟡 Iniciante / Em Evolução',
    practical: '🟢 Prático / Autônomo',
    solid: '🔥 Sólido / Avançado'
  };
  const skillsEl = document.getElementById('skills-evolution-list');
  skillsEl.innerHTML = '';
  for (const s of p.skills) {
    const row = document.createElement('div');
    row.className = 'skill-item';
    row.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong>${escapeHtmlClient(s.name)}</strong>
          <span class="tag-chip">${escapeHtmlClient(s.category)}</span>
          <span class="seniority-tag">${escapeHtmlClient(LEVEL_BADGES[s.level] || s.level)}</span>
        </div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4;">
          🇧🇷 ${escapeHtmlClient(s.honestFramingPt)}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" class="btn btn-xs btn-secondary" data-edit-skill="${s.id}" title="Editar Habilidade">✏️</button>
        <button type="button" class="btn btn-xs btn-danger" data-del-skill="${s.id}" title="Remover Habilidade">✕</button>
      </div>
    `;
    skillsEl.appendChild(row);
  }

  skillsEl.querySelectorAll('[data-edit-skill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.editSkill);
      const skill = (state.profile?.skills || []).find((sk) => sk.id === id);
      if (!skill) return;
      document.getElementById('edit-skill-id').value = String(skill.id);
      document.getElementById('edit-skill-name').value = skill.name || '';
      document.getElementById('edit-skill-cat').value = skill.category || '';
      document.getElementById('edit-skill-level').value = skill.level || 'practical';
      document.getElementById('edit-skill-pt').value = skill.honestFramingPt || '';
      document.getElementById('edit-skill-en').value = skill.honestFramingEn || '';
      document.getElementById('skill-edit-modal-backdrop').classList.remove('hidden');
    });
  });

  skillsEl.querySelectorAll('[data-del-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const deleteSkillId = Number(btn.dataset.delSkill);
      await fetch('/api/profile/evolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteSkillId })
      });
      await loadBootstrap();
      renderProfileModalContent();
      showToast('Habilidade removida.');
    });
  });

  // Tab 4: Certifications (with Pencil ✏️ Edit & Delete)
  const certsEl = document.getElementById('certs-list');
  certsEl.innerHTML = '';
  for (const c of p.certificationItems || []) {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong>🏅 ${escapeHtmlClient(c.name)}</strong>
          ${c.code ? `<span class="seniority-tag">Código: ${escapeHtmlClient(c.code)}</span>` : ''}
        </div>
        <div style="font-size:12px; color:var(--muted); margin-top:3px;">
          Emissor: ${escapeHtmlClient(c.issuer || 'Oficial')}
          ${c.year ? ` • Vencimento: <strong>${escapeHtmlClient(c.year)}</strong>` : ''}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" class="btn btn-xs btn-secondary" data-edit-cert="${c.id}" title="Editar Certificação">✏️</button>
        <button type="button" class="btn btn-xs btn-danger" data-del-cert="${c.id}" title="Remover Certificação">✕</button>
      </div>
    `;
    certsEl.appendChild(row);
  }
  certsEl.querySelectorAll('[data-edit-cert]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.editCert);
      const cert = (state.profile?.certificationItems || []).find((ct) => ct.id === id);
      if (!cert) return;
      document.getElementById('edit-cert-id').value = String(cert.id);
      document.getElementById('edit-cert-name').value = cert.name || '';
      document.getElementById('edit-cert-code').value = cert.code || '';
      document.getElementById('edit-cert-issuer').value = cert.issuer || '';
      document.getElementById('edit-cert-year').value = cert.year || '';
      document.getElementById('cert-edit-modal-backdrop').classList.remove('hidden');
    });
  });
  certsEl.querySelectorAll('[data-del-cert]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/profile/certifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteId: Number(btn.dataset.delCert) })
      });
      await loadBootstrap();
      renderProfileModalContent();
      showToast('Certificação removida.');
    });
  });

  // Tab 5: Educations / Degrees / Courses (with Pencil ✏️ Edit & Delete)
  const eduEl = document.getElementById('edu-list');
  eduEl.innerHTML = '';
  for (const ed of p.educations || []) {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div>
        <strong>🎓 ${escapeHtmlClient(ed.degree)} — ${escapeHtmlClient(ed.course)}</strong>
        <div style="font-size:12px; color:var(--muted);">${escapeHtmlClient(ed.institution)} • ${escapeHtmlClient(ed.status)} ${ed.year ? `(${escapeHtmlClient(ed.year)})` : ''}</div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" class="btn btn-xs btn-secondary" data-edit-edu="${ed.id}" title="Editar Formação / Curso">✏️</button>
        <button type="button" class="btn btn-xs btn-danger" data-del-edu="${ed.id}" title="Remover Formação">✕</button>
      </div>
    `;
    eduEl.appendChild(row);
  }
  eduEl.querySelectorAll('[data-edit-edu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.editEdu);
      const ed = (state.profile?.educations || []).find((e) => e.id === id);
      if (!ed) return;
      document.getElementById('edit-edu-id').value = String(ed.id);
      document.getElementById('edit-edu-course').value = ed.course || '';
      document.getElementById('edit-edu-inst').value = ed.institution || '';
      document.getElementById('edit-edu-degree').value = ed.degree || 'Tecnólogo';
      document.getElementById('edit-edu-status').value = ed.status || 'Concluído';
      document.getElementById('edit-edu-year').value = ed.year || '';
      document.getElementById('edu-edit-modal-backdrop').classList.remove('hidden');
    });
  });
  eduEl.querySelectorAll('[data-del-edu]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/profile/educations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteId: Number(btn.dataset.delEdu) })
      });
      await loadBootstrap();
      renderProfileModalContent();
      showToast('Formação removida.');
    });
  });

  // Tab 6: Personal Projects (with Link + Pencil ✏️ Edit & Delete)
  const projEl = document.getElementById('projects-list');
  projEl.innerHTML = '';
  for (const pr of p.personalProjects || []) {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong>🚀 ${escapeHtmlClient(pr.name)}</strong>
          <span class="seniority-tag">${escapeHtmlClient((pr.techStack || []).join(', '))}</span>
          ${pr.url ? `<a href="${escapeHtmlClient(pr.url)}" target="_blank" rel="noopener" style="font-size:12px; color:var(--primary); font-weight:600;">🔗 Link ↗</a>` : ''}
        </div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px;">${escapeHtmlClient(pr.descriptionPt)}</div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" class="btn btn-xs btn-secondary" data-edit-proj="${pr.id}" title="Editar Projeto">✏️</button>
        <button type="button" class="btn btn-xs btn-danger" data-del-proj="${pr.id}" title="Remover Projeto">✕</button>
      </div>
    `;
    projEl.appendChild(row);
  }
  projEl.querySelectorAll('[data-edit-proj]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.editProj);
      const pr = (state.profile?.personalProjects || []).find((pItem) => pItem.id === id);
      if (!pr) return;
      document.getElementById('edit-proj-id').value = String(pr.id);
      document.getElementById('edit-proj-name').value = pr.name || '';
      document.getElementById('edit-proj-stack').value = (pr.techStack || []).join(', ');
      document.getElementById('edit-proj-url').value = pr.url || '';
      document.getElementById('edit-proj-pt').value = pr.descriptionPt || '';
      document.getElementById('edit-proj-en').value = pr.descriptionEn || '';
      document.getElementById('proj-edit-modal-backdrop').classList.remove('hidden');
    });
  });
  projEl.querySelectorAll('[data-del-proj]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/profile/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deleteId: Number(btn.dataset.delProj) })
      });
      await loadBootstrap();
      renderProfileModalContent();
      showToast('Projeto pessoal removido.');
    });
  });
}

document.querySelectorAll('.profile-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.ptab;
    document.querySelectorAll('.profile-tab').forEach((b) => b.classList.toggle('active', b.dataset.ptab === target));
    ['ptab-dados', 'ptab-exp', 'ptab-skills', 'ptab-certs', 'ptab-edu', 'ptab-projects'].forEach((id) => {
      document.getElementById(id).classList.toggle('hidden', id !== target);
    });
  });
});

document.getElementById('btn-open-profile').addEventListener('click', () => {
  renderProfileModalContent();
  document.getElementById('profile-modal-backdrop').classList.remove('hidden');
});

document.getElementById('btn-close-profile-modal').addEventListener('click', () => {
  document.getElementById('profile-modal-backdrop').classList.add('hidden');
});

document.getElementById('btn-toggle-cv-paste').addEventListener('click', () => {
  document.getElementById('cv-paste-drawer').classList.toggle('hidden');
});

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

document.getElementById('input-cv-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  showToast(`Extraindo dados do currículo "${file.name}"...`);
  const rawBuffer = await file.arrayBuffer();
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const payload = isPdf
    ? { pdfBase64: arrayBufferToBase64(rawBuffer), rawText: '' }
    : { rawText: new TextDecoder('utf-8').decode(rawBuffer) };

  const res = await fetch('/api/profile/extract-cv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  await loadBootstrap();
  renderProfileModalContent();
  const prof = data.profile || state.profile;
  showToast(
    `CV importado! Extraídos: ${prof.experiences?.length || 0} Experiências, ${prof.skills?.length || 0} Skills, ${prof.certificationItems?.length || 0} Certificações, ${prof.educations?.length || 0} Formações e ${prof.personalProjects?.length || 0} Projetos.`
  );
  e.target.value = '';
});

document.getElementById('btn-run-cv-extract').addEventListener('click', async () => {
  const rawText = document.getElementById('textarea-cv-extract').value.trim();
  if (!rawText) return;
  const res = await fetch('/api/profile/extract-cv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawText })
  });
  const data = await res.json();
  await loadBootstrap();
  renderProfileModalContent();
  document.getElementById('cv-paste-drawer').classList.add('hidden');
  const prof = data.profile || state.profile;
  showToast(
    `Extração concluída! ${prof.experiences?.length || 0} Experiências, ${prof.skills?.length || 0} Skills, ${prof.certificationItems?.length || 0} Certificações, ${prof.educations?.length || 0} Formações e ${prof.personalProjects?.length || 0} Projetos.`
  );
});

document.getElementById('btn-save-profile-info').addEventListener('click', async () => {
  const emailVal = document.getElementById('prof-email').value.trim().toLowerCase();
  if (emailVal && !isValidEmailClient(emailVal)) {
    showToast('⚠️ Informe um endereço de e-mail válido (ex: nome@dominio.com).');
    document.getElementById('prof-email').focus();
    return;
  }
  const phoneVal = formatPhoneMaskClient(document.getElementById('prof-phone').value);
  document.getElementById('prof-phone').value = phoneVal;
  const titleVal = document.getElementById('prof-title-pt').value.trim();

  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileInfo: {
        name: document.getElementById('prof-name').value.trim(),
        email: emailVal,
        phone: phoneVal,
        linkedin: document.getElementById('prof-linkedin').value.trim(),
        github: document.getElementById('prof-github').value.trim(),
        titlePt: titleVal,
        titleEn: titleVal
      }
    })
  });
  await loadBootstrap();
  showToast('Dados pessoais validados e salvos com sucesso!');
});

document.getElementById('btn-add-lang').addEventListener('click', async () => {
  const language = document.getElementById('new-lang-name').value.trim();
  const proficiency = document.getElementById('new-lang-prof').value;
  if (!language) return;
  await fetch('/api/profile/languages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language, proficiency })
  });
  document.getElementById('new-lang-name').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast(`Idioma "${language}" adicionado!`);
});

document.getElementById('btn-add-exp').addEventListener('click', async () => {
  const role = document.getElementById('new-exp-role').value.trim();
  const company = document.getElementById('new-exp-company').value.trim();
  const period = document.getElementById('new-exp-period').value.trim();
  const descriptionPt = document.getElementById('new-exp-pt').value.trim();
  const descriptionEn = document.getElementById('new-exp-en').value.trim();
  if (!role || !company) return;
  await fetch('/api/profile/experiences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, company, period, descriptionPt, descriptionEn })
  });
  document.getElementById('new-exp-role').value = '';
  document.getElementById('new-exp-company').value = '';
  document.getElementById('new-exp-period').value = '';
  document.getElementById('new-exp-pt').value = '';
  document.getElementById('new-exp-en').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Experiência profissional adicionada!');
});

// Mini Popup handlers for Editing Experience
document.getElementById('btn-close-exp-edit-modal').addEventListener('click', () => {
  document.getElementById('exp-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-exp-edit').addEventListener('click', () => {
  document.getElementById('exp-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-save-exp-edit').addEventListener('click', async () => {
  const editId = Number(document.getElementById('edit-exp-id').value);
  if (!editId) return;
  const role = document.getElementById('edit-exp-role').value.trim();
  const company = document.getElementById('edit-exp-company').value.trim();
  const period = document.getElementById('edit-exp-period').value.trim();
  const descriptionPt = document.getElementById('edit-exp-pt').value.trim();
  const descriptionEn = document.getElementById('edit-exp-en').value.trim();
  await fetch('/api/profile/experiences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editId, role, company, period, descriptionPt, descriptionEn })
  });
  document.getElementById('exp-edit-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Experiência profissional atualizada!');
});

document.getElementById('btn-add-skill').addEventListener('click', async () => {
  const newSkillName = document.getElementById('new-skill-name').value.trim();
  if (!newSkillName) return;
  const category = document.getElementById('new-skill-cat').value.trim() || 'DevOps / Cloud';
  const level = document.getElementById('new-skill-level').value;
  const honestFramingPt = document.getElementById('new-skill-pt').value.trim();
  const honestFramingEn = document.getElementById('new-skill-en').value.trim();
  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newSkillName, category, level, honestFramingPt, honestFramingEn })
  });
  document.getElementById('new-skill-name').value = '';
  document.getElementById('new-skill-pt').value = '';
  document.getElementById('new-skill-en').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast(`Habilidade "${newSkillName}" adicionada!`);
});

// Mini Popup handlers for Editing an existing Skill without deleting
document.getElementById('btn-close-skill-edit-modal').addEventListener('click', () => {
  document.getElementById('skill-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-skill-edit').addEventListener('click', () => {
  document.getElementById('skill-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-save-skill-edit').addEventListener('click', async () => {
  const skillId = Number(document.getElementById('edit-skill-id').value);
  if (!skillId) return;
  const name = document.getElementById('edit-skill-name').value.trim();
  const category = document.getElementById('edit-skill-cat').value.trim() || 'DevOps / Cloud';
  const level = document.getElementById('edit-skill-level').value;
  const honestFramingPt = document.getElementById('edit-skill-pt').value.trim();
  const honestFramingEn = document.getElementById('edit-skill-en').value.trim();

  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      skillId,
      name,
      category,
      level,
      honestFramingPt,
      honestFramingEn
    })
  });
  document.getElementById('skill-edit-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  renderProfileModalContent();
  showToast(`Habilidade "${name}" editada e salva com sucesso!`);
});

document.getElementById('btn-add-cert').addEventListener('click', async () => {
  const name = document.getElementById('new-cert-name').value.trim();
  const code = document.getElementById('new-cert-code').value.trim().toUpperCase();
  if (!name) return;
  const issuer = document.getElementById('new-cert-issuer').value.trim();
  const year = document.getElementById('new-cert-year').value.replace(/\D/g, '').slice(0, 4);
  if (year && year.length !== 4) {
    showToast('⚠️ O ano de vencimento deve conter 4 dígitos numéricos (Ex: 2028).');
    document.getElementById('new-cert-year').focus();
    return;
  }
  await fetch('/api/profile/certifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, code, issuer, year })
  });
  document.getElementById('new-cert-name').value = '';
  document.getElementById('new-cert-code').value = '';
  document.getElementById('new-cert-issuer').value = '';
  document.getElementById('new-cert-year').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Certificação adicionada com sucesso!');
});

document.getElementById('btn-add-edu').addEventListener('click', async () => {
  const course = document.getElementById('new-edu-course').value.trim();
  const institution = document.getElementById('new-edu-inst').value.trim();
  if (!course || !institution) return;
  const degree = document.getElementById('new-edu-degree').value;
  const status = document.getElementById('new-edu-status').value;
  const year = document.getElementById('new-edu-year').value.trim();
  await fetch('/api/profile/educations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ course, institution, degree, status, year })
  });
  document.getElementById('new-edu-course').value = '';
  document.getElementById('new-edu-inst').value = '';
  document.getElementById('new-edu-year').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Formação adicionada!');
});

// Mini Popup handlers for Editing Certification, Education, and Project
document.getElementById('btn-close-cert-edit-modal').addEventListener('click', () => {
  document.getElementById('cert-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-cert-edit').addEventListener('click', () => {
  document.getElementById('cert-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-save-cert-edit').addEventListener('click', async () => {
  const editId = Number(document.getElementById('edit-cert-id').value);
  if (!editId) return;
  const name = document.getElementById('edit-cert-name').value.trim();
  const code = document.getElementById('edit-cert-code').value.trim().toUpperCase();
  const issuer = document.getElementById('edit-cert-issuer').value.trim();
  const year = document.getElementById('edit-cert-year').value.replace(/\D/g, '').slice(0, 4);
  if (year && year.length !== 4) {
    showToast('⚠️ O ano de vencimento deve conter 4 dígitos numéricos (Ex: 2028).');
    return;
  }
  await fetch('/api/profile/certifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editId, name, code, issuer, year })
  });
  document.getElementById('cert-edit-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Certificação atualizada com sucesso!');
});

document.getElementById('btn-close-edu-edit-modal').addEventListener('click', () => {
  document.getElementById('edu-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-edu-edit').addEventListener('click', () => {
  document.getElementById('edu-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-save-edu-edit').addEventListener('click', async () => {
  const editId = Number(document.getElementById('edit-edu-id').value);
  if (!editId) return;
  const course = document.getElementById('edit-edu-course').value.trim();
  const institution = document.getElementById('edit-edu-inst').value.trim();
  const degree = document.getElementById('edit-edu-degree').value;
  const status = document.getElementById('edit-edu-status').value;
  const year = document.getElementById('edit-edu-year').value.replace(/\D/g, '').slice(0, 4);
  await fetch('/api/profile/educations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editId, course, institution, degree, status, year })
  });
  document.getElementById('edu-edit-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Formação / Curso atualizado com sucesso!');
});

document.getElementById('btn-close-proj-edit-modal').addEventListener('click', () => {
  document.getElementById('proj-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-cancel-proj-edit').addEventListener('click', () => {
  document.getElementById('proj-edit-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-save-proj-edit').addEventListener('click', async () => {
  const editId = Number(document.getElementById('edit-proj-id').value);
  if (!editId) return;
  const name = document.getElementById('edit-proj-name').value.trim();
  const techStack = document.getElementById('edit-proj-stack').value.trim();
  const url = document.getElementById('edit-proj-url').value.trim();
  const descriptionPt = document.getElementById('edit-proj-pt').value.trim();
  const descriptionEn = document.getElementById('edit-proj-en').value.trim();
  await fetch('/api/profile/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editId, name, techStack, url, descriptionPt, descriptionEn })
  });
  document.getElementById('proj-edit-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Projeto pessoal atualizado com sucesso!');
});

document.getElementById('btn-add-proj').addEventListener('click', async () => {
  const name = document.getElementById('new-proj-name').value.trim();
  const techStack = document.getElementById('new-proj-stack').value.trim();
  const url = document.getElementById('new-proj-url').value.trim();
  const descriptionPt = document.getElementById('new-proj-pt').value.trim();
  const descriptionEn = document.getElementById('new-proj-en').value.trim();
  if (!name || !descriptionPt) return;
  await fetch('/api/profile/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, techStack, url, descriptionPt, descriptionEn })
  });
  document.getElementById('new-proj-name').value = '';
  document.getElementById('new-proj-stack').value = '';
  document.getElementById('new-proj-url').value = '';
  document.getElementById('new-proj-pt').value = '';
  document.getElementById('new-proj-en').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Projeto pessoal adicionado!');
});

// ============================================================================
// MODAL 3: CONFIGURAÇÕES (API Key + Editable Agent .MD Prompts)
// ============================================================================
function renderSettingsModal() {
  if (state.settings) {
    document.getElementById('set-ai-provider').value = state.settings.aiProvider || 'deterministic';
    document.getElementById('set-model-name').value = state.settings.modelName || 'gpt-4o-mini';
    document.getElementById('set-api-key').value = state.settings.apiKey || '';
    document.getElementById('set-base-url').value = state.settings.baseUrl || '';
  }

  const tabsBar = document.getElementById('agent-tabs-bar');
  tabsBar.innerHTML = '';
  for (const agent of state.agentPrompts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `subtab ${agent.slug === state.activeAgentSlug ? 'active' : ''}`;
    btn.textContent = `📄 ${agent.slug}`;
    btn.onclick = () => {
      state.activeAgentSlug = agent.slug;
      renderSettingsModal();
    };
    tabsBar.appendChild(btn);
  }

  const activeAgent = state.agentPrompts.find((a) => a.slug === state.activeAgentSlug) || state.agentPrompts[0];
  if (activeAgent) {
    state.activeAgentSlug = activeAgent.slug;
    document.getElementById('agent-description-label').textContent = `${activeAgent.title} — ${activeAgent.description}`;
    document.getElementById('agent-md-editor').value = activeAgent.content;
  }
}

document.getElementById('btn-open-settings').addEventListener('click', () => {
  renderSettingsModal();
  document.getElementById('settings-modal-backdrop').classList.remove('hidden');
});

document.getElementById('btn-close-settings-modal').addEventListener('click', () => {
  document.getElementById('settings-modal-backdrop').classList.add('hidden');
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const aiProvider = document.getElementById('set-ai-provider').value;
  const modelName = document.getElementById('set-model-name').value;
  const apiKey = document.getElementById('set-api-key').value;
  const baseUrl = document.getElementById('set-base-url').value;
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aiProvider, modelName, apiKey, baseUrl })
  });
  await loadBootstrap();
  showToast('Configurações de IA e API Key salvas!');
});

document.getElementById('btn-save-agent-md').addEventListener('click', async () => {
  if (!state.activeAgentSlug) return;
  const content = document.getElementById('agent-md-editor').value;
  await fetch(`/api/agents/${encodeURIComponent(state.activeAgentSlug)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content })
  });
  await loadBootstrap();
  showToast(`Arquivo "${state.activeAgentSlug}" do agente atualizado!`);
});

// ============================================================================
// MODAL 4: INGEST NEW JOB
// ============================================================================
document.getElementById('btn-open-ingest').addEventListener('click', () => {
  document.getElementById('ingest-modal-backdrop').classList.remove('hidden');
});
document.getElementById('btn-close-ingest-modal').addEventListener('click', () => {
  document.getElementById('ingest-modal-backdrop').classList.add('hidden');
});
document.getElementById('btn-submit-ingest').addEventListener('click', async () => {
  const title = document.getElementById('ingest-title').value;
  const company = document.getElementById('ingest-company').value;
  const url = document.getElementById('ingest-url').value;
  const seniority = document.getElementById('ingest-seniority').value;
  const recruiterName = document.getElementById('ingest-recruiter').value;
  const rawText = document.getElementById('ingest-text').value;

  const res = await fetch('/api/jobs/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, company, url, seniority, recruiterName, rawText })
  });
  const created = await res.json();
  document.getElementById('ingest-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  openJobModal(created.id);
});

loadBootstrap();
