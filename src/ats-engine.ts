import zlib from 'node:zlib';
import type { Job, Language, Profile, RecruiterMessages, SkillLevel, TailoredCv } from './types.ts';

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

  const transferableTerms = ['gcp', 'google cloud', 'azure', 'oci', 'oracle cloud', 'gitlab ci', 'jenkins', 'azure devops', 'helm', 'prometheus'];
  for (const t of transferableTerms) {
    evolvingKeywordMap.set(t, `Transferível (${t.toUpperCase()})`);
    const rx = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(t)}([^a-zA-Z0-9]|$)`, 'i');
    if (rx.test(fullLower) && !evolvingMatches.includes(t.toUpperCase())) {
      evolvingMatches.push(t.toUpperCase());
    }
  }

  let highlightedHtml = escapeHtml(job.description);

  const allKeywords = [
    ...Array.from(strongKeywordMap.keys()).map((k) => ({ kw: k, cls: 'match-strong', label: strongKeywordMap.get(k)! })),
    ...Array.from(evolvingKeywordMap.keys()).map((k) => ({ kw: k, cls: 'match-evolving', label: evolvingKeywordMap.get(k)! }))
  ].sort((a, b) => b.kw.length - a.kw.length);

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

  const relevantProjects = (profile.personalProjects || []).filter((proj) =>
    proj.techStack.some((tech) => descLower.includes(tech.toLowerCase()))
  );

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
      'Framed Kubernetes strictly within your real expertise without inventing senior cluster admin claims.'
    );

    const k8sSkillEn = profile.skills.find((s) => s.name === 'Kubernetes');
    const k8sTextEn = k8sSkillEn
      ? k8sSkillEn.honestFramingEn
      : 'Authoring and maintaining Kubernetes YAML manifests integrated with Docker and ArgoCD pipelines.';

    const gupyApresentese = [
      `Hello ${job.company} team! I am applying for the ${job.title} role.`,
      `I work in DevOps with a strong foundation in Docker containerization, CI/CD automation (Git, GitHub Actions), and GitOps continuous delivery using ArgoCD, combined with the AWS Certified Solutions Architect – Associate (SAA-C03) certification.`,
      `In Kubernetes: ${k8sTextEn} I also bring practical familiarity with Terraform, Ansible, and Grafana observability.`,
      `One of my biggest strengths is my steep learning curve and adaptability across different cloud providers and DevOps stacks. I am excited to contribute to ${job.company}'s remote infrastructure and reliability goals!`
    ].join('\n\n');

    return {
      language: 'en',
      targetRoleTitle: `${job.title} — ${profile.titleEn}`,
      summary,
      certifications: profile.certifications,
      educations: profile.educations || [],
      relevantProjects,
      highlights: orderedSkills.slice(0, 5).map((s) => `${s.name}: ${s.framing}`),
      experienceBullets,
      orderedSkills,
      honestAdjustmentsMade,
      gupyKit: {
        apresenteseText: gupyApresentese,
        profileSummaryToUpdate: summary,
        experienceBlocksToUpdate: experienceBullets.slice(0, 5),
        skillsTagsToAdd: profile.skills.map((s) => s.name)
      }
    };
  }

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
    'Posicionou Kubernetes de forma 100% honesta conforme seu Perfil, passando no filtro de palavras-chave do ATS sem inventar senioridade.'
  );

  const k8sSkillPt = profile.skills.find((s) => s.name === 'Kubernetes');
  const k8sTextPt = k8sSkillPt
    ? k8sSkillPt.honestFramingPt
    : 'Escrita e manutenção de manifestos YAML para Kubernetes integrados ao fluxo de containers e ArgoCD.';

  const gupyApresentesePt = [
    `Olá, time da ${job.company}! Tenho grande interesse na oportunidade de ${job.title}.`,
    `Atuo na área de DevOps com foco prático na stack de Cloud, Containers e Automação: possuo a certificação AWS Certified Solutions Architect – Associate (SAA-C03), forte domínio em Docker, construção de pipelines CI/CD com Git e GitHub Actions e entrega contínua / GitOps com ArgoCD.`,
    `No ecossistema Kubernetes: ${k8sTextPt} Além disso, conto com vivência prática em evolução constante com Terraform (IaC), Ansible e observabilidade com Grafana.`,
    `Tenho facilidade extrema de adaptação a novas plataformas de Cloud e ferramentas de esteira, com curva de aprendizado muito rápida. Estou pronto para somar remotamente ao time da ${job.company}!`
  ].join('\n\n');

  return {
    language: 'pt-BR',
    targetRoleTitle: `${job.title} — ${profile.titlePt}`,
    summary: summaryPt,
    certifications: profile.certifications,
    educations: profile.educations || [],
    relevantProjects,
    highlights: orderedSkills.slice(0, 5).map((s) => `${s.name}: ${s.framing}`),
    experienceBullets,
    orderedSkills,
    honestAdjustmentsMade,
    gupyKit: {
      apresenteseText: gupyApresentesePt,
      profileSummaryToUpdate: summaryPt,
      experienceBlocksToUpdate: experienceBullets.slice(0, 5),
      skillsTagsToAdd: profile.skills.map((s) => s.name)
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

function decodePdfLiteralString(s: string): string {
  return s
    .replace(/\\(\d{3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString('latin1');
  if (!raw.startsWith('%PDF')) {
    return pdfBuffer.toString('utf8');
  }

  const chunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(raw)) !== null) {
    const streamBody = Buffer.from(match[1], 'latin1');
    let decodedStream = match[1];
    try {
      decodedStream = zlib.inflateSync(streamBody).toString('latin1');
    } catch {
      try {
        decodedStream = zlib.inflateRawSync(streamBody).toString('latin1');
      } catch {
        // Uncompressed stream
      }
    }

    // Extract text from (literal) Tj and [(literal) -10 (literal)] TJ operators
    const textOps = decodedStream.match(/\((?:\\.|[^\\()])*\)\s*Tj|\[(?:\s*\((?:\\.|[^\\()])*\)|\s*-?\d+(?:\.\d+)?\s*)+\]\s*TJ/g);
    if (textOps) {
      const lineParts: string[] = [];
      for (const op of textOps) {
        const literals = op.match(/\((?:\\.|[^\\()])*\)/g) || [];
        const lineText = literals.map((lit) => decodePdfLiteralString(lit.slice(1, -1))).join('');
        if (lineText.trim()) lineParts.push(lineText);
      }
      if (lineParts.length) chunks.push(lineParts.join('\n'));
    }
  }

  return chunks.join('\n').trim() || raw.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ');
}

export function formatPhoneMask(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  let normalized = digits;
  if (normalized.length === 10 || normalized.length === 11) {
    normalized = '55' + normalized;
  }
  if (normalized.length >= 12 && normalized.startsWith('55')) {
    const ddd = normalized.slice(2, 4);
    const rest = normalized.slice(4, 13);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return rawPhone.trim();
}

export function extractProfileFromCvText(
  rawText: string,
  db: {
    updateProfileInfo: (info: Record<string, unknown>) => Profile;
    addCertification: (cert: { name: string; issuer?: string; year?: string }) => Profile;
    addEducation: (edu: { course: string; institution: string; degree: string; status?: string; year?: string }) => Profile;
    clearPlaceholderEducations?: () => void;
    addPersonalProject: (proj: { name: string; techStack: string[]; descriptionPt: string; descriptionEn?: string }) => Profile;
    upsertSkill: (skill: { name: string; category: string; level: SkillLevel; keywords: string[]; honestFramingPt: string; honestFramingEn: string }) => Profile;
    getProfile: () => Profile;
  }
): Profile {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const infoPatch: Record<string, string> = {};

  const ignoredHeaderRx = /^(curr[íi]culo|curriculum vitae|cv|resumo|summary|perfil|contato|contact|dados pessoais)$/i;

  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/^#+\s*/, '').replace(/^(nome|name)\s*:\s*/i, '').trim();
    if (
      clean.length >= 4 &&
      clean.length <= 60 &&
      !ignoredHeaderRx.test(clean) &&
      !clean.includes('@') &&
      !/https?:\/\/|linkedin\.com|github\.com/i.test(clean) &&
      !/^\+?\d[\d\s()-]{7,}$/.test(clean) &&
      !/^(e-?mail|telefone|celular|phone|whatsapp|linkedin|github)\s*:/i.test(clean)
    ) {
      infoPatch.name = clean;
      break;
    }
  }

  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) infoPatch.email = emailMatch[0].toLowerCase();

  const phoneMatch = rawText.match(/(?:(?:\+|00)?55[\s-]?)?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/);
  if (phoneMatch) infoPatch.phone = formatPhoneMask(phoneMatch[0]);

  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) {
    infoPatch.linkedin = linkedinMatch[0].startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;
  }

  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  if (githubMatch) {
    infoPatch.github = githubMatch[0].startsWith('http') ? githubMatch[0] : `https://${githubMatch[0]}`;
  }

  // Section-aware parsing
  type SectionType = 'header' | 'summary' | 'education' | 'certifications' | 'skills' | 'projects' | 'experience';
  let currentSection: SectionType = 'header';
  const sections: Record<SectionType, string[]> = {
    header: [],
    summary: [],
    education: [],
    certifications: [],
    skills: [],
    projects: [],
    experience: []
  };

  for (const line of lines) {
    const headerCheck = line.replace(/^#+\s*/, '').replace(/:$/, '').trim();
    if (/^(resumo( profissional)?|professional summary|summary|sobre mim|perfil profissional|objetivo)$/i.test(headerCheck)) {
      currentSection = 'summary';
      continue;
    }
    if (/^(forma[çc][ãa]o( acad[êe]mica)?|educa[çc][ãa]o|escolaridade|gradua[çc][ãa]o|academic|education)$/i.test(headerCheck)) {
      currentSection = 'education';
      continue;
    }
    if (/^(certifica[çc][õo]es|certifications|cursos e certifica[çc][õo]es|credentials)$/i.test(headerCheck)) {
      currentSection = 'certifications';
      continue;
    }
    if (/^(habilidades( t[ée]cnicas)?|compet[êe]ncias|skills|technical skills|tecnologias|stack|ferramentas)$/i.test(headerCheck)) {
      currentSection = 'skills';
      continue;
    }
    if (/^(projetos( pessoais)?|personal projects|projects|portf[óo]lio|homelab)$/i.test(headerCheck)) {
      currentSection = 'projects';
      continue;
    }
    if (/^(experi[êe]ncia( profissional)?|work experience|experience|hist[óo]rico profissional)$/i.test(headerCheck)) {
      currentSection = 'experience';
      continue;
    }

    sections[currentSection].push(line);
  }

  if (sections.summary.length > 0) {
    const joinedSummary = sections.summary.join(' ').trim();
    if (joinedSummary.length >= 25) {
      infoPatch.baseSummaryPt = joinedSummary;
    }
  }

  if (Object.keys(infoPatch).length > 0) {
    db.updateProfileInfo(infoPatch);
  }

  // Extract Educations (from education section + inline degree lines)
  const eduLines = [
    ...sections.education,
    ...lines.filter((l) =>
      /\b(bacharelado|tecn[óo]logo|licenciatura|gradua[çc][ãa]o|p[óo]s-gradua[çc][ãa]o|mba|mestrado|engenharia|ci[êe]ncia da computa[çc][ãa]o|sistemas de informa[çc][ãa]o|an[áa]lise e desenvolvimento|redes de computadores|fatec|fiap|usp|puc|unip|est[áa]cio|senac|senai|unicamp|ufmg|ufrj)\b/i.test(
        l
      )
    )
  ];

  const uniqueEduLines = Array.from(new Set(eduLines.map((l) => l.replace(/^[-•*]\s*/, '').replace(/^(forma[çc][ãa]o|educa[çc][ãa]o|ensino)\s*:\s*/i, '').trim()))).filter(
    (l) => l.length > 8
  );

  if (uniqueEduLines.length > 0 && db.clearPlaceholderEducations) {
    db.clearPlaceholderEducations();
  }

  for (const line of uniqueEduLines) {
    const yearMatch = line.match(/\b(20\d{2}|19\d{2})\b/);
    const withoutYear = line.replace(/\([^)]*\d{4}[^)]*\)/g, '').trim();
    const parts = withoutYear.split(/\s+[-–—|•]\s+/);
    const course = (parts[0] || withoutYear).trim();
    const institution = (parts[1] || 'Instituição de Ensino').trim();
    const degree = /p[óo]s|mba|especializa[çc][ãa]o/i.test(line)
      ? 'Pós-Graduação / MBA'
      : /tecn[óo]logo/i.test(line)
      ? 'Tecnólogo'
      : /mestrado|doutorado/i.test(line)
      ? 'Mestrado / Doutorado'
      : /t[ée]cnico/i.test(line)
      ? 'Ensino Técnico'
      : 'Bacharelado / Graduação';
    const status = /cursando|andamento|em curso|presente/i.test(line) ? 'Cursando' : 'Concluído';

    db.addEducation({
      course,
      institution,
      degree,
      status,
      year: yearMatch ? yearMatch[1] : ''
    });
  }

  // Extract Certifications (from certifications section + known patterns)
  for (const certLine of sections.certifications) {
    const clean = certLine.replace(/^[-•*]\s*/, '').trim();
    if (clean.length < 4) continue;
    const yearMatch = clean.match(/\b(20\d{2})\b/);
    const withoutYear = clean.replace(/\(\s*20\d{2}\s*\)/g, '').trim();
    const parts = withoutYear.split(/\s+[-–—|]\s+/);
    const name = parts[0].trim();
    const issuer = parts[1]?.trim() || 'Certificadora Oficial';
    db.addCertification({ name, issuer, year: yearMatch ? yearMatch[1] : 'Ativa' });
  }

  const knownCerts = [
    { rx: /AWS.*Solutions Architect.*Associate|SAA-C03/i, name: 'AWS Certified Solutions Architect - Associate (SAA-C03)', issuer: 'AWS' },
    { rx: /AWS.*Cloud Practitioner|CLF-C0[12]/i, name: 'AWS Certified Cloud Practitioner', issuer: 'AWS' },
    { rx: /Terraform Associate/i, name: 'HashiCorp Certified: Terraform Associate', issuer: 'HashiCorp' },
    { rx: /\bCKA\b|Certified Kubernetes Administrator/i, name: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF' },
    { rx: /\bCKAD\b|Certified Kubernetes Application Developer/i, name: 'Certified Kubernetes Application Developer (CKAD)', issuer: 'CNCF' },
    { rx: /AZ-104|Azure Administrator/i, name: 'Microsoft Certified: Azure Administrator Associate (AZ-104)', issuer: 'Microsoft' },
    { rx: /AZ-900|Azure Fundamentals/i, name: 'Microsoft Certified: Azure Fundamentals (AZ-900)', issuer: 'Microsoft' },
    { rx: /GitHub Actions Certified/i, name: 'GitHub Actions Certified', issuer: 'GitHub' }
  ];

  for (const kc of knownCerts) {
    if (kc.rx.test(rawText)) {
      db.addCertification({ name: kc.name, issuer: kc.issuer, year: 'Ativa' });
    }
  }

  // Extract Personal Projects
  const projLines = [
    ...sections.projects,
    ...lines.filter((l) => /^(projeto|project|homelab)\s*[:\-]/i.test(l) || /projeto pessoal\s*:/i.test(l))
  ];
  for (const pLine of projLines) {
    const cleaned = pLine.replace(/^[-•*]\s*/, '').replace(/^projeto( pessoal)?\s*:\s*/i, '').trim();
    if (cleaned.length < 8) continue;
    const [rawName, ...rest] = cleaned.split(/\s*:\s*/);
    const projName = (rest.length > 0 ? rawName : cleaned.slice(0, 55)).trim();
    const projDesc = (rest.length > 0 ? rest.join(': ') : cleaned).trim();
    const stackCandidates = ['Docker', 'Kubernetes', 'ArgoCD', 'AWS', 'Terraform', 'Ansible', 'Grafana', 'Prometheus', 'GitHub Actions', 'Linux', 'Kind', 'Python', 'Helm'];
    const detectedStack = stackCandidates.filter((t) => new RegExp(t, 'i').test(cleaned));
    db.addPersonalProject({
      name: projName,
      techStack: detectedStack.length ? detectedStack : ['DevOps', 'Cloud'],
      descriptionPt: projDesc,
      descriptionEn: projDesc
    });
  }

  // Extract Skills from comprehensive catalog
  const skillsCatalog: Array<{ name: string; category: string; kw: string[]; pt: string; en: string }> = [
    {
      name: 'Prometheus',
      category: 'Observabilidade',
      kw: ['prometheus', 'promql', 'alertmanager'],
      pt: 'Coleta de métricas e monitoramento de ambientes e containers utilizando Prometheus.',
      en: 'Metrics collection and container monitoring using Prometheus.'
    },
    {
      name: 'Linux',
      category: 'Sistemas',
      kw: ['linux', 'ubuntu', 'debian', 'rhel', 'centos', 'bash', 'shell script'],
      pt: 'Administração de ambientes Linux, automação via Shell Script/Bash e troubleshooting de rede e processos.',
      en: 'Linux administration, Bash/Shell scripting automation, and network/process troubleshooting.'
    },
    {
      name: 'Python',
      category: 'Automação & Scripting',
      kw: ['python', 'boto3'],
      pt: 'Desenvolvimento de scripts de automação e integração de infraestrutura utilizando Python.',
      en: 'Developing infrastructure automation scripts and integrations using Python.'
    },
    {
      name: 'Helm',
      category: 'Orquestração',
      kw: ['helm', 'helm charts'],
      pt: 'Empacotamento e parametrização de aplicações em Kubernetes utilizando Helm Charts.',
      en: 'Packaging and templating Kubernetes applications using Helm Charts.'
    },
    {
      name: 'GitLab CI',
      category: 'CI/CD',
      kw: ['gitlab ci', 'gitlab-ci'],
      pt: 'Construção e manutenção de pipelines de integração e entrega contínua no GitLab CI.',
      en: 'Building and maintaining CI/CD pipelines in GitLab CI.'
    },
    {
      name: 'Jenkins',
      category: 'CI/CD',
      kw: ['jenkins', 'jenkinsfile'],
      pt: 'Automação de esteiras de build e deploy contínuo utilizando Jenkins.',
      en: 'Automating build and deployment pipelines using Jenkins.'
    },
    {
      name: 'Azure',
      category: 'Cloud',
      kw: ['azure', 'microsoft azure', 'aks', 'azure devops'],
      pt: 'Vivência em serviços de nuvem Microsoft Azure e esteiras Azure DevOps.',
      en: 'Experience with Microsoft Azure cloud services and Azure DevOps pipelines.'
    },
    {
      name: 'GCP (Google Cloud)',
      category: 'Cloud',
      kw: ['gcp', 'google cloud', 'gke'],
      pt: 'Atuação com recursos de nuvem no Google Cloud Platform (GCP).',
      en: 'Working with cloud infrastructure on Google Cloud Platform (GCP).'
    },
    {
      name: 'Zabbix',
      category: 'Observabilidade',
      kw: ['zabbix'],
      pt: 'Monitoramento de infraestrutura, servidores e ativos de rede com Zabbix.',
      en: 'Infrastructure, server, and network monitoring using Zabbix.'
    }
  ];

  for (const item of skillsCatalog) {
    if (item.kw.some((k) => new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(k)}([^a-zA-Z0-9]|$)`, 'i').test(rawText))) {
      db.upsertSkill({
        name: item.name,
        category: item.category,
        level: 'practical',
        keywords: item.kw,
        honestFramingPt: item.pt,
        honestFramingEn: item.en
      });
    }
  }

  return db.getProfile();
}
