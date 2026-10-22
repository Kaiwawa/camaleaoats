import fs from 'node:fs';
import path from 'node:path';
import type { AppDatabase } from './db.ts';
import type { GupyKit, Job, Language, NewJobInput } from './types.ts';
import {
  analyzeAndHighlightJob,
  detectJobLanguage,
  generateHonestTailoredCv,
  generateRecruiterMessages
} from './ats-engine.ts';
import { generateAtsPdfBuffer } from './pdf-generator.ts';

function detectPlatformFromUrl(url: string): string {
  const lower = (url || '').toLowerCase();
  if (lower.includes('gupy.io')) return 'Gupy';
  if (lower.includes('inhire.app') || lower.includes('inhire.com')) return 'InHire';
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('mailto:')) return 'E-mail Direto';
  if (lower.includes('greenhouse.io')) return 'Greenhouse';
  if (lower.includes('lever.co')) return 'Lever';
  return 'Portal / Direto';
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const CURATED_REMOTE_DEVOPS_JOBS: NewJobInput[] = [
  {
    title: 'DevOps Engineer Jr / Pleno (100% Remoto)',
    company: 'CloudPulse Brasil',
    url: 'https://cloudpulse.inhire.app/vagas/devops-aws-argocd-remoto',
    platform: 'InHire',
    location: '100% Remoto (Brasil)',
    language: 'pt-BR',
    recruiterName: 'Camila Rocha (Tech Recruiter)',
    recruiterEmail: 'talentos@cloudpulse.com.br',
    description: [
      'Sobre a oportunidade: Buscamos pessoa engenheira DevOps (100% Remoto) para atuar na evolução da nossa infraestrutura Cloud e automação de deploys.',
      'Requisitos principais:',
      '- Experiência sólida com containers Docker e criação de imagens multi-stage;',
      '- Vivência prática em nuvem AWS (EC2, VPC, IAM, S3, CloudWatch) — Certificação AWS SAA-C03 é grande diferencial;',
      '- Automação de esteiras CI/CD utilizando Git e GitHub Actions;',
      '- Entrega contínua e fluxos GitOps com ArgoCD;',
      '- Escrita e manutenção de manifestos YAML para Kubernetes (Deployments, Services, ConfigMaps, Ingress);',
      '- Desejável conhecimento em Terraform, Ansible e observabilidade com Grafana.'
    ].join('\n')
  },
  {
    title: 'Analista SRE / DevOps Cloud (100% Remoto)',
    company: 'PagFácil Tecnologia',
    url: 'https://pagfacil.gupy.io/jobs/8841209',
    platform: 'Gupy',
    location: '100% Remoto',
    language: 'pt-BR',
    recruiterName: 'Lucas Mendes (Tech Recruiter)',
    description: [
      'Na PagFácil nosso time de plataforma trabalha 100% remoto garantindo a confiabilidade dos serviços financeiros.',
      'O que você vai fazer e o que buscamos no seu perfil Gupy:',
      '- Sustentação de ambientes em Cloud AWS (arquitetura resiliente, IAM, VPC, S3, EC2);',
      '- Containerização de microsserviços com Docker;',
      '- Criação de pipelines de integração e entrega contínua (CI/CD com GitHub Actions e GitOps com ArgoCD);',
      '- Apoio na configuração de recursos Kubernetes via manifestos YAML;',
      '- Monitoramento e criação de dashboards de observabilidade em Grafana;',
      '- Automação de infraestrutura como código com Terraform e Ansible.'
    ].join('\n')
  },
  {
    title: 'DevSecOps / Cloud Infrastructure Engineer (Consultoria - Remoto)',
    company: 'KubeWorks Consultoria',
    url: 'mailto:vagas-devops@kubeworks.io?subject=Vaga%20DevSecOps%20Remoto',
    platform: 'E-mail Direto',
    location: '100% Remoto',
    language: 'pt-BR',
    recruiterName: 'Renata Tavares (Head de Hunting)',
    recruiterEmail: 'vagas-devops@kubeworks.io',
    description: [
      'Contratamos urgente para projeto 100% remoto! Processo ágil com entrevista direta com nossa recrutadora e líder técnico.',
      'Stack do projeto:',
      '- Cloud AWS (certificação AWS Solutions Architect SAA-C03 conta muitos pontos) e projetos multi-cloud (Azure / GCP / OCI);',
      '- Domínio de Docker, Git e esteiras CI/CD com GitHub Actions;',
      '- Deploys automatizados usando ArgoCD e manifestos YAML no Kubernetes;',
      '- Facilidade de aprendizado rápido para atuar com Ansible, Terraform e Grafana.'
    ].join('\n')
  },
  {
    title: 'Remote DevOps / SRE Engineer (LATAM - 100% Remote)',
    company: 'NimbleStack IO',
    url: 'https://nimblestack.inhire.app/jobs/remote-devops-latam',
    platform: 'InHire',
    location: '100% Remote (LATAM)',
    language: 'en',
    recruiterName: 'Sarah Jenkins (Senior Tech Recruiter)',
    recruiterEmail: 'careers@nimblestack.io',
    description: [
      'We are looking for an adaptable Remote DevOps / SRE Engineer in LATAM to join our cloud platform team.',
      'Requirements & Stack:',
      '- Strong hands-on experience with Docker containerization and Git workflows;',
      '- AWS cloud architecture knowledge (AWS Certified Solutions Architect Associate SAA-C03 is a strong plus) and willingness to work with GCP or Azure;',
      '- Building automated CI/CD pipelines using GitHub Actions and GitOps continuous delivery with ArgoCD;',
      '- Writing and maintaining Kubernetes YAML manifests;',
      '- Familiarity with Infrastructure as Code (Terraform, Ansible) and observability dashboards with Grafana.'
    ].join('\n')
  }
];

export async function collectRemoteDevOpsJobs(
  db: AppDatabase,
  fetchImpl: typeof fetch = fetch
): Promise<{ added: number; total: number; jobs: Job[] }> {
  const beforeCount = db.listJobs().length;
  const profile = db.getProfile();
  const weights = db.getPreferenceWeights();

  const candidates: NewJobInput[] = [...CURATED_REMOTE_DEVOPS_JOBS];

  try {
    const resp = await fetchImpl('https://remotive.com/api/remote-jobs?category=devops-sysadmin&limit=8', {
      headers: { 'user-agent': 'CamaleaoATS/1.0' }
    });
    if (resp.ok) {
      const payload = (await resp.json()) as {
        jobs?: Array<{
          title?: string;
          company_name?: string;
          url?: string;
          candidate_required_location?: string;
          description?: string;
        }>;
      };
      for (const item of (payload.jobs || []).slice(0, 6)) {
        if (!item.title || !item.company_name || !item.url) continue;
        const cleanDesc = stripHtmlTags(item.description || '');
        candidates.push({
          title: item.title,
          company: item.company_name,
          url: item.url,
          platform: detectPlatformFromUrl(item.url),
          location: item.candidate_required_location || '100% Remote',
          description: cleanDesc || item.title
        });
      }
    }
  } catch {
    // Offline or blocked external feed — curated jobs still populate
  }

  for (const cand of candidates) {
    const lang = cand.language ?? detectJobLanguage(`${cand.title} ${cand.description}`);
    const analysis = analyzeAndHighlightJob(
      {
        title: cand.title,
        company: cand.company,
        location: cand.location || '100% Remoto',
        description: cand.description
      },
      profile,
      weights
    );

    db.upsertJob({
      ...cand,
      platform: cand.platform || detectPlatformFromUrl(cand.url),
      language: lang,
      matchScore: analysis.matchScore
    });
  }

  const allJobs = db.listJobs();
  return {
    added: Math.max(0, allJobs.length - beforeCount),
    total: allJobs.length,
    jobs: allJobs
  };
}

export async function ingestJobFromUrlOrText(
  db: AppDatabase,
  input: {
    url?: string;
    rawText?: string;
    title?: string;
    company?: string;
    location?: string;
    recruiterName?: string;
    recruiterUrl?: string;
    recruiterEmail?: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<Job> {
  const url = (input.url || '').trim();
  let description = (input.rawText || '').trim();
  let title = (input.title || '').trim();
  const company = (input.company || '').trim() || 'Empresa Remota';

  if (url && !description) {
    try {
      const resp = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 CamaleaoATS' } });
      if (resp.ok) {
        const html = await resp.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (!title && titleMatch) {
          title = titleMatch[1].trim();
        }
        description = stripHtmlTags(html).slice(0, 4000);
      }
    } catch {
      // Fallback if URL requires login or blocks fetch
    }
  }

  if (!title) {
    title = 'DevOps / SRE Engineer (Remoto)';
  }
  if (!description) {
    description = `Vaga remota de ${title} na ${company} (Stack: Cloud AWS, Docker, CI/CD, GitHub Actions, ArgoCD, Kubernetes YAML).`;
  }

  const profile = db.getProfile();
  const weights = db.getPreferenceWeights();
  const lang = detectJobLanguage(`${title} ${description}`);
  const analysis = analyzeAndHighlightJob(
    {
      title,
      company,
      location: input.location || '100% Remoto',
      description
    },
    profile,
    weights
  );

  return db.upsertJob({
    title,
    company,
    url: url || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title + ' ' + company)}`,
    platform: detectPlatformFromUrl(url),
    location: input.location || '100% Remoto',
    description,
    language: lang,
    matchScore: analysis.matchScore,
    recruiterName: input.recruiterName,
    recruiterUrl: input.recruiterUrl,
    recruiterEmail: input.recruiterEmail
  });
}

export async function runAutoApplication(
  db: AppDatabase,
  jobId: number,
  options: { dryRun?: boolean; outputDir?: string; lang?: Language } = {}
): Promise<{
  mode: 'gupy_apresentese' | 'pdf_upload';
  movedTo: 'em_processo';
  pdfPath: string;
  playwrightScriptPath: string;
  gupyKit: GupyKit;
  stepsExecuted: string[];
}> {
  const job = db.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const profile = db.getProfile();
  const targetLang = options.lang ?? job.language;
  const tailoredCv = generateHonestTailoredCv(job, profile, targetLang);
  const analysis = analyzeAndHighlightJob(job, profile, db.getPreferenceWeights());
  const recruiterMsgs = generateRecruiterMessages(job, profile, analysis.strongMatches, targetLang);

  const outDir = options.outputDir || path.join(process.cwd(), 'data', 'applications');
  fs.mkdirSync(outDir, { recursive: true });

  const safeSlug = `${job.company}-${job.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfPath = path.join(outDir, `CV-${safeSlug}-${targetLang}.pdf`);
  const pdfBuffer = generateAtsPdfBuffer(tailoredCv, profile);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const isGupy = job.platform.toLowerCase() === 'gupy' || job.url.toLowerCase().includes('gupy.io');
  const playwrightScriptPath = path.join(outDir, `auto-apply-${safeSlug}.mjs`);
  const stepsExecuted: string[] = [];

  if (isGupy) {
    const gupyScript = `// Auto-generated Playwright Gupy Runner for Job #${job.id} (${job.title} @ ${job.company})
import { chromium } from 'playwright';

const userDataDir = process.env.CAMALEAO_BROWSER_PROFILE || './data/browser-session';
const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
const page = await context.newPage();

await page.goto(${JSON.stringify(job.url)});

// Gupy Mode: Na Gupy não há upload de PDF por vaga; preenchemos o campo "Apresente-se" e apoiamos o ajuste do currículo pré-cadastrado
const apresenteseText = ${JSON.stringify(tailoredCv.gupyKit.apresenteseText)};
const textareaSelectors = [
  'textarea[name*="apresente" i]',
  'textarea[placeholder*="apresente" i]',
  'textarea[aria-label*="Apresente-se" i]',
  'textarea'
];

for (const sel of textareaSelectors) {
  const loc = page.locator(sel).first();
  if (await loc.count() > 0) {
    await loc.fill(apresenteseText);
    break;
  }
}

console.log('Texto Apresente-se preenchido com sucesso na Gupy! Revise e clique em Finalizar candidatura.');
`;
    fs.writeFileSync(playwrightScriptPath, gupyScript, 'utf8');
    stepsExecuted.push(
      'Modo Gupy ativado: Gerado texto "Apresente-se" calibrado com as palavras-chave da vaga para a IA Gaia.',
      'Gerados os blocos de Resumo e Experiências para atualizar o CV pré-cadastrado na Gupy.',
      `Script Playwright Gupy salvo em ${playwrightScriptPath}.`,
      'Card da vaga movido automaticamente para a coluna "Em Processo".'
    );
  } else {
    const portalScript = `// Auto-generated Playwright Portal Runner (InHire / LinkedIn / Career Site) for Job #${job.id}
import { chromium } from 'playwright';

const userDataDir = process.env.CAMALEAO_BROWSER_PROFILE || './data/browser-session';
const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
const page = await context.newPage();

await page.goto(${JSON.stringify(job.url)});

const fileInput = page.locator('input[type="file"]').first();
if (await fileInput.count() > 0) {
  await fileInput.setInputFiles(${JSON.stringify(pdfPath)});
}

const nameInput = page.locator('input[name*="name" i], input[placeholder*="nome" i]').first();
if (await nameInput.count() > 0) await nameInput.fill(${JSON.stringify(profile.name)});

const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
if (await emailInput.count() > 0) await emailInput.fill(${JSON.stringify(profile.email)});

const msgArea = page.locator('textarea').first();
if (await msgArea.count() > 0) await msgArea.fill(${JSON.stringify(recruiterMsgs.postAcceptDm)});

console.log('PDF ATS anexado e campos preenchidos! Revise e confirme o envio.');
`;
    fs.writeFileSync(playwrightScriptPath, portalScript, 'utf8');
    stepsExecuted.push(
      `PDF otimizado para ATS (${targetLang}) gerado em ${pdfPath}.`,
      `Script Playwright de preenchimento e upload (${job.platform}) salvo em ${playwrightScriptPath}.`,
      'Card da vaga movido automaticamente para a coluna "Em Processo".'
    );
  }

  db.moveJob(jobId, 'em_processo');

  return {
    mode: isGupy ? 'gupy_apresentese' : 'pdf_upload',
    movedTo: 'em_processo',
    pdfPath,
    playwrightScriptPath,
    gupyKit: tailoredCv.gupyKit,
    stepsExecuted
  };
}
