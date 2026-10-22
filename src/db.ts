import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentPromptMd,
  AppSettings,
  CertificationItem,
  EducationItem,
  Job,
  JobSeniority,
  KanbanStatus,
  Language,
  NewJobInput,
  PersonalProject,
  Profile,
  RecruiterStatus,
  Skill,
  SkillLevel,
  ThemeMode
} from './types.ts';

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function inferJobSeniority(title: string, description = ''): JobSeniority {
  const sample = `${title} ${description.slice(0, 300)}`.toLowerCase();
  if (/\b(est[áa]gio|intern|trainee)\b/i.test(sample)) return 'estagio';
  if (/\b(staff|principal|especialista|lead|architect)\b/i.test(sample)) return 'especialista';
  if (/\b(s[êe]nior|sr\.?)\b/i.test(sample) && !/\b(pleno|j[úu]nior|jr)\b/i.test(sample)) return 'senior';
  if (/\b(jr|j[úu]nior)\b/i.test(sample) && /\b(pleno|mid)\b/i.test(sample)) return 'junior_pleno';
  if (/\b(jr|j[úu]nior|entry)\b/i.test(sample)) return 'junior';
  if (/\b(pleno|mid-level|mid)\b/i.test(sample)) return 'pleno';
  return 'junior_pleno';
}

export class AppDatabase {
  private db: DatabaseSync;
  private dataDir: string;

  constructor(dbPath = path.join(process.cwd(), 'data', 'camaleao.db')) {
    if (dbPath !== ':memory:') {
      this.dataDir = path.dirname(dbPath);
      fs.mkdirSync(this.dataDir, { recursive: true });
    } else {
      this.dataDir = '';
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

      CREATE TABLE IF NOT EXISTS certifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        issuer TEXT NOT NULL DEFAULT '',
        year TEXT NOT NULL DEFAULT '',
        credential_url TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS educations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course TEXT NOT NULL,
        institution TEXT NOT NULL,
        degree TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Concluído',
        year TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS personal_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        tech_stack_json TEXT NOT NULL,
        description_pt TEXT NOT NULL,
        description_en TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ai_provider TEXT NOT NULL DEFAULT 'deterministic',
        api_key TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        base_url TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'auto'
      );

      CREATE TABLE IF NOT EXISTS agent_prompts (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        url TEXT NOT NULL,
        dedup_key TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        location TEXT NOT NULL,
        seniority TEXT NOT NULL DEFAULT 'junior_pleno',
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

    // Safe migration if existing table lacked seniority column
    const cols = this.db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'seniority')) {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN seniority TEXT NOT NULL DEFAULT 'junior_pleno'`);
    }
  }

  private seedIfEmpty(): void {
    const existing = this.db.prepare('SELECT id FROM profile WHERE id = 1').get();
    if (!existing) {
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

      this.db
        .prepare('INSERT OR IGNORE INTO certifications (name, issuer, year, credential_url) VALUES (?, ?, ?, ?)')
        .run('AWS Certified Solutions Architect - Associate (SAA-C03)', 'Amazon Web Services (AWS)', '2025', '');

      this.db
        .prepare('INSERT INTO educations (course, institution, degree, status, year) VALUES (?, ?, ?, ?, ?)')
        .run('Tecnologia da Informação / Redes & Cloud', 'Instituição de Ensino Superior', 'Graduação', 'Concluído', '2024');

      this.db
        .prepare(
          'INSERT OR IGNORE INTO personal_projects (name, tech_stack_json, description_pt, description_en, url) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          'Homelab Kubernetes (Kind) & GitOps com ArgoCD',
          JSON.stringify(['Kubernetes', 'YAML', 'ArgoCD', 'Docker', 'Kind', 'GitOps']),
          'Provisionamento de cluster Kubernetes local com Kind, configuração declarativa de manifestos YAML (Deployments, Services) e entrega contínua GitOps gerenciada pelo ArgoCD.',
          'Local Kubernetes cluster provisioning with Kind, declarative YAML manifests (Deployments, Services), and GitOps continuous delivery managed by ArgoCD.',
          ''
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

    const existingSettings = this.db.prepare('SELECT id FROM settings WHERE id = 1').get();
    if (!existingSettings) {
      this.db
        .prepare('INSERT INTO settings (id, ai_provider, api_key, model_name, base_url, theme) VALUES (1, ?, ?, ?, ?, ?)')
        .run('deterministic', '', 'gpt-4o-mini', '', 'auto');
    }

    const existingAgents = this.db.prepare('SELECT COUNT(*) as c FROM agent_prompts').get() as { c: number };
    if (Number(existingAgents.c) === 0) {
      const now = new Date().toISOString();
      const defaultAgents: AgentPromptMd[] = [
        {
          slug: 'cv-adapter.md',
          title: 'Agente Adaptador de CV (ATS)',
          description: 'Instruções Markdown para reordenar e adaptar o CV às palavras-chave da vaga sem alucinar.',
          content: `# Agente Adaptador de CV (cv-adapter.md)

## Regras Inegociáveis Anti-Alucinação
1. Nunca invente empresas, cargos, anos de experiência ou certificações não listadas no Perfil.
2. Em habilidades marcadas como "Em Evolução" (ex: Kubernetes YAML), posicione com precisão técnica o que o candidato realmente faz sem fingir senioridade de administrador de cluster.
3. Inclua Projetos Pessoais do perfil apenas quando as tecnologias do projeto tiverem interseção com os requisitos da vaga.
4. Priorize no topo do Resumo e das Competências as palavras-chave exatas que o ATS da vaga busca.`,
          updatedAt: now
        },
        {
          slug: 'gupy-gaia.md',
          title: 'Agente Gupy ("Apresente-se" & Gaia ATS)',
          description: 'Instruções Markdown para redigir o texto "Apresente-se" e os blocos do perfil pré-cadastrado na Gupy.',
          content: `# Agente Gupy & Gaia ATS (gupy-gaia.md)

## Diretrizes para Pontuação na Gaia (Gupy)
1. Gere o texto "Apresente-se" em primeira pessoa, conectando a vaga às certificações, projetos e tecnologias reais do candidato.
2. Repita de forma natural os termos exatos da descrição da vaga que o candidato domina.
3. Sugira o bloco exato de Resumo Profissional e Tags de Habilidades para atualizar no currículo pré-cadastrado da Gupy antes de enviar a candidatura.`,
          updatedAt: now
        },
        {
          slug: 'recruiter-dm.md',
          title: 'Agente Tech Recruiter (LinkedIn ≤200c & DM)',
          description: 'Instruções Markdown para gerar a nota curta de convite (máx. 200 caracteres) e a DM pós-aceite.',
          content: `# Agente Tech Recruiter LinkedIn (recruiter-dm.md)

## Regras de Abordagem
1. A nota de convite para contas LinkedIn Free deve ter estritamente no máximo 200 caracteres (incluindo espaços).
2. A DM completa pós-aceite deve agradecer a conexão, citar a vaga específica e destacar as certificações e stack principal com tom humano e direto.`,
          updatedAt: now
        },
        {
          slug: 'cv-extractor.md',
          title: 'Agente Extrator de Perfil a partir de CV',
          description: 'Instruções Markdown para extrair Dados Pessoais, Habilidades, Certificações, Graduações e Projetos de um CV.',
          content: `# Agente Extrator de CV (cv-extractor.md)

## Regras de Extração Estruturada
1. Separe rigorosamente Certificações (sem nível de senioridade), Graduações/Ensino (Curso, Instituição, Grau), Habilidades/Softwares (com nível de familiaridade) e Projetos Pessoais.
2. Preserve os dados reais de contato (Nome, E-mail, Telefone, LinkedIn, GitHub).`,
          updatedAt: now
        }
      ];

      const ins = this.db.prepare(
        'INSERT INTO agent_prompts (slug, title, description, content, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const a of defaultAgents) {
        ins.run(a.slug, a.title, a.description, a.content, a.updatedAt);
        this.writeAgentFileToDisk(a.slug, a.content);
      }
    }
  }

  private writeAgentFileToDisk(slug: string, content: string): void {
    if (!this.dataDir) return;
    try {
      const agentsDir = path.join(this.dataDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, slug), content, 'utf8');
    } catch {
      // Ignore disk sync errors in read-only environments
    }
  }

  private computeSeniority(skills: Skill[], certs: CertificationItem[]): { pt: string; en: string } {
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
    const certRows = this.db.prepare('SELECT * FROM certifications ORDER BY id ASC').all() as Record<string, unknown>[];
    const eduRows = this.db.prepare('SELECT * FROM educations ORDER BY id ASC').all() as Record<string, unknown>[];
    const projRows = this.db.prepare('SELECT * FROM personal_projects ORDER BY id ASC').all() as Record<string, unknown>[];

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

    const certificationItems: CertificationItem[] = certRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      issuer: String(r.issuer ?? ''),
      year: String(r.year ?? ''),
      credentialUrl: String(r.credential_url ?? '')
    }));

    const educations: EducationItem[] = eduRows.map((r) => ({
      id: Number(r.id),
      course: String(r.course),
      institution: String(r.institution),
      degree: String(r.degree),
      status: String(r.status),
      year: String(r.year ?? '')
    }));

    const personalProjects: PersonalProject[] = projRows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      techStack: JSON.parse(String(r.tech_stack_json)),
      descriptionPt: String(r.description_pt),
      descriptionEn: String(r.description_en),
      url: String(r.url ?? '')
    }));

    const certifications = certificationItems.map((c) => c.name);
    const seniority = this.computeSeniority(skills, certificationItems);

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
      certificationItems,
      educations,
      personalProjects,
      targetSeniority: seniority.pt,
      targetSeniorityEn: seniority.en,
      skills
    };
  }

  public addCertification(cert: { name: string; issuer?: string; year?: string; credentialUrl?: string }): Profile {
    this.db
      .prepare(
        `INSERT INTO certifications (name, issuer, year, credential_url)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET issuer = excluded.issuer, year = excluded.year, credential_url = excluded.credential_url`
      )
      .run(cert.name.trim(), cert.issuer?.trim() || 'Certificadora Oficial', cert.year?.trim() || '', cert.credentialUrl?.trim() || '');
    return this.getProfile();
  }

  public deleteCertification(id: number): Profile {
    this.db.prepare('DELETE FROM certifications WHERE id = ?').run(id);
    return this.getProfile();
  }

  public addEducation(edu: { course: string; institution: string; degree: string; status?: string; year?: string }): Profile {
    this.db
      .prepare('INSERT INTO educations (course, institution, degree, status, year) VALUES (?, ?, ?, ?, ?)')
      .run(edu.course.trim(), edu.institution.trim(), edu.degree.trim(), edu.status?.trim() || 'Concluído', edu.year?.trim() || '');
    return this.getProfile();
  }

  public deleteEducation(id: number): Profile {
    this.db.prepare('DELETE FROM educations WHERE id = ?').run(id);
    return this.getProfile();
  }

  public addPersonalProject(proj: {
    name: string;
    techStack: string[];
    descriptionPt: string;
    descriptionEn?: string;
    url?: string;
  }): Profile {
    this.db
      .prepare(
        `INSERT INTO personal_projects (name, tech_stack_json, description_pt, description_en, url)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           tech_stack_json = excluded.tech_stack_json,
           description_pt = excluded.description_pt,
           description_en = excluded.description_en,
           url = excluded.url`
      )
      .run(
        proj.name.trim(),
        JSON.stringify(proj.techStack),
        proj.descriptionPt.trim(),
        (proj.descriptionEn || proj.descriptionPt).trim(),
        proj.url?.trim() || ''
      );
    return this.getProfile();
  }

  public deletePersonalProject(id: number): Profile {
    this.db.prepare('DELETE FROM personal_projects WHERE id = ?').run(id);
    return this.getProfile();
  }

  public deleteSkill(id: number): Profile {
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    return this.getProfile();
  }

  public getSettings(): AppSettings {
    const r = this.db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
    return {
      aiProvider: String(r.ai_provider || 'deterministic') as AppSettings['aiProvider'],
      apiKey: String(r.api_key || ''),
      modelName: String(r.model_name || 'gpt-4o-mini'),
      baseUrl: String(r.base_url || ''),
      theme: String(r.theme || 'auto') as ThemeMode
    };
  }

  public updateSettings(patch: Partial<AppSettings>): AppSettings {
    const cur = this.getSettings();
    this.db
      .prepare('UPDATE settings SET ai_provider = ?, api_key = ?, model_name = ?, base_url = ?, theme = ? WHERE id = 1')
      .run(
        patch.aiProvider ?? cur.aiProvider,
        patch.apiKey ?? cur.apiKey,
        patch.modelName ?? cur.modelName,
        patch.baseUrl ?? cur.baseUrl,
        patch.theme ?? cur.theme
      );
    return this.getSettings();
  }

  public listAgentPrompts(): AgentPromptMd[] {
    const rows = this.db.prepare('SELECT * FROM agent_prompts ORDER BY slug ASC').all() as Record<string, unknown>[];
    return rows.map((r) => ({
      slug: String(r.slug),
      title: String(r.title),
      description: String(r.description),
      content: String(r.content),
      updatedAt: String(r.updated_at)
    }));
  }

  public updateAgentPrompt(slug: string, content: string): AgentPromptMd {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE agent_prompts SET content = ?, updated_at = ? WHERE slug = ?').run(content, now, slug);
    this.writeAgentFileToDisk(slug, content);
    const updated = this.listAgentPrompts().find((a) => a.slug === slug);
    if (!updated) throw new Error(`Agent prompt ${slug} not found`);
    return updated;
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
      locationPt: string;
      locationEn: string;
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
          linkedin = ?, github = ?, location_pt = ?, location_en = ?,
          base_summary_pt = ?, base_summary_en = ?, certifications_json = ?
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
        info.locationPt ?? current.locationPt,
        info.locationEn ?? current.locationEn,
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
      seniority: (String(r.seniority || 'junior_pleno') as JobSeniority),
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

    const seniority = input.seniority ?? inferJobSeniority(input.title, input.description);
    const existing = this.db.prepare('SELECT * FROM jobs WHERE dedup_key = ?').get(dedupKey) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE jobs SET
            title = ?, company = ?, platform = ?, location = ?, seniority = ?, description = ?,
            language = ?, match_score = ?
           WHERE id = ?`
        )
        .run(
          input.title,
          input.company,
          input.platform ?? String(existing.platform),
          input.location ?? String(existing.location),
          seniority,
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
          title, company, url, dedup_key, platform, location, seniority, description,
          language, status, match_score, recruiter_name, recruiter_url, recruiter_email,
          recruiter_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'abertas', ?, ?, ?, ?, 'nao_enviado', ?)`
      )
      .run(
        input.title,
        input.company,
        cleanUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(input.title + ' ' + input.company)}`,
        dedupKey,
        input.platform ?? 'Portal / Direto',
        input.location ?? '100% Remoto',
        seniority,
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

  public updateJobSeniority(id: number, seniority: JobSeniority): Job {
    this.db.prepare('UPDATE jobs SET seniority = ? WHERE id = ?').run(seniority, id);
    return this.getJob(id)!;
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
