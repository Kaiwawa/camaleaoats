let state = {
  profile: null,
  jobs: [],
  settings: null,
  agentPrompts: [],
  activeJobId: null,
  activeLang: 'pt-BR',
  seniorityFilter: 'all',
  activeAgentSlug: 'cv-adapter.md'
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

function showToast(msg) {
  const banner = document.getElementById('toast-banner');
  banner.textContent = msg;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3500);
}

function applyTheme(themeMode) {
  const mode = themeMode || 'auto';
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('camaleao_theme', mode);
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeVal === mode);
  });
}

async function loadBootstrap() {
  const res = await fetch('/api/bootstrap');
  const data = await res.json();
  state.profile = data.profile;
  state.jobs = data.jobs;
  state.settings = data.settings;
  state.agentPrompts = data.agentPrompts || [];

  const savedTheme = localStorage.getItem('camaleao_theme') || state.settings?.theme || 'auto';
  applyTheme(savedTheme);

  renderHeader();
  renderKanban();
}

function renderHeader() {
  if (!state.profile) return;
  document.getElementById('header-seniority-text').textContent = state.profile.targetSeniority;
}

// Theme buttons
document.querySelectorAll('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const theme = btn.dataset.themeVal;
    applyTheme(theme);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme })
    });
  });
});

// Seniority filter dropdown
document.getElementById('filter-seniority').addEventListener('change', (e) => {
  state.seniorityFilter = e.target.value;
  renderKanban();
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
  const res = await fetch(`/api/jobs/${state.activeJobId}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lang: state.activeLang })
  });
  const outcome = await res.json();
  const logEl = document.getElementById('modal-apply-log');
  logEl.innerHTML =
    `<strong>✅ Automação concluída (${outcome.mode === 'gupy_apresentese' ? 'Modo Gupy Apresente-se' : 'Modo Upload PDF'}):</strong><br/>` +
    (outcome.stepsExecuted || []).map((s) => `• ${escapeHtmlClient(s)}`).join('<br/>');
  logEl.classList.remove('hidden');
  await loadBootstrap();
  showToast('Candidatura preparada e card movido para "Em Processo"!');
});

document.getElementById('btn-scrape').addEventListener('click', async () => {
  showToast('Buscando vagas remotas de DevOps / SRE / Cloud...');
  const res = await fetch('/api/jobs/scrape', { method: 'POST' });
  const data = await res.json();
  await loadBootstrap();
  showToast(`Busca concluída! ${data.total} vagas disponíveis no Kanban.`);
});

// ============================================================================
// MODAL 2: PERFIL (5 Separated Tabs + CV Extractor)
// ============================================================================
function renderProfileModalContent() {
  if (!state.profile) return;
  const p = state.profile;
  document.getElementById('prof-name').value = p.name || '';
  document.getElementById('prof-email').value = p.email || '';
  document.getElementById('prof-phone').value = p.phone || '';
  document.getElementById('prof-location').value = p.locationPt || '';
  document.getElementById('prof-linkedin').value = p.linkedin || '';
  document.getElementById('prof-github').value = p.github || '';
  document.getElementById('prof-title-pt').value = p.titlePt || '';
  document.getElementById('prof-title-en').value = p.titleEn || '';

  // Tab 2: Skills (WITH seniority/familiarity level)
  const skillsEl = document.getElementById('skills-evolution-list');
  skillsEl.innerHTML = '';
  for (const s of p.skills) {
    const row = document.createElement('div');
    row.className = 'skill-item';
    row.innerHTML = `
      <div>
        <strong>${escapeHtmlClient(s.name)}</strong>
        <div style="font-size:11px; color:var(--muted);">${escapeHtmlClient(s.category)}</div>
      </div>
      <select data-skill-level="${s.id}">
        <option value="evolving" ${s.level === 'evolving' ? 'selected' : ''}>🟡 Iniciante / Em Evolução</option>
        <option value="practical" ${s.level === 'practical' ? 'selected' : ''}>🟢 Prático / Autônomo</option>
        <option value="solid" ${s.level === 'solid' ? 'selected' : ''}>🔥 Sólido / Avançado</option>
      </select>
      <input type="text" data-skill-pt="${s.id}" value="${escapeHtmlClient(s.honestFramingPt)}" />
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn btn-xs btn-primary" data-save-skill="${s.id}">Salvar</button>
        <button type="button" class="btn btn-xs btn-danger" data-del-skill="${s.id}">✕</button>
      </div>
    `;
    skillsEl.appendChild(row);
  }

  skillsEl.querySelectorAll('[data-save-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.saveSkill);
      const level = skillsEl.querySelector(`[data-skill-level="${id}"]`).value;
      const honestFramingPt = skillsEl.querySelector(`[data-skill-pt="${id}"]`).value;
      await fetch('/api/profile/evolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skillId: id, level, honestFramingPt })
      });
      await loadBootstrap();
      renderProfileModalContent();
      showToast('Habilidade atualizada!');
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

  // Tab 3: Certifications (NO seniority level)
  const certsEl = document.getElementById('certs-list');
  certsEl.innerHTML = '';
  for (const c of p.certificationItems || []) {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div>
        <strong>🏅 ${escapeHtmlClient(c.name)}</strong>
        <div style="font-size:12px; color:var(--muted);">Emissor: ${escapeHtmlClient(c.issuer || 'Oficial')} ${c.year ? `• Ano: ${escapeHtmlClient(c.year)}` : ''}</div>
      </div>
      <button type="button" class="btn btn-xs btn-danger" data-del-cert="${c.id}">Remover</button>
    `;
    certsEl.appendChild(row);
  }
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

  // Tab 4: Educations / Degrees
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
      <button type="button" class="btn btn-xs btn-danger" data-del-edu="${ed.id}">Remover</button>
    `;
    eduEl.appendChild(row);
  }
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

  // Tab 5: Personal Projects
  const projEl = document.getElementById('projects-list');
  projEl.innerHTML = '';
  for (const pr of p.personalProjects || []) {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div>
        <strong>🚀 ${escapeHtmlClient(pr.name)}</strong>
        <span class="seniority-tag" style="margin-left:6px;">${escapeHtmlClient((pr.techStack || []).join(', '))}</span>
        <div style="font-size:12px; color:var(--muted); margin-top:4px;">${escapeHtmlClient(pr.descriptionPt)}</div>
      </div>
      <button type="button" class="btn btn-xs btn-danger" data-del-proj="${pr.id}">Remover</button>
    `;
    projEl.appendChild(row);
  }
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
    ['ptab-dados', 'ptab-skills', 'ptab-certs', 'ptab-edu', 'ptab-projects'].forEach((id) => {
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

document.getElementById('input-cv-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const rawBuffer = await file.arrayBuffer();
  const rawString = new TextDecoder('latin1').decode(rawBuffer);
  // Extract readable ASCII/Latin-1 text segments from PDF or plain text
  const cleanedText = file.name.toLowerCase().endsWith('.pdf')
    ? (rawString.match(/\(([^()]{3,})\)/g) || []).map((s) => s.slice(1, -1)).join('\n') || rawString
    : new TextDecoder('utf-8').decode(rawBuffer);

  const res = await fetch('/api/profile/extract-cv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawText: cleanedText })
  });
  await res.json();
  await loadBootstrap();
  renderProfileModalContent();
  showToast(`Currículo "${file.name}" importado e extraído para o seu Perfil!`);
});

document.getElementById('btn-run-cv-extract').addEventListener('click', async () => {
  const rawText = document.getElementById('textarea-cv-extract').value.trim();
  if (!rawText) return;
  await fetch('/api/profile/extract-cv', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawText })
  });
  await loadBootstrap();
  renderProfileModalContent();
  document.getElementById('cv-paste-drawer').classList.add('hidden');
  showToast('Dados, certificações, graduações e projetos extraídos do seu CV!');
});

document.getElementById('btn-save-profile-info').addEventListener('click', async () => {
  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileInfo: {
        name: document.getElementById('prof-name').value,
        email: document.getElementById('prof-email').value,
        phone: document.getElementById('prof-phone').value,
        locationPt: document.getElementById('prof-location').value,
        linkedin: document.getElementById('prof-linkedin').value,
        github: document.getElementById('prof-github').value,
        titlePt: document.getElementById('prof-title-pt').value,
        titleEn: document.getElementById('prof-title-en').value
      }
    })
  });
  await loadBootstrap();
  showToast('Dados pessoais salvos com sucesso!');
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

document.getElementById('btn-add-cert').addEventListener('click', async () => {
  const name = document.getElementById('new-cert-name').value.trim();
  if (!name) return;
  const issuer = document.getElementById('new-cert-issuer').value.trim();
  const year = document.getElementById('new-cert-year').value.trim();
  await fetch('/api/profile/certifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, issuer, year })
  });
  document.getElementById('new-cert-name').value = '';
  document.getElementById('new-cert-issuer').value = '';
  document.getElementById('new-cert-year').value = '';
  await loadBootstrap();
  renderProfileModalContent();
  showToast('Certificação adicionada!');
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

document.getElementById('btn-add-proj').addEventListener('click', async () => {
  const name = document.getElementById('new-proj-name').value.trim();
  const techStack = document.getElementById('new-proj-stack').value.trim();
  const descriptionPt = document.getElementById('new-proj-pt').value.trim();
  const descriptionEn = document.getElementById('new-proj-en').value.trim();
  if (!name || !descriptionPt) return;
  await fetch('/api/profile/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, techStack, descriptionPt, descriptionEn })
  });
  document.getElementById('new-proj-name').value = '';
  document.getElementById('new-proj-stack').value = '';
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
