import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppDatabase } from '../src/db.ts';
import { createAppServer } from '../src/server.ts';

test('API serves Kanban bootstrap, bilingual job popup detail with Gupy kit & highlighted matches, PDF download, and recruiter tracker', async (t) => {
  const db = new AppDatabase(':memory:');
  const server = createAppServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  // 1. Bootstrap returns profile, jobs array, settings and agentPrompts without fake demo jobs
  const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(bootRes.status, 200);
  const boot = await bootRes.json();
  assert.ok(Array.isArray(boot.jobs));
  assert.equal(boot.profile.targetSeniority, 'Júnior Avançado / Pleno');

  // 2. Ingest a new Gupy job
  const ingestRes = await fetch(`${baseUrl}/api/jobs/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'DevOps AWS / ArgoCD Remoto',
      company: 'FinTechX',
      url: 'https://fintechx.gupy.io/jobs/1',
      rawText: 'Vaga 100% remota. Requisitos: AWS SAA-C03, Docker, GitHub Actions, ArgoCD, Kubernetes YAML e Grafana.',
      recruiterName: 'Mariana Tech Recruiter'
    })
  });
  assert.equal(ingestRes.status, 200);
  const createdJob = await ingestRes.json();
  assert.equal(createdJob.platform, 'Gupy');

  // 3. Open job popup detail in PT-BR and in EN
  const detailPtRes = await fetch(`${baseUrl}/api/jobs/${createdJob.id}/detail?lang=pt-BR`);
  assert.equal(detailPtRes.status, 200);
  const detailPt = await detailPtRes.json();
  assert.ok(detailPt.analysis.highlightedHtml.includes('match-strong'));
  assert.ok(detailPt.analysis.highlightedHtml.includes('match-evolving'));
  assert.ok(detailPt.recruiterMessages.inviteNote.length <= 200);
  assert.ok(detailPt.tailoredCv.gupyKit.apresenteseText.includes('FinTechX'));

  const detailEnRes = await fetch(`${baseUrl}/api/jobs/${createdJob.id}/detail?lang=en`);
  assert.equal(detailEnRes.status, 200);
  const detailEn = await detailEnRes.json();
  assert.equal(detailEn.tailoredCv.language, 'en');
  assert.ok(detailEn.recruiterMessages.inviteNote.length <= 200);

  // 4. Download tailored ATS PDF in PT-BR and EN
  const pdfRes = await fetch(`${baseUrl}/api/jobs/${createdJob.id}/cv.pdf?lang=pt-BR`);
  assert.equal(pdfRes.status, 200);
  assert.match(pdfRes.headers.get('content-type') ?? '', /application\/pdf/);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  assert.ok(pdfBytes.toString('latin1').startsWith('%PDF-1.4'));

  // 5. Update recruiter connection status to aguardando_aceite
  const recRes = await fetch(`${baseUrl}/api/jobs/${createdJob.id}/recruiter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recruiterStatus: 'aguardando_aceite' })
  });
  const updatedJob = await recRes.json();
  assert.equal(updatedJob.recruiterStatus, 'aguardando_aceite');

  // 6. Evolve Kubernetes skill and verify seniority updates
  const k8sSkill = boot.profile.skills.find((s: { name: string }) => s.name === 'Kubernetes');
  const evolveRes = await fetch(`${baseUrl}/api/profile/evolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      skillId: k8sSkill.id,
      level: 'solid',
      honestFramingPt: 'Administração de clusters Kubernetes, Helm, Ingress e GitOps com ArgoCD',
      honestFramingEn: 'Kubernetes cluster administration, Helm, Ingress and GitOps with ArgoCD'
    })
  });
  assert.equal(evolveRes.status, 200);
  const evolved = await evolveRes.json();
  const updatedK8s = evolved.profile.skills.find((s: { name: string }) => s.name === 'Kubernetes');
  assert.equal(updatedK8s.level, 'solid');

  // 7. Extract CV text into profile
  const extractRes = await fetch(`${baseUrl}/api/profile/extract-cv`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      rawText: 'Carlos SRE\ncarlos@sre.dev\nFormação: Pós-Graduação em Cloud Computing - PUC (2025)\nProjeto Pessoal: Cluster Kubernetes e ArgoCD automatizado com Terraform.'
    })
  });
  assert.equal(extractRes.status, 200);
  const extractedData = await extractRes.json();
  assert.equal(extractedData.profile.name, 'Carlos SRE');
  assert.ok(extractedData.profile.educations.some((e: { institution: string }) => e.institution.includes('PUC')));

  // 8. Save Settings & Agent Markdown
  const settingsRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aiProvider: 'gemini', apiKey: 'AIza-test', theme: 'dark' })
  });
  assert.equal(settingsRes.status, 200);
  const savedSettings = await settingsRes.json();
  assert.equal(savedSettings.settings.aiProvider, 'gemini');
  assert.equal(savedSettings.settings.theme, 'dark');

  const agentRes = await fetch(`${baseUrl}/api/agents/cv-adapter.md`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '# Custom CV Adapter MD\nStrict rules.' })
  });
  assert.equal(agentRes.status, 200);
  const updatedAgent = await agentRes.json();
  assert.equal(updatedAgent.agent.content, '# Custom CV Adapter MD\nStrict rules.');

  // 9. Edit language via editId (pencil button on languages)
  const langToEdit = extractedData.profile.languages[0];
  const editLangRes = await fetch(`${baseUrl}/api/profile/languages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editId: langToEdit.id, language: 'Inglês Técnico', proficiency: 'Avançado' })
  });
  assert.equal(editLangRes.status, 200);
  const editedLangData = await editLangRes.json();
  assert.ok(
    editedLangData.profile.languages.some(
      (l: { id: number; language: string; proficiency: string }) =>
        l.id === langToEdit.id && l.language === 'Inglês Técnico' && l.proficiency === 'Avançado'
    )
  );

  // 10. Security hardening checks: CSP/Security headers, SSRF protection, Agent slug validation, and XSS URL sanitization
  assert.equal(bootRes.headers.get('x-frame-options'), 'DENY');
  assert.equal(bootRes.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(bootRes.headers.get('cache-control'), 'no-store');
  assert.match(bootRes.headers.get('content-security-policy') ?? '', /default-src 'self'/);

  // Block SSRF against loopback / metadata IPs and non-http schemes
  for (const unsafeUrl of [
    'http://127.0.0.1:8080/admin',
    'http://localhost:3000/api/bootstrap',
    'http://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    'javascript:alert(1)'
  ]) {
    const ssrfRes = await fetch(`${baseUrl}/api/jobs/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test', company: 'Corp', url: unsafeUrl })
    });
    assert.equal(ssrfRes.status, 400);
  }

  // Block invalid agent slug / traversal attempt
  const badAgentRes = await fetch(`${baseUrl}/api/agents/..%2Fevil.sh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'malicious' })
  });
  assert.ok(badAgentRes.status === 400 || badAgentRes.status === 404);

  const nonMdAgentRes = await fetch(`${baseUrl}/api/agents/evil.js`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'malicious' })
  });
  assert.equal(nonMdAgentRes.status, 400);

  // Strip javascript: URLs from personal projects
  const xssProjRes = await fetch(`${baseUrl}/api/profile/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Safe Project',
      techStack: 'Docker',
      descriptionPt: 'Container security',
      url: 'javascript:alert(document.cookie)'
    })
  });
  const xssProjData = await xssProjRes.json();
  const safeProj = xssProjData.profile.personalProjects.find((p: { name: string }) => p.name === 'Safe Project');
  assert.equal(safeProj.url, '');

  // 11. Verify lizard/chameleon SVG favicon and clearing Vagas Abertas column
  const favRes = await fetch(`${baseUrl}/favicon.svg`);
  assert.equal(favRes.status, 200);
  const favSvg = await favRes.text();
  assert.ok(favSvg.includes('🦎'));

  const clearRes = await fetch(`${baseUrl}/api/jobs/clear-open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(clearRes.status, 200);
  const clearData = await clearRes.json();
  assert.ok(clearData.deletedCount >= 1);
  assert.equal(clearData.jobs.filter((j: { status: string }) => j.status === 'abertas').length, 0);

  // 12. Block Cross-Origin Drive-By CSRF POST requests from external origins
  const csrfRes = await fetch(`${baseUrl}/api/jobs/clear-open`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil-attacker.example.com'
    }
  });
  assert.equal(csrfRes.status, 403);

  // 13. Manually delete a specific job and clear "Sem Sucesso" column
  const jobToDeleteRes = await fetch(`${baseUrl}/api/jobs/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Vaga Para Deletar Manualmente',
      company: 'TempCorp',
      url: 'https://tempcorp.gupy.io/jobs/999',
      rawText: 'AWS, Docker, Terraform.'
    })
  });
  const jobToDelete = await jobToDeleteRes.json();
  const delRes = await fetch(`${baseUrl}/api/jobs/${jobToDelete.id}/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(delRes.status, 200);
  const delData = await delRes.json();
  assert.equal(delData.deleted, true);
  assert.equal(delData.jobs.some((j: { id: number }) => j.id === jobToDelete.id), false);

  // Add a job, move to sem_sucesso, and clear sem_sucesso
  const unsuccJobRes = await fetch(`${baseUrl}/api/jobs/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Vaga Sem Sucesso Teste',
      company: 'UnsuccCorp',
      url: 'https://unsucc.gupy.io/jobs/888',
      rawText: 'AWS, Docker.'
    })
  });
  const unsuccJob = await unsuccJobRes.json();
  await fetch(`${baseUrl}/api/jobs/${unsuccJob.id}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'sem_sucesso', reason: '' })
  });
  const clearUnsuccRes = await fetch(`${baseUrl}/api/jobs/clear-unsuccessful`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });
  assert.equal(clearUnsuccRes.status, 200);
  const clearUnsuccData = await clearUnsuccRes.json();
  assert.equal(clearUnsuccData.deletedCount, 1);
  assert.equal(clearUnsuccData.jobs.filter((j: { status: string }) => j.status === 'sem_sucesso').length, 0);
});

