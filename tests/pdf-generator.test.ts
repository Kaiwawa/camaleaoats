import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppDatabase } from '../src/db.ts';
import { generateHonestTailoredCv } from '../src/ats-engine.ts';
import { generateAtsPdfBuffer } from '../src/pdf-generator.ts';

test('test_pdf_preserves_portuguese_accents_and_valid_header', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();
  const cv = generateHonestTailoredCv(
    {
      title: 'Engenheiro DevOps & Automação',
      company: 'Soluções Cloud Brasil',
      description: 'Certificação AWS SAA-C03, Docker, Integração Contínua com GitHub Actions, ArgoCD e Kubernetes YAML.'
    },
    profile,
    'pt-BR'
  );

  const pdfBuffer = generateAtsPdfBuffer(cv, profile);
  const raw = pdfBuffer.toString('latin1');

  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.ok(raw.includes('/WinAnsiEncoding'));
  assert.ok(raw.includes('AWS'));
  assert.ok(raw.includes('SAA-C03'));
  assert.ok(raw.includes('Certifica'));
  assert.ok(raw.includes('%%EOF'));
});

test('generates English ATS PDF when language is en', () => {
  const db = new AppDatabase(':memory:');
  const profile = db.getProfile();
  const cv = generateHonestTailoredCv(
    {
      title: 'Remote DevOps Engineer',
      company: 'GlobalScale',
      description: 'Looking for AWS SAA-C03, Docker, GitHub Actions, ArgoCD, and Kubernetes YAML.'
    },
    profile,
    'en'
  );

  const pdfBuffer = generateAtsPdfBuffer(cv, profile);
  const raw = pdfBuffer.toString('latin1');

  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.ok(raw.includes('PROFESSIONAL SUMMARY'));
  assert.ok(raw.includes('CERTIFICATIONS'));
  assert.ok(raw.includes('%%EOF'));
});
