import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppDatabase } from '../src/db.ts';
import {
  analyzeAndHighlightJob,
  detectJobLanguage,
  generateHonestTailoredCv,
  generateRecruiterMessages,
  ANTI_HALLUCINATION_SYSTEM_PROMPT
} from '../src/ats-engine.ts';

test('detectJobLanguage identifies pt-BR and en job descriptions accurately', () => {
  assert.equal(
    detectJobLanguage('We are looking for a Remote DevOps Engineer with strong experience in AWS, Docker and Kubernetes.'),
    'en'
  );
  assert.equal(
    detectJobLanguage('Buscamos pessoa engenheira DevOps para vaga 100% remota com experiência em AWS, Docker e ArgoCD.'),
    'pt-BR'
  );
});

test('test_highlight_escapes_html_before_marking', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();
  const analysis = analyzeAndHighlightJob(
    {
      title: 'DevOps AWS',
      company: 'Acme',
      location: 'Remoto',
      description: '<script>alert(1)</script> Experiência sólida em Docker, AWS, ArgoCD e manifestos Kubernetes YAML.'
    },
    profile
  );

  assert.ok(!analysis.highlightedHtml.includes('<script>'));
  assert.ok(analysis.highlightedHtml.includes('&lt;script&gt;'));
  assert.ok(analysis.highlightedHtml.includes('class="match-strong"'));
  assert.ok(analysis.highlightedHtml.includes('class="match-evolving"'));
  assert.ok(analysis.strongMatches.includes('Docker'));
  assert.ok(analysis.evolvingMatches.includes('Kubernetes'));
});

test('test_adapt_cv_and_gupy_apresentese_never_hallucinate_in_pt_and_en', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();

  const cvPt = generateHonestTailoredCv(
    {
      title: 'Engenheiro SRE Sênior',
      company: 'MegaCloud',
      description: 'Exige 7 anos de experiência como Administrador Sênior de Cluster Kubernetes em produção, certificação CKA, GCP, Docker, AWS e ArgoCD.'
    },
    profile,
    'pt-BR'
  );

  const fullTextPt = [cvPt.summary, ...cvPt.highlights, ...cvPt.experienceBullets, cvPt.gupyKit.apresenteseText].join(' ');
  assert.match(fullTextPt, /AWS.*SAA-C03/i);
  assert.match(fullTextPt, /Docker/i);
  assert.match(fullTextPt, /ArgoCD/i);
  assert.match(fullTextPt, /YAML/i);
  assert.doesNotMatch(fullTextPt, /7 anos.*Kubernetes/i);
  assert.doesNotMatch(fullTextPt, /certifica[çc][ãa]o CKA/i);
  assert.ok(cvPt.gupyKit.apresenteseText.length > 120);
  assert.ok(cvPt.gupyKit.profileSummaryToUpdate.length > 60);
  assert.ok(cvPt.gupyKit.skillsTagsToAdd.includes('Docker'));

  const cvEn = generateHonestTailoredCv(
    {
      title: 'Senior DevOps / SRE Engineer',
      company: 'GlobalTech',
      description: 'Requires 7+ years of production Kubernetes cluster administration, CKA certification, Azure, Docker, AWS and ArgoCD.'
    },
    profile,
    'en'
  );

  const fullTextEn = [cvEn.summary, ...cvEn.highlights, ...cvEn.experienceBullets, cvEn.gupyKit.apresenteseText].join(' ');
  assert.equal(cvEn.language, 'en');
  assert.match(fullTextEn, /AWS.*SAA-C03/i);
  assert.match(fullTextEn, /YAML/i);
  assert.doesNotMatch(fullTextEn, /7\+ years.*Kubernetes/i);
  assert.match(ANTI_HALLUCINATION_SYSTEM_PROMPT, /proibido inventar/i);
});

test('test_invite_note_never_exceeds_200_chars_with_long_names', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();

  const msgsPt = generateRecruiterMessages(
    {
      title: 'Engenheiro Especialista DevOps / SRE / DevSecOps Multi-Cloud Internacional Remoto',
      company: 'Consultoria Global de Transformação Digital e Soluções Financeiras Enterprise S/A',
      recruiterName: 'Fernanda Albuquerque Soares'
    },
    profile,
    ['AWS SAA-C03', 'Docker', 'GitHub Actions', 'ArgoCD'],
    'pt-BR'
  );

  assert.ok(msgsPt.inviteNote.length <= 200, `PT expected <= 200, got ${msgsPt.inviteNote.length}`);
  assert.equal(msgsPt.inviteCharCount, msgsPt.inviteNote.length);
  assert.ok(msgsPt.postAcceptDm.length > 200);

  const msgsEn = generateRecruiterMessages(
    {
      title: 'Staff Principal DevOps Cloud Infrastructure & Site Reliability Engineer Remote',
      company: 'International Enterprise Digital Transformation Holdings Corporation Ltd',
      recruiterName: 'Christopher Montgomery'
    },
    profile,
    ['AWS SAA-C03', 'Docker', 'GitHub Actions', 'ArgoCD'],
    'en'
  );

  assert.ok(msgsEn.inviteNote.length <= 200, `EN expected <= 200, got ${msgsEn.inviteNote.length}`);
  assert.equal(msgsEn.inviteCharCount, msgsEn.inviteNote.length);
  assert.ok(msgsEn.postAcceptDm.length > 200);
});

test('test_gupy_apresentese_reflects_evolved_kubernetes_framing', () => {
  const db = new AppDatabase(':memory:');
  const before = db.getProfile();
  const k8s = before.skills.find((s) => s.name === 'Kubernetes')!;
  const evolvedProfile = db.evolveSkill(k8s.id, {
    level: 'solid',
    honestFramingPt: 'Administração avançada de clusters Kubernetes multi-node, Helm charts e operadores GitOps',
    honestFramingEn: 'Advanced multi-node Kubernetes cluster administration, Helm charts, and GitOps operators'
  });

  const cvPt = generateHonestTailoredCv(
    {
      title: 'Engenheiro SRE Pleno',
      company: 'GupyTech',
      description: 'Vaga na Gupy para Kubernetes, Docker e AWS.'
    },
    evolvedProfile,
    'pt-BR'
  );

  assert.match(cvPt.gupyKit.apresenteseText, /Administra[çc][ãa]o avan[çc]ada de clusters Kubernetes multi-node/i);
});

