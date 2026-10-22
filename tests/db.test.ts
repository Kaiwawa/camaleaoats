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
