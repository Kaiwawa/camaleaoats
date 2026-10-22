import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../src/db.ts';
import {
  buildSearchQueryFromProfile,
  collectRemoteDevOpsJobs,
  ingestJobFromUrlOrText,
  parseLinkedInGuestSearchHtml,
  runAutoApplication
} from '../src/scraper-and-applier.ts';

test('collectRemoteDevOpsJobs populates remote DevOps/SRE jobs in PT-BR and EN and scores them', async () => {
  const db = new AppDatabase(':memory:');
  const fakeFetch = async (url: string | URL) => {
    const u = String(url);
    if (u.includes('seeMoreJobPostings/search')) {
      return new Response(
        `<li>
          <div class="base-card" data-entity-urn="urn:li:jobPosting:991122">
            <a class="base-card__full-link" href="https://empresa.gupy.io/jobs/991122"></a>
            <h3 class="base-search-card__title">Engenheiro DevOps Pleno (Remoto)</h3>
            <h4 class="base-search-card__subtitle"><a>CloudBrasil Gupy</a></h4>
            <span class="job-search-card__location">Brasil (Remoto)</span>
          </div>
        </li>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    }
    if (u.includes('jobPosting/991122')) {
      return new Response(
        `<div class="show-more-less-html__markup">Vaga 100% remota na Gupy para Engenheiro DevOps Pleno com AWS SAA-C03, Docker, GitHub Actions, ArgoCD, Kubernetes YAML e Grafana.</div>`,
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    }
    return new Response(
      JSON.stringify({
        jobs: [
          {
            title: 'Remote DevOps Engineer (AWS / Docker / ArgoCD)',
            company_name: 'NuvemTech Global',
            url: 'https://nuvemtech.inhire.app/vagas/devops-remoto',
            candidate_required_location: 'Remote - Worldwide',
            description:
              'We are looking for a Remote DevOps Engineer with strong experience in AWS SAA-C03, Docker, GitHub Actions, ArgoCD, and Kubernetes YAML.'
          }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const result = await collectRemoteDevOpsJobs(db, fakeFetch as unknown as typeof fetch, {
    seniorityFilter: 'pleno',
    workMode: 'remoto_br'
  });
  assert.ok(result.total >= 2);
  const jobs = db.listJobs();
  assert.ok(jobs.some((j) => j.company === 'NuvemTech Global' && j.language === 'en'));
  assert.ok(jobs.some((j) => j.platform === 'Gupy'));
});

test('runAutoApplication handles Gupy mode (Apresente-se + Profile update script) vs InHire/Portal mode (PDF upload)', async () => {
  const db = new AppDatabase(':memory:');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'camaleao-apply-'));

  // 1. Gupy job
  const gupyJob = await ingestJobFromUrlOrText(db, {
    title: 'DevOps / SRE Pleno (100% Remoto)',
    company: 'TechBrasil',
    url: 'https://techbrasil.gupy.io/jobs/98765',
    rawText: 'Vaga 100% remota na Gupy. Requisitos: AWS SAA-C03, Docker, GitHub Actions, ArgoCD, Kubernetes YAML e Grafana.'
  });
  assert.equal(gupyJob.platform, 'Gupy');

  const gupyOutcome = await runAutoApplication(db, gupyJob.id, { dryRun: true, outputDir: tmpDir });
  assert.equal(gupyOutcome.mode, 'gupy_apresentese');
  assert.equal(gupyOutcome.movedTo, 'em_processo');
  const gupyScript = fs.readFileSync(gupyOutcome.playwrightScriptPath, 'utf8');
  assert.match(gupyScript, /Apresente-se/i);
  assert.ok(gupyOutcome.gupyKit.apresenteseText.length > 100);

  // 2. InHire job (PDF Upload mode)
  const inhireJob = await ingestJobFromUrlOrText(db, {
    title: 'Cloud & DevOps Engineer (Remoto)',
    company: 'ScaleCloud',
    url: 'https://scalecloud.inhire.app/vagas/555',
    rawText: 'Vaga 100% remota. Requisitos: AWS, Docker, GitHub Actions, ArgoCD e Terraform.'
  });
  assert.equal(inhireJob.platform, 'InHire');

  const inhireOutcome = await runAutoApplication(db, inhireJob.id, { dryRun: true, outputDir: tmpDir });
  assert.equal(inhireOutcome.mode, 'pdf_upload');
  assert.equal(inhireOutcome.movedTo, 'em_processo');
  assert.ok(fs.existsSync(inhireOutcome.pdfPath));
  const inhireScript = fs.readFileSync(inhireOutcome.playwrightScriptPath, 'utf8');
  assert.match(inhireScript, /setInputFiles/);
});

test('parseLinkedInGuestSearchHtml extracts live job cards and buildSearchQueryFromProfile uses profile skills and seniority', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();
  const query = buildSearchQueryFromProfile(profile, 'pleno', 'remoto_br');
  assert.match(query.keywords, /DevOps/i);
  assert.equal(query.location, 'Brazil');
  assert.equal(query.remoteFilter, '2');

  const sampleLinkedInHtml = `
    <li>
      <div class="base-card" data-entity-urn="urn:li:jobPosting:4472438911">
        <a class="base-card__full-link" href="https://br.linkedin.com/jobs/view/devops-pleno-at-serasa-experian-4472438911?position=1"></a>
        <h3 class="base-search-card__title">DevOps Pleno (AWS / Docker)</h3>
        <h4 class="base-search-card__subtitle"><a>Serasa Experian</a></h4>
        <span class="job-search-card__location">São Paulo, Brasil (Remoto)</span>
      </div>
    </li>
  `;

  const parsed = parseLinkedInGuestSearchHtml(sampleLinkedInHtml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].jobId, '4472438911');
  assert.equal(parsed[0].title, 'DevOps Pleno (AWS / Docker)');
  assert.equal(parsed[0].company, 'Serasa Experian');
});

