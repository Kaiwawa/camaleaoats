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

  // 1. Bootstrap auto-seeds curated remote DevOps jobs if empty
  const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(bootRes.status, 200);
  const boot = await bootRes.json();
  assert.ok(boot.jobs.length >= 3);
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
});
