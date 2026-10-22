import type { Job, Language, Profile, RecruiterMessages, TailoredCv } from './types.ts';

export const ANTI_HALLUCINATION_SYSTEM_PROMPT = `
Você é o motor de adaptação de currículo e abordagem do CamaleãoATS.
REGRAS RÍGIDAS E IMUTÁVEIS ANTI-ALUCINAÇÃO:
1. É estritamente proibido inventar empresas, cargos, anos de experiência, certificações que o candidato não possui (ex: CKA, GCP Architect) ou inflar senioridade.
2. Em Kubernetes, se o nível atual do perfil for 'evolving' (escrita de manifestos YAML, Deployments, Services, Ingress e fluxos GitOps com ArgoCD), posicione exatamente dessa forma honesta; nunca afirme anos de administração avançada de cluster em produção.
3. Quando a vaga exigir outra Cloud (GCP, Azure, OCI) ou outra ferramenta de CI/CD (GitLab CI, Jenkins, Azure DevOps), destaque a certificação real AWS SAA-C03 e a experiência prática com Docker, GitHub Actions e ArgoCD como base arquitetural diretamente transferível e de rápida curva de aprendizado.
4. Toda frase gerada para o PDF ou para o campo "Apresente-se" da Gupy deve ser 100% defensável pelo candidato em uma entrevista técnica.
`.trim();

export function detectJobLanguage(text: string): Language {
  const sample = ` ${text.toLowerCase()} `;
  const enWords = [' we ', ' are ', ' looking ', ' experience ', ' requirements ', ' with ', ' strong ', ' working ', ' remote ', ' years '];
  const ptWords = [' vaga ', ' experiência ', ' experiencia ', ' requisitos ', ' buscamos ', ' atuação ', ' atuacao ', ' para ', ' remoto ', ' anos '];

  let enScore = 0;
  let ptScore = 0;

  for (const w of enWords) if (sample.includes(w)) enScore++;
  for (const w of ptWords) if (sample.includes(w)) ptScore++;

  return enScore > ptScore ? 'en' : 'pt-BR';
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeAndHighlightJob(
  job: Pick<Job, 'title' | 'company' | 'location' | 'description'>,
  profile: Profile,
  weights: Record<string, number> = {}
): {
  matchScore: number;
  highlightedHtml: string;
  strongMatches: string[];
  evolvingMatches: string[];
  missingKeywords: string[];
  preferenceAlerts: string[];
} {
  const fullLower = `${job.title} ${job.location} ${job.description}`.toLowerCase();
  const strongMatches: string[] = [];
  const evolvingMatches: string[] = [];

  const strongKeywordMap = new Map<string, string>();
  const evolvingKeywordMap = new Map<string, string>();

  for (const skill of profile.skills) {
    const isStrong = skill.level === 'solid' || skill.level === 'practical';
    let matchedThisSkill = false;

    for (const kw of skill.keywords) {
      const kwLower = kw.toLowerCase();
      if (isStrong) {
        strongKeywordMap.set(kwLower, skill.name);
      } else {
        evolvingKeywordMap.set(kwLower, skill.name);
      }
      const rx = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(kwLower)}([^a-zA-Z0-9]|$)`, 'i');
      if (rx.test(fullLower)) {
        matchedThisSkill = true;
      }
    }

    if (matchedThisSkill) {
      if (isStrong) {
        if (!strongMatches.includes(skill.name)) strongMatches.push(skill.name);
      } else {
        if (!evolvingMatches.includes(skill.name)) evolvingMatches.push(skill.name);
      }
    }
  }

  // Sister cloud / CI-CD transferable terms
  const transferableTerms = ['gcp', 'google cloud', 'azure', 'oci', 'oracle cloud', 'gitlab ci', 'jenkins', 'azure devops', 'helm', 'prometheus'];
  for (const t of transferableTerms) {
    evolvingKeywordMap.set(t, `Transferível (${t.toUpperCase()})`);
    const rx = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(t)}([^a-zA-Z0-9]|$)`, 'i');
    if (rx.test(fullLower) && !evolvingMatches.includes(t.toUpperCase())) {
      evolvingMatches.push(t.toUpperCase());
    }
  }

  // Escape HTML first so raw <script> or tags can never execute
  let highlightedHtml = escapeHtml(job.description);

  const allKeywords = [
    ...Array.from(strongKeywordMap.keys()).map((k) => ({ kw: k, cls: 'match-strong', label: strongKeywordMap.get(k)! })),
    ...Array.from(evolvingKeywordMap.keys()).map((k) => ({ kw: k, cls: 'match-evolving', label: evolvingKeywordMap.get(k)! }))
  ].sort((a, b) => b.kw.length - a.kw.length);

  // Use placeholders to avoid nested <mark> replacements
  const placeholders: { token: string; html: string }[] = [];
  let tokenIdx = 0;

  for (const item of allKeywords) {
    if (item.kw.length < 3) continue;
    const rx = new RegExp(`(^|[^a-zA-Z0-9_])(${escapeRegex(item.kw)})(?=[^a-zA-Z0-9_]|$)`, 'gi');
    highlightedHtml = highlightedHtml.replace(rx, (_full, prefix: string, matchedText: string) => {
      const token = `__CAMALEAO_MARK_${tokenIdx++}__`;
      const badgeTitle =
        item.cls === 'match-strong'
          ? `Ponto Forte no seu CV (${item.label})`
          : `Em Evolução / Base Transferível (${item.label})`;
      placeholders.push({
        token,
        html: `<mark class="${item.cls}" title="${escapeHtml(badgeTitle)}">${matchedText}</mark>`
      });
      return `${prefix}${token}`;
    });
  }

  for (const p of placeholders) {
    highlightedHtml = highlightedHtml.replace(p.token, p.html);
  }

  highlightedHtml = highlightedHtml.replace(/\n/g, '<br/>');

  // Score calculation
  let score = 55 + strongMatches.length * 10 + evolvingMatches.length * 4;
  if (/remoto|remote|home office|anywhere/i.test(`${job.title} ${job.location} ${job.description}`)) {
    score += 8;
  }

  const preferenceAlerts: string[] = [];
  if (/h[íi]brido|presencial|on-site|onsite/i.test(`${job.title} ${job.location} ${job.description}`)) {
    score -= 25;
    preferenceAlerts.push('Alerta: A vaga menciona modelo híbrido ou presencial.');
  }

  for (const [term, w] of Object.entries(weights)) {
    if (fullLower.includes(term)) {
      score += Math.max(-20, Math.min(15, w));
      if (w < 0) {
        preferenceAlerts.push(`Filtro aprendido: contém termo penalizado pelo seu histórico ("${term}").`);
      }
    }
  }

  score = Math.max(15, Math.min(98, Math.round(score)));

  const commonDevOpsTerms = ['Docker', 'AWS', 'Kubernetes', 'Terraform', 'Ansible', 'ArgoCD', 'GitHub Actions', 'Grafana'];
  const missingKeywords = commonDevOpsTerms.filter(
    (t) =>
      new RegExp(escapeRegex(t), 'i').test(fullLower) &&
      !strongMatches.some((m) => m.toLowerCase().includes(t.toLowerCase())) &&
      !evolvingMatches.some((m) => m.toLowerCase().includes(t.toLowerCase()))
  );

  return {
    matchScore: score,
    highlightedHtml,
    strongMatches,
    evolvingMatches,
    missingKeywords,
    preferenceAlerts
  };
}

export function generateHonestTailoredCv(
  job: Pick<Job, 'title' | 'company' | 'description'>,
  profile: Profile,
  lang?: Language
): TailoredCv {
  const targetLang: Language = lang ?? detectJobLanguage(`${job.title} ${job.description}`);
  const analysis = analyzeAndHighlightJob(
    { title: job.title, company: job.company, location: 'Remoto', description: job.description },
    profile
  );
  const descLower = `${job.title} ${job.description}`.toLowerCase();

  // Order skills: strong matched first, then evolving matched, then remaining solid/practical, then rest
  const scoredSkills = profile.skills.map((skill) => {
    const isMatched = skill.keywords.some((kw) => descLower.includes(kw.toLowerCase()));
    const levelWeight = skill.level === 'solid' ? 30 : skill.level === 'practical' ? 20 : 10;
    const matchWeight = isMatched ? 50 : 0;
    return {
      skill,
      isMatched,
      priority: matchWeight + levelWeight
    };
  });

  scoredSkills.sort((a, b) => b.priority - a.priority);

  const orderedSkills = scoredSkills.map(({ skill }) => ({
    name: skill.name,
    level: skill.level,
    framing: targetLang === 'en' ? skill.honestFramingEn : skill.honestFramingPt
  }));

  const asksOtherCloud = /\b(gcp|google cloud|azure|oci|oracle cloud)\b/i.test(descLower);
  const asksOtherCiCd = /\b(gitlab|jenkins|azure devops|bitbucket pipelines|circleci)\b/i.test(descLower);

  const honestAdjustmentsMade: string[] = [];
  const experienceBullets: string[] = [];

  if (targetLang === 'en') {
    const topMatchedNames = analysis.strongMatches.length
      ? analysis.strongMatches.join(', ')
      : 'AWS (SAA-C03), Docker, GitHub Actions, and ArgoCD';

    const summary = `DevOps / SRE Engineer (${profile.targetSeniorityEn}) certified in AWS Solutions Architect Associate (SAA-C03), with strong hands-on focus on ${topMatchedNames}. Proven experience in Docker containerization, CI/CD automation with GitHub Actions, GitOps deployments with ArgoCD, and authoring Kubernetes YAML manifests. Fast learner with high adaptability across cloud platforms and infrastructure tooling.`;

    for (const item of orderedSkills) {
      experienceBullets.push(`${item.name}: ${item.framing}`);
    }

    if (asksOtherCloud) {
      experienceBullets.push(
        'Multi-Cloud Adaptability: Solid cloud architecture foundation validated by AWS SAA-C03 (IAM, networking, compute, storage, HA), enabling rapid transition to GCP, Azure, or OCI environments.'
      );
      honestAdjustmentsMade.push(
        'Positioned AWS SAA-C03 architectural concepts as directly transferable to the cloud provider requested by the job (without claiming fake years in that cloud).'
      );
    }

    if (asksOtherCiCd) {
      experienceBullets.push(
        'CI/CD Platform Agnosticism: Practical experience designing automated build, test, and deployment pipelines in GitHub Actions and ArgoCD, easily transferable to GitLab CI, Jenkins, or Azure DevOps.'
      );
    }

    honestAdjustmentsMade.push(
      `Highlighted top matched ATS keywords (${topMatchedNames}) in the summary and skill ordering.`
    );
    honestAdjustmentsMade.push(
      'Framed Kubernetes strictly within your real expertise (writing YAML manifests + GitOps with ArgoCD + Docker) without inventing senior cluster admin claims.'
    );

    const gupyApresentese = [
      `Hello ${job.company} team! I am applying for the ${job.title} role.`,
      `I work in DevOps with a strong foundation in Docker containerization, CI/CD automation (Git, GitHub Actions), and GitOps continuous delivery using ArgoCD, combined with the AWS Certified Solutions Architect – Associate (SAA-C03) certification.`,
      `In Kubernetes, I comfortably write and maintain YAML manifests integrated with Docker and ArgoCD pipelines, and I also have practical familiarity with Terraform, Ansible, and Grafana observability.`,
      `One of my biggest strengths is my steep learning curve and adaptability across different cloud providers and DevOps stacks. I am excited to contribute to ${job.company}'s remote infrastructure and reliability goals!`
    ].join('\n\n');

    return {
      language: 'en',
      targetRoleTitle: `${job.title} — ${profile.titleEn}`,
      summary,
      certifications: profile.certifications,
      highlights: orderedSkills.slice(0, 5).map((s) => `${s.name}: ${s.framing}`),
      experienceBullets,
      orderedSkills,
      honestAdjustmentsMade,
      gupyKit: {
        apresenteseText: gupyApresentese,
        profileSummaryToUpdate: summary,
        experienceBlocksToUpdate: experienceBullets.slice(0, 5),
        skillsTagsToAdd: ['Docker', 'AWS', 'AWS SAA-C03', 'CI/CD', 'GitHub Actions', 'ArgoCD', 'GitOps', 'Kubernetes', 'YAML', 'Terraform', 'Ansible', 'Grafana', 'Linux']
      }
    };
  }

  // Default: pt-BR
  const topMatchedNamesPt = analysis.strongMatches.length
    ? analysis.strongMatches.join(', ')
    : 'AWS (SAA-C03), Docker, GitHub Actions e ArgoCD';

  const summaryPt = `Profissional DevOps / SRE (${profile.targetSeniority}) certificado AWS Solutions Architect Associate (SAA-C03), com foco prático em ${topMatchedNamesPt}. Experiência sólida em containerização com Docker, automação de pipelines CI/CD com GitHub Actions, entrega contínua GitOps com ArgoCD e escrita de manifestos YAML para Kubernetes. Perfil altamente adaptável ("camaleão"), com curva de aprendizado rápida para novas clouds e ferramentas de infraestrutura.`;

  for (const item of orderedSkills) {
    experienceBullets.push(`${item.name}: ${item.framing}`);
  }

  if (asksOtherCloud) {
    experienceBullets.push(
      'Adaptabilidade Multi-Cloud: Sólida base em arquitetura de nuvem validada pela certificação AWS SAA-C03 (IAM, redes/VPC, compute, storage e alta disponibilidade), permitindo rápida transição e operação em ambientes GCP, Azure ou OCI.'
    );
    honestAdjustmentsMade.push(
      'Enquadrou a certificação AWS SAA-C03 como base de arquitetura Cloud transferível para a nuvem pedida na vaga (sem inventar experiência falsa).'
    );
  }

  if (asksOtherCiCd) {
    experienceBullets.push(
      'Transição Rápida em CI/CD: Domínio prático de automação de esteiras (build, testes e deploy de containers) com GitHub Actions e ArgoCD, com fácil adaptação para GitLab CI, Jenkins ou Azure DevOps.'
    );
  }

  honestAdjustmentsMade.push(
    `Priorizou no topo do CV e no resumo as palavras-chave exatas encontradas na vaga (${topMatchedNamesPt}).`
  );
  honestAdjustmentsMade.push(
    'Posicionou Kubernetes de forma 100% honesta (escrita de manifestos YAML + GitOps com ArgoCD + Docker), passando no filtro de palavras-chave do ATS sem inventar senioridade de cluster admin.'
  );

  const gupyApresentesePt = [
    `Olá, time da ${job.company}! Tenho grande interesse na oportunidade de ${job.title}.`,
    `Atuo na área de DevOps com foco prático na stack de Cloud, Containers e Automação: possuo a certificação AWS Certified Solutions Architect – Associate (SAA-C03), forte domínio em Docker, construção de pipelines CI/CD com Git e GitHub Actions e entrega contínua / GitOps com ArgoCD.`,
    `No ecossistema Kubernetes, escrevo e mantenho manifestos YAML integrados ao fluxo de containers e ArgoCD, além de contar com vivência prática em evolução constante com Terraform (IaC), Ansible e observabilidade com Grafana.`,
    `Tenho facilidade extrema de adaptação a novas plataformas de Cloud e ferramentas de esteira, com curva de aprendizado muito rápida. Estou pronto para somar remotamente ao time da ${job.company}!`
  ].join('\n\n');

  return {
    language: 'pt-BR',
    targetRoleTitle: `${job.title} — ${profile.titlePt}`,
    summary: summaryPt,
    certifications: profile.certifications,
    highlights: orderedSkills.slice(0, 5).map((s) => `${s.name}: ${s.framing}`),
    experienceBullets,
    orderedSkills,
    honestAdjustmentsMade,
    gupyKit: {
      apresenteseText: gupyApresentesePt,
      profileSummaryToUpdate: summaryPt,
      experienceBlocksToUpdate: experienceBullets.slice(0, 5),
      skillsTagsToAdd: ['Docker', 'AWS', 'AWS SAA-C03', 'CI/CD', 'GitHub Actions', 'ArgoCD', 'GitOps', 'Kubernetes', 'YAML', 'Terraform', 'Ansible', 'Grafana', 'Linux']
    }
  };
}

function truncateText(str: string, maxLen: number): string {
  const clean = str.trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, Math.max(1, maxLen - 1)).trimEnd() + '…';
}

export function generateRecruiterMessages(
  job: Pick<Job, 'title' | 'company' | 'recruiterName'>,
  profile: Profile,
  strongMatches: string[],
  lang?: Language
): RecruiterMessages {
  const targetLang: Language = lang ?? detectJobLanguage(job.title);
  const firstName = (job.recruiterName || '').trim().split(/\s+/)[0] || (targetLang === 'en' ? 'there' : 'tudo bem');
  const shortRole = truncateText(job.title, 28);
  const shortCompany = truncateText(job.company, 20);
  const stackText = truncateText(
    strongMatches.length ? strongMatches.slice(0, 3).join(', ') : 'AWS SAA-C03, Docker, ArgoCD',
    38
  );

  const searchQuery = encodeURIComponent(`Tech Recruiter ${job.company}`);
  const linkedinSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${searchQuery}`;

  if (targetLang === 'en') {
    let inviteNote = `Hi ${truncateText(firstName, 14)}! I applied for ${shortRole} at ${shortCompany}. I work in DevOps (${stackText}, K8s YAML) and would love to connect!`;
    if (inviteNote.length > 200) {
      inviteNote = inviteNote.slice(0, 199).trimEnd() + '…';
    }

    const postAcceptDm = [
      `Hi ${firstName === 'there' ? 'there' : firstName}, thanks for accepting my connection!`,
      `I recently applied for the ${job.title} position at ${job.company} and wanted to briefly introduce myself.`,
      `I work as a DevOps Engineer holding the AWS Solutions Architect Associate (SAA-C03) certification, with strong hands-on experience in Docker, CI/CD pipelines (GitHub Actions), GitOps with ArgoCD, and Kubernetes YAML manifests, plus familiarity with Terraform, Ansible, and Grafana.`,
      `I adapt very quickly to new cloud providers and tooling and am looking for a 100% remote opportunity where I can make an immediate impact. I'd be happy to share my tailored CV here or chat whenever convenient for you!`
    ].join('\n\n');

    return {
      language: 'en',
      inviteNote,
      inviteCharCount: inviteNote.length,
      postAcceptDm,
      emailSubject: `Application: ${job.title} — ${profile.name} (AWS SAA-C03 | Docker | CI/CD | ArgoCD)`,
      emailBody: `${postAcceptDm}\n\nBest regards,\n${profile.name}\n${profile.email} | ${profile.linkedin}`,
      linkedinSearchUrl
    };
  }

  // pt-BR
  const greeting = job.recruiterName?.trim() ? `Oi ${truncateText(firstName, 14)}, tudo bem?` : 'Olá, tudo bem?';
  let inviteNotePt = `${greeting} Vi a vaga de ${shortRole} na ${shortCompany}. Atuo com DevOps (${stackText}, K8s YAML) e adoraria me conectar!`;
  if (inviteNotePt.length > 200) {
    inviteNotePt = inviteNotePt.slice(0, 199).trimEnd() + '…';
  }

  const postAcceptDmPt = [
    `${job.recruiterName?.trim() ? `Oi ${firstName}` : 'Olá'}, muito obrigado por aceitar a conexão!`,
    `Me candidatei à vaga de ${job.title} na ${job.company} e quis mandar um oi direto para demonstrar meu interesse real na oportunidade.`,
    `Hoje atuo como DevOps com certificação AWS Solutions Architect Associate (SAA-C03), experiência sólida em Docker, esteiras CI/CD com GitHub Actions, GitOps com ArgoCD e escrita de manifestos YAML em Kubernetes (além de prática com Terraform, Ansible e Grafana).`,
    `Tenho uma curva de aprendizado muito rápida e me adapto fácil a qualquer stack Cloud/CI-CD. Caso queira dar uma olhada, posso te enviar meu CV atualizado por aqui. Muito obrigado pela atenção!`
  ].join('\n\n');

  return {
    language: 'pt-BR',
    inviteNote: inviteNotePt,
    inviteCharCount: inviteNotePt.length,
    postAcceptDm: postAcceptDmPt,
    emailSubject: `Candidatura: ${job.title} — ${profile.name} (AWS SAA-C03 | Docker | CI/CD | ArgoCD)`,
    emailBody: `${postAcceptDmPt}\n\nAtenciosamente,\n${profile.name}\n${profile.email} | ${profile.linkedin}`,
    linkedinSearchUrl
  };
}
