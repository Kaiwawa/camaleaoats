import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppDatabase } from '../src/db.ts';

test('seed initializes real bilingual DevOps profile with AWS SAA-C03, Docker, ArgoCD and YAML K8s', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();
  assert.ok(profile.certifications.includes('AWS Certified Solutions Architect - Associate (SAA-C03)'));
  const docker = profile.skills.find((s) => s.name === 'Docker');
  const k8s = profile.skills.find((s) => s.name === 'Kubernetes');
  assert.equal(docker?.level, 'solid');
  assert.equal(k8s?.level, 'evolving');
  assert.match(k8s?.honestFramingPt ?? '', /YAML/i);
  assert.match(k8s?.honestFramingEn ?? '', /YAML/i);
});

test('evolving skills recalculates targetSeniority upward in PT-BR and EN', () => {
  const db = new AppDatabase(':memory:');
  const before = db.getProfile();
  assert.equal(before.targetSeniority, 'Júnior Avançado / Pleno');

  const k8s = before.skills.find((s) => s.name === 'Kubernetes')!;
  const terraform = before.skills.find((s) => s.name === 'Terraform')!;
  db.evolveSkill(k8s.id, {
    level: 'solid',
    honestFramingPt: 'Administração de clusters Kubernetes, Helm e GitOps com ArgoCD',
    honestFramingEn: 'Kubernetes cluster administration, Helm and GitOps with ArgoCD'
  });
  const after = db.evolveSkill(terraform.id, {
    level: 'solid',
    honestFramingPt: 'Módulos Terraform em produção multi-ambiente',
    honestFramingEn: 'Production multi-environment Terraform modules'
  });
  assert.equal(after.targetSeniority, 'Pleno / Sênior Inicial');
  assert.equal(after.targetSeniorityEn, 'Mid-Level / Early Senior');
});

test('test_upsert_job_deduplicates_and_preserves_kanban_status', () => {
  const db = new AppDatabase(':memory:');
  const created = db.upsertJob({
    title: 'DevOps Engineer Remoto',
    company: 'CloudCorp',
    url: 'https://empresa.inhire.app/vagas/123',
    platform: 'InHire',
    location: '100% Remoto',
    description: 'Vaga com AWS, Docker, ArgoCD e Kubernetes YAML.'
  });
  db.moveJob(created.id, 'em_processo');
  db.updateRecruiterTracker(created.id, { recruiterName: 'Ana RH', recruiterStatus: 'aguardando_aceite' });

  const duplicate = db.upsertJob({
    title: 'DevOps Engineer Remoto',
    company: 'CloudCorp',
    url: 'https://empresa.inhire.app/vagas/123',
    platform: 'InHire',
    location: '100% Remoto',
    description: 'Vaga atualizada com AWS, Docker, ArgoCD e Kubernetes YAML.'
  });

  assert.equal(duplicate.id, created.id);
  assert.equal(duplicate.status, 'em_processo');
  assert.equal(duplicate.recruiterStatus, 'aguardando_aceite');
  assert.equal(db.listJobs().length, 1);
});

test('moving job to ruins records negative preference weights', () => {
  const db = new AppDatabase(':memory:');
  const job = db.upsertJob({
    title: 'Especialista DevOps Sênior Presencial',
    company: 'LegacyBank',
    url: 'https://gupy.io/job/999',
    platform: 'Gupy',
    location: 'Híbrido São Paulo',
    description: 'Trabalho híbrido presencial exigindo Java legado e Windows Server.'
  });
  db.moveJob(job.id, 'ruins', 'Híbrido / Presencial');
  const weights = db.getPreferenceWeights();
  assert.ok((weights['hibrido'] ?? 0) < 0 || (weights['presencial'] ?? 0) < 0);
});

test('separates certifications (without seniority level), educations, personal projects, settings and agent MDs', () => {
  const db = new AppDatabase(':memory:');
  db.addCertification({ name: 'HashiCorp Certified: Terraform Associate', issuer: 'HashiCorp', year: '2026' });
  db.addEducation({
    course: 'Análise e Desenvolvimento de Sistemas',
    institution: 'FIAP',
    degree: 'Tecnólogo (Graduação)',
    status: 'Concluído',
    year: '2024'
  });
  db.addPersonalProject({
    name: 'Homelab GitOps Cluster',
    techStack: ['Kubernetes', 'Kind', 'ArgoCD', 'Docker'],
    descriptionPt: 'Cluster Kubernetes local provisionado com Kind e entrega contínua via ArgoCD.',
    descriptionEn: 'Local Kubernetes cluster provisioned with Kind and GitOps continuous delivery via ArgoCD.'
  });

  const profile = db.getProfile();
  const tfCert = profile.certificationItems.find((c) => c.name.includes('Terraform Associate'));
  assert.ok(tfCert);
  assert.equal('level' in (tfCert as unknown as Record<string, unknown>), false);
  assert.ok(profile.educations.some((e) => e.institution === 'FIAP'));
  assert.ok(profile.personalProjects.some((p) => p.name === 'Homelab GitOps Cluster'));

  const agents = db.listAgentPrompts();
  assert.ok(agents.some((a) => a.slug === 'cv-adapter.md'));
  db.updateAgentPrompt('cv-adapter.md', '# Custom Agent Rule\nNever hallucinate.');
  assert.equal(
    db.listAgentPrompts().find((a) => a.slug === 'cv-adapter.md')?.content,
    '# Custom Agent Rule\nNever hallucinate.'
  );

  const settings = db.updateSettings({ aiProvider: 'openai', apiKey: 'sk-test-123', theme: 'light' });
  assert.equal(settings.aiProvider, 'openai');
  assert.equal(settings.theme, 'light');
});

