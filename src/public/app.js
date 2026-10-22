let state = {
  profile: null,
  jobs: [],
  activeJobId: null,
  activeLang: 'pt-BR'
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

async function loadBootstrap() {
  const res = await fetch('/api/bootstrap');
  const data = await res.json();
  state.profile = data.profile;
  state.jobs = data.jobs;
  renderHeader();
  renderKanban();
}

function renderHeader() {
  if (!state.profile) return;
  document.getElementById('header-seniority-text').textContent = state.profile.targetSeniority;
}

function renderKanban() {
  const cols = ['abertas', 'em_processo', 'sem_sucesso', 'ruins'];
  for (const col of cols) {
    const container = document.getElementById(`col-${col}`);
    const list = state.jobs.filter((j) => j.status === col);
    document.getElementById(`count-${col}`).textContent = String(list.length);
    container.innerHTML = '';

    for (const job of list) {
      const card = document.createElement('div');
      card.className = 'job-card';
      card.onclick = () => openJobModal(job.id);

      let recruiterBadge = '';
      if (job.recruiterStatus === 'aguardando_aceite') {
        recruiterBadge = `<div class="recruiter-alert-badge">⏳ Conexão Enviada (${escapeHtmlClient(job.recruiterName || 'Recruiter')}) — Lembrar de mandar DM quando aceitar!</div>`;
      } else if (job.recruiterStatus === 'dm_enviada') {
        recruiterBadge = `<div class="recruiter-done-badge">✅ DM Completa Enviada (${escapeHtmlClient(job.recruiterName || 'Recruiter')})</div>`;
      }

      card.innerHTML = `
        <div class="job-card-top">
          <div class="job-card-title">${escapeHtmlClient(job.title)}</div>
          <span class="score-pill">${Number(job.matchScore)}% Match</span>
        </div>
        <div class="job-card-meta">
          <strong>${escapeHtmlClient(job.company)}</strong> • ${escapeHtmlClient(job.platform)} • ${job.language === 'en' ? '🇺🇸 EN' : '🇧🇷 PT'}
        </div>
        <div class="job-card-meta">${escapeHtmlClient(job.location)}</div>
        ${recruiterBadge}
      `;
      container.appendChild(card);
    }
  }
}

async function openJobModal(jobId, forcedLang) {
  state.activeJobId = jobId;
  const langQuery = forcedLang ? `?lang=${encodeURIComponent(forcedLang)}` : '';
  const res = await fetch(`/api/jobs/${jobId}/detail${langQuery}`);
  const detail = await res.json();
  const { job, analysis, tailoredCv, recruiterMessages } = detail;
  state.activeLang = tailoredCv.language;

  document.getElementById('modal-job-title').textContent = job.title;
  document.getElementById('modal-job-score').textContent = `${analysis.matchScore}% Match Real`;
  document.getElementById('modal-job-platform').textContent = job.platform;
  document.getElementById('modal-job-company').textContent = job.company;
  document.getElementById('modal-job-location').textContent = job.location;
  document.getElementById('modal-job-url').href = job.url;

  document.getElementById('btn-lang-pt').classList.toggle('active', state.activeLang === 'pt-BR');
  document.getElementById('btn-lang-en').classList.toggle('active', state.activeLang === 'en');

  const alertsEl = document.getElementById('modal-preference-alerts');
  if (analysis.preferenceAlerts && analysis.preferenceAlerts.length > 0) {
    alertsEl.innerHTML = analysis.preferenceAlerts.join('<br/>');
    alertsEl.classList.remove('hidden');
  } else {
    alertsEl.classList.add('hidden');
  }

  document.getElementById('modal-highlighted-description').innerHTML = analysis.highlightedHtml;

  // Tab 1: CV
  const adjList = document.getElementById('modal-cv-adjustments');
  adjList.innerHTML = tailoredCv.honestAdjustmentsMade.map((a) => `<li>${a}</li>`).join('');
  document.getElementById('modal-cv-summary').value = tailoredCv.summary;
  const bulletsEl = document.getElementById('modal-cv-bullets');
  bulletsEl.innerHTML = tailoredCv.experienceBullets.map((b) => `<li>${b}</li>`).join('');

  // Tab 2: Gupy Mode
  document.getElementById('modal-gupy-apresentese').value = tailoredCv.gupyKit.apresenteseText;
  document.getElementById('modal-gupy-summary').value = tailoredCv.gupyKit.profileSummaryToUpdate;
  document.getElementById('modal-gupy-tags').innerHTML = tailoredCv.gupyKit.skillsTagsToAdd
    .map((t) => `<span class="tag-chip">${t}</span>`)
    .join('');

  // Auto-select Gupy tab if platform is Gupy
  if (job.platform.toLowerCase() === 'gupy') {
    activateSubtab('tab-gupy');
  } else {
    activateSubtab('tab-cv');
  }

  // Tab 3: Tech Recruiter
  document.getElementById('input-recruiter-name').value = job.recruiterName || '';
  document.getElementById('select-recruiter-status').value = job.recruiterStatus || 'nao_enviado';
  document.getElementById('btn-find-recruiter-linkedin').href = recruiterMessages.linkedinSearchUrl;
  document.getElementById('modal-recruiter-invite').value = recruiterMessages.inviteNote;
  document.getElementById('modal-invite-counter').textContent = `${recruiterMessages.inviteCharCount}/200 caracteres`;
  document.getElementById('modal-recruiter-dm').value = recruiterMessages.postAcceptDm;

  // PDF Download Link
  document.getElementById('btn-download-pdf').href = `/api/jobs/${job.id}/cv.pdf?lang=${encodeURIComponent(state.activeLang)}`;
  document.getElementById('modal-apply-log').classList.add('hidden');

  document.getElementById('job-modal-backdrop').classList.remove('hidden');
}

function activateSubtab(tabId) {
  document.querySelectorAll('.subtab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  ['tab-cv', 'tab-gupy', 'tab-recruiter'].forEach((id) => {
    document.getElementById(id).classList.toggle('hidden', id !== tabId);
  });
}

document.querySelectorAll('.subtab').forEach((btn) => {
  btn.addEventListener('click', () => activateSubtab(btn.dataset.tab));
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
    const reason = status === 'ruins' ? 'Descartada pelo usuário no Kanban' : '';
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
  logEl.innerHTML = `<strong>✅ Automação executada (${outcome.mode === 'gupy_apresentese' ? 'Modo Gupy Apresente-se' : 'Modo Upload PDF'}):</strong><br/>` +
    (outcome.stepsExecuted || []).map((s) => `• ${s}`).join('<br/>');
  logEl.classList.remove('hidden');
  await loadBootstrap();
  showToast('Candidatura preparada/aplicada e vaga movida para "Em Processo"!');
});

document.getElementById('btn-scrape').addEventListener('click', async () => {
  showToast('Coletando vagas remotas de DevOps/SRE/Cloud...');
  const res = await fetch('/api/jobs/scrape', { method: 'POST' });
  const data = await res.json();
  await loadBootstrap();
  showToast(`Coleta concluída! ${data.total} vagas avaliadas no seu Kanban.`);
});

// Profile & Seniority Evolution Modal
document.getElementById('btn-open-profile').addEventListener('click', () => {
  if (!state.profile) return;
  document.getElementById('prof-name').value = state.profile.name;
  document.getElementById('prof-email').value = state.profile.email;
  document.getElementById('prof-phone').value = state.profile.phone;
  document.getElementById('prof-linkedin').value = state.profile.linkedin;

  const listEl = document.getElementById('skills-evolution-list');
  listEl.innerHTML = '';
  for (const s of state.profile.skills) {
    const row = document.createElement('div');
    row.className = 'skill-item';
    row.innerHTML = `
      <strong>${s.name}</strong>
      <select data-skill-level="${s.id}">
        <option value="evolving" ${s.level === 'evolving' ? 'selected' : ''}>🟡 Em Evolução</option>
        <option value="practical" ${s.level === 'practical' ? 'selected' : ''}>🟢 Prático / Autônomo</option>
        <option value="solid" ${s.level === 'solid' ? 'selected' : ''}>🔥 Sólido / Pleno+</option>
      </select>
      <input type="text" data-skill-pt="${s.id}" value="${s.honestFramingPt.replace(/"/g, '&quot;')}" />
      <button type="button" class="btn btn-xs btn-primary" data-save-skill="${s.id}">Salvar</button>
    `;
    listEl.appendChild(row);
  }

  listEl.querySelectorAll('[data-save-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.saveSkill);
      const level = listEl.querySelector(`[data-skill-level="${id}"]`).value;
      const honestFramingPt = listEl.querySelector(`[data-skill-pt="${id}"]`).value;
      await fetch('/api/profile/evolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skillId: id, level, honestFramingPt })
      });
      await loadBootstrap();
      showToast('Nível de habilidade e senioridade atualizados!');
    });
  });

  document.getElementById('profile-modal-backdrop').classList.remove('hidden');
});

document.getElementById('btn-close-profile-modal').addEventListener('click', () => {
  document.getElementById('profile-modal-backdrop').classList.add('hidden');
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
        linkedin: document.getElementById('prof-linkedin').value
      }
    })
  });
  await loadBootstrap();
  showToast('Dados pessoais do currículo atualizados!');
});

document.getElementById('btn-add-skill').addEventListener('click', async () => {
  const newSkillName = document.getElementById('new-skill-name').value.trim();
  if (!newSkillName) return;
  const level = document.getElementById('new-skill-level').value;
  const honestFramingPt = document.getElementById('new-skill-pt').value.trim();
  const honestFramingEn = document.getElementById('new-skill-en').value.trim();
  await fetch('/api/profile/evolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newSkillName, level, honestFramingPt, honestFramingEn })
  });
  await loadBootstrap();
  document.getElementById('profile-modal-backdrop').classList.add('hidden');
  showToast(`Nova habilidade "${newSkillName}" adicionada ao seu Perfil Vivo!`);
});

// Ingest Modal
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
  const recruiterName = document.getElementById('ingest-recruiter').value;
  const rawText = document.getElementById('ingest-text').value;

  const res = await fetch('/api/jobs/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, company, url, recruiterName, rawText })
  });
  const created = await res.json();
  document.getElementById('ingest-modal-backdrop').classList.add('hidden');
  await loadBootstrap();
  openJobModal(created.id);
});

loadBootstrap();
