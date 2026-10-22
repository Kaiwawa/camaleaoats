import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Job,
  KanbanStatus,
  Language,
  NewJobInput,
  Profile,
  RecruiterStatus,
  Skill,
  SkillLevel
} from './types.ts';

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export class AppDatabase {
  private db: DatabaseSync;

  constructor(dbPath = path.join(process.cwd(), 'data', 'camaleao.db')) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        title_pt TEXT NOT NULL,
        title_en TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        linkedin TEXT NOT NULL,
        github TEXT NOT NULL,
        location_pt TEXT NOT NULL,
        location_en TEXT NOT NULL,
        base_summary_pt TEXT NOT NULL,
        base_summary_en TEXT NOT NULL,
        certifications_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        honest_framing_pt TEXT NOT NULL,
        honest_framing_en TEXT NOT NULL,
        project_note TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        url TEXT NOT NULL,
        dedup_key TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'pt-BR',
        status TEXT NOT NULL DEFAULT 'abertas',
        reject_reason TEXT DEFAULT '',
        match_score INTEGER NOT NULL DEFAULT 75,
        recruiter_name TEXT NOT NULL DEFAULT '',
        recruiter_url TEXT NOT NULL DEFAULT '',
        recruiter_email TEXT NOT NULL DEFAULT '',
        recruiter_status TEXT NOT NULL DEFAULT 'nao_enviado',
        applied_at TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS preference_weights (
        token TEXT PRIMARY KEY,
        weight INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  private seedIfEmpty(): void {
    const existing = this.db.prepare('SELECT id FROM profile WHERE id = 1').get();
    if (existing) return;

    const certs = ['AWS Certified Solutions Architect - Associate (SAA-C03)'];
    this.db
      .prepare(
        `INSERT INTO profile (
          id, name, title_pt, title_en, email, phone, linkedin, github,
          location_pt, location_en, base_summary_pt, base_summary_en, certifications_json
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'Seu Nome (DevOps / Cloud / SRE)',
        'DevOps Engineer | Cloud AWS (SAA-C03) | CI/CD & Containers',
        'DevOps Engineer | AWS Certified (SAA-C03) | CI/CD & Containers',
        'seu.email@exemplo.com',
        '+55 (11) 99999-9999',
        'https://www.linkedin.com/in/seu-perfil',
        'https://github.com/seu-usuario',
        'Brasil (100% Remoto)',
        'Brazil (100% Remote)',
        'Profissional DevOps com certificação AWS Solutions Architect Associate (SAA-C03), forte domínio em Docker, automação de esteiras CI/CD com GitHub Actions e entrega contínua GitOps com ArgoCD. Curva de aprendizado acelerada e alta adaptabilidade entre provedores Cloud e ferramentas de infraestrutura.',
        'DevOps Engineer holding the AWS Solutions Architect Associate (SAA-C03) certification, with strong hands-on expertise in Docker containerization, CI/CD pipelines using GitHub Actions, and GitOps continuous delivery with ArgoCD. Fast learner with high adaptability across cloud providers and infrastructure stacks.',
        JSON.stringify(certs)
      );

    const initialSkills: Omit<Skill, 'id'>[] = [
      {
        name: 'Docker',
        category: 'Containers',
        level: 'solid',
        keywords: ['docker', 'dockerfile', 'containers', 'containerizacao', 'containerization', 'docker-compose', 'multi-stage'],
        honestFramingPt: 'Forte experiência na criação e otimização de imagens Docker (multi-stage builds), padronização de ambientes em containers, Docker Compose e troubleshooting de aplicações containerizadas.',
        honestFramingEn: 'Strong hands-on experience building and optimizing Docker images (multi-stage builds), standardizing containerized environments, Docker Compose, and container troubleshooting.'
      },
      {
        name: 'AWS (SAA-C03)',
        category: 'Cloud',
        level: 'solid',
        keywords: ['aws', 'amazon web services', 'saa-c03', 'ec2', 's3', 'iam', 'vpc', 'rds', 'cloudwatch', 'route53', 'alb', 'cloud'],
        honestFramingPt: 'Certificado AWS Certified Solutions Architect – Associate (SAA-C03), com domínio da arquitetura de serviços core (EC2, VPC, IAM, S3, RDS, CloudWatch) e práticas de segurança, resiliência e otimização de custos em nuvem.',
        honestFramingEn: 'AWS Certified Solutions Architect – Associate (SAA-C03), skilled in core cloud architecture (EC2, VPC, IAM, S3, RDS, CloudWatch) as well as cloud security, high availability, and cost optimization.'
      },
      {
        name: 'Git & GitHub Actions',
        category: 'CI/CD',
        level: 'practical',
        keywords: ['git', 'github', 'github actions', 'ci/cd', 'cicd', 'pipelines', 'esteira', 'continuous integration', 'continuous delivery', 'gitlab ci', 'jenkins', 'azure devops'],
        honestFramingPt: 'Construção e manutenção de pipelines de CI/CD automatizadas com GitHub Actions e versionamento Git (build, testes, análise e deploy de imagens Docker), com rápida adaptação a outras plataformas de CI/CD.',
        honestFramingEn: 'Building and maintaining automated CI/CD pipelines with GitHub Actions and Git workflows (automated builds, testing, and Docker image delivery), with rapid adaptability to other CI/CD platforms.'
      },
      {
        name: 'ArgoCD',
        category: 'GitOps',
        level: 'practical',
        keywords: ['argocd', 'argo cd', 'gitops', 'continuous deployment', 'entrega continua'],
        honestFramingPt: 'Implementação e operação de fluxos GitOps e entrega contínua utilizando ArgoCD sincronizado a repositórios Git para automação declarativa de deploys.',
        honestFramingEn: 'Implementing and operating GitOps continuous delivery workflows using ArgoCD synced with Git repositories for declarative deployment automation.'
      },
      {
        name: 'Kubernetes',
        category: 'Orquestração',
        level: 'evolving',
        keywords: ['kubernetes', 'k8s', 'yaml', 'manifestos', 'manifests', 'pods', 'deployments', 'services', 'ingress', 'kind', 'eks', 'aks', 'gke'],
        honestFramingPt: 'Escrita e manutenção de manifestos YAML para Kubernetes (Deployments, Services, ConfigMaps, Secrets, Ingress) integrados a fluxos GitOps com ArgoCD e containerização Docker.',
        honestFramingEn: 'Authoring and maintaining Kubernetes YAML manifests (Deployments, Services, ConfigMaps, Secrets, Ingress) integrated with ArgoCD GitOps workflows and Docker containers.'
      },
      {
        name: 'Terraform',
        category: 'IaC',
        level: 'evolving',
        keywords: ['terraform', 'iac', 'infraestrutura como codigo', 'infrastructure as code', 'hcl'],
        honestFramingPt: 'Provisionamento declarativo de recursos em nuvem utilizando Infraestrutura como Código (Terraform / HCL) integrado ao controle de versão.',
        honestFramingEn: 'Declarative cloud resource provisioning using Infrastructure as Code (Terraform / HCL) integrated with version control.'
      },
      {
        name: 'Ansible',
        category: 'Configuração',
        level: 'evolving',
        keywords: ['ansible', 'playbooks', 'automacao', 'configuracao', 'configuration management', 'linux'],
        honestFramingPt: 'Automação de configuração e padronização de servidores Linux utilizando playbooks e roles em Ansible.',
        honestFramingEn: 'Server configuration automation and Linux standardization using Ansible playbooks and roles.'
      },
      {
        name: 'Grafana & Observabilidade',
        category: 'Observabilidade',
        level: 'evolving',
        keywords: ['grafana', 'observabilidade', 'observability', 'prometheus', 'monitoramento', 'monitoring', 'dashboards', 'alertas', 'sre'],
        honestFramingPt: 'Configuração de dashboards e visualização de métricas de infraestrutura e aplicações com Grafana para monitoramento e observabilidade.',
        honestFramingEn: 'Configuring infrastructure and application metrics dashboards with Grafana to support monitoring and observability.'
      }
    ];

    const insertSkill = this.db.prepare(
      `INSERT INTO skills (name, category, level, keywords_json, honest_framing_pt, honest_framing_en, project_note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const s of initialSkills) {
      insertSkill.run(
        s.name,
        s.category,
        s.level,
        JSON.stringify(s.keywords),
        s.honestFramingPt,
        s.honestFramingEn,
        ''
      );
    }
  }

  private computeSeniority(skills: Skill[], certs: string[]): { pt: string; en: string } {
    const solidCount = skills.filter((s) => s.level === 'solid').length;
    const practicalCount = skills.filter((s) => s.level === 'practical').length;
    const certBonus = certs.length > 0 ? 1 : 0;

    if (solidCount >= 4 || (solidCount >= 3 && practicalCount >= 3 && certBonus >= 1)) {
      return { pt: 'Pleno / Sênior Inicial', en: 'Mid-Level / Early Senior' };
    }
    return { pt: 'Júnior Avançado / Pleno', en: 'Advanced Junior / Mid-Level' };
  }

  public getProfile(): Profile {
    const row = this.db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, unknown>;
    const skillRows = this.db.prepare('SELECT * FROM skills ORDER BY id ASC').all() as Record<string, unknown>[];

    const skills: Skill[] = skillRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      category: String(r.category),
      level: String(r.level) as SkillLevel,
      keywords: JSON.parse(String(r.keywords_json)),
      honestFramingPt: String(r.honest_framing_pt),
      honestFramingEn: String(r.honest_framing_en),
      projectNote: String(r.project_note ?? '')
    }));

    const certifications: string[] = JSON.parse(String(row.certifications_json));
    const seniority = this.computeSeniority(skills, certifications);

    return {
      id: 1,
      name: String(row.name),
      titlePt: String(row.title_pt),
      titleEn: String(row.title_en),
      email: String(row.email),
      phone: String(row.phone),
      linkedin: String(row.linkedin),
      github: String(row.github),
      locationPt: String(row.location_pt),
      locationEn: String(row.location_en),
      baseSummaryPt: String(row.base_summary_pt),
      baseSummaryEn: String(row.base_summary_en),
      certifications,
      targetSeniority: seniority.pt,
      targetSeniorityEn: seniority.en,
      skills
    };
  }

  public updateProfileInfo(
    info: Partial<{
      name: string;
      titlePt: string;
      titleEn: string;
      email: string;
      phone: string;
      linkedin: string;
      github: string;
      baseSummaryPt: string;
      baseSummaryEn: string;
      certifications: string[];
    }>
  ): Profile {
    const current = this.getProfile();
    this.db
      .prepare(
        `UPDATE profile SET
          name = ?, title_pt = ?, title_en = ?, email = ?, phone = ?,
          linkedin = ?, github = ?, base_summary_pt = ?, base_summary_en = ?, certifications_json = ?
         WHERE id = 1`
      )
      .run(
        info.name ?? current.name,
        info.titlePt ?? current.titlePt,
        info.titleEn ?? current.titleEn,
        info.email ?? current.email,
        info.phone ?? current.phone,
        info.linkedin ?? current.linkedin,
        info.github ?? current.github,
        info.baseSummaryPt ?? current.baseSummaryPt,
        info.baseSummaryEn ?? current.baseSummaryEn,
        JSON.stringify(info.certifications ?? current.certifications)
      );
    return this.getProfile();
  }

  public evolveSkill(
    skillId: number,
    update: {
      level?: SkillLevel;
      honestFramingPt?: string;
      honestFramingEn?: string;
      projectNote?: string;
    }
  ): Profile {
    const existing = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Skill ${skillId} not found`);
    }

    this.db
      .prepare(
        `UPDATE skills SET
          level = ?, honest_framing_pt = ?, honest_framing_en = ?, project_note = ?
         WHERE id = ?`
      )
      .run(
        update.level ?? String(existing.level),
        update.honestFramingPt ?? String(existing.honest_framing_pt),
        update.honestFramingEn ?? String(existing.honest_framing_en),
        update.projectNote ?? String(existing.project_note ?? ''),
        skillId
      );

    return this.getProfile();
  }

  public upsertSkill(skill: {
    name: string;
    category: string;
    level: SkillLevel;
    keywords: string[];
    honestFramingPt: string;
    honestFramingEn: string;
  }): Profile {
    this.db
      .prepare(
        `INSERT INTO skills (name, category, level, keywords_json, honest_framing_pt, honest_framing_en)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           category = excluded.category,
           level = excluded.level,
           keywords_json = excluded.keywords_json,
           honest_framing_pt = excluded.honest_framing_pt,
           honest_framing_en = excluded.honest_framing_en`
      )
      .run(
        skill.name,
        skill.category,
        skill.level,
        JSON.stringify(skill.keywords),
        skill.honestFramingPt,
        skill.honestFramingEn
      );
    return this.getProfile();
  }

  private mapJobRow(r: Record<string, unknown>): Job {
    return {
      id: Number(r.id),
      title: String(r.title),
      company: String(r.company),
      url: String(r.url),
      platform: String(r.platform),
      location: String(r.location),
      description: String(r.description),
      language: (String(r.language || 'pt-BR') as Language),
      status: String(r.status) as KanbanStatus,
      rejectReason: String(r.reject_reason ?? ''),
      matchScore: Number(r.match_score),
      recruiterName: String(r.recruiter_name ?? ''),
      recruiterUrl: String(r.recruiter_url ?? ''),
      recruiterEmail: String(r.recruiter_email ?? ''),
      recruiterStatus: String(r.recruiter_status ?? 'nao_enviado') as RecruiterStatus,
      appliedAt: String(r.applied_at ?? ''),
      createdAt: String(r.created_at)
    };
  }

  public upsertJob(input: NewJobInput): Job {
    const cleanUrl = (input.url || '').trim();
    const dedupKey = cleanUrl
      ? `url:${cleanUrl.toLowerCase()}`
      : `tc:${normalizeToken(input.title)}::${normalizeToken(input.company)}`;

    const existing = this.db.prepare('SELECT * FROM jobs WHERE dedup_key = ?').get(dedupKey) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE jobs SET
            title = ?, company = ?, platform = ?, location = ?, description = ?,
            language = ?, match_score = ?
           WHERE id = ?`
        )
        .run(
          input.title,
          input.company,
          input.platform ?? String(existing.platform),
          input.location ?? String(existing.location),
          input.description,
          input.language ?? String(existing.language),
          input.matchScore ?? Number(existing.match_score),
          Number(existing.id)
        );
      return this.getJob(Number(existing.id))!;
    }

    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO jobs (
          title, company, url, dedup_key, platform, location, description,
          language, status, match_score, recruiter_name, recruiter_url, recruiter_email,
          recruiter_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'abertas', ?, ?, ?, ?, 'nao_enviado', ?)`
      )
      .run(
        input.title,
        input.company,
        cleanUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(input.title + ' ' + input.company)}`,
        dedupKey,
        input.platform ?? 'Portal / Direto',
        input.location ?? '100% Remoto',
        input.description,
        input.language ?? 'pt-BR',
        input.matchScore ?? 80,
        input.recruiterName ?? '',
        input.recruiterUrl ?? '',
        input.recruiterEmail ?? '',
        now
      );

    return this.getJob(Number(res.lastInsertRowid))!;
  }

  public getJob(id: number): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : undefined;
  }

  public listJobs(): Job[] {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY match_score DESC, id DESC').all() as Record<string, unknown>[];
    return rows.map((r) => this.mapJobRow(r));
  }

  public moveJob(id: number, status: KanbanStatus, reason = ''): Job {
    const job = this.getJob(id);
    if (!job) throw new Error(`Job ${id} not found`);

    const appliedAt = status === 'em_processo' && !job.appliedAt ? new Date().toISOString() : job.appliedAt || '';

    this.db
      .prepare('UPDATE jobs SET status = ?, reject_reason = ?, applied_at = ? WHERE id = ?')
      .run(status, reason, appliedAt, id);

    if (status === 'ruins') {
      this.learnFromFeedback(`${job.title} ${job.location} ${reason} ${job.description}`, -10);
    } else if (status === 'em_processo') {
      this.learnFromFeedback(`${job.title} ${job.location}`, 5);
    }

    return this.getJob(id)!;
  }

  private learnFromFeedback(text: string, delta: number): void {
    const trackedTerms = [
      'hibrido',
      'presencial',
      'on-site',
      'hybrid',
      'java',
      'windows',
      'php',
      'remoto',
      'remote',
      'aws',
      'docker',
      'argocd',
      'kubernetes',
      'terraform',
      'grafana',
      'devops',
      'sre'
    ];
    const normalizedText = normalizeToken(text);
    const upsertWeight = this.db.prepare(
      `INSERT INTO preference_weights (token, weight) VALUES (?, ?)
       ON CONFLICT(token) DO UPDATE SET weight = preference_weights.weight + excluded.weight`
    );

    for (const term of trackedTerms) {
      if (normalizedText.includes(term)) {
        upsertWeight.run(term, delta);
      }
    }
  }

  public updateRecruiterTracker(
    id: number,
    data: {
      recruiterName?: string;
      recruiterUrl?: string;
      recruiterEmail?: string;
      recruiterStatus?: RecruiterStatus;
    }
  ): Job {
    const job = this.getJob(id);
    if (!job) throw new Error(`Job ${id} not found`);

    this.db
      .prepare(
        `UPDATE jobs SET
          recruiter_name = ?, recruiter_url = ?, recruiter_email = ?, recruiter_status = ?
         WHERE id = ?`
      )
      .run(
        data.recruiterName ?? job.recruiterName,
        data.recruiterUrl ?? job.recruiterUrl,
        data.recruiterEmail ?? job.recruiterEmail,
        data.recruiterStatus ?? job.recruiterStatus,
        id
      );

    return this.getJob(id)!;
  }

  public getPreferenceWeights(): Record<string, number> {
    const rows = this.db.prepare('SELECT token, weight FROM preference_weights').all() as { token: string; weight: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.token] = Number(r.weight);
    }
    return out;
  }
}
