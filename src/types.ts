export type Language = 'pt-BR' | 'en';
export type SkillLevel = 'evolving' | 'practical' | 'solid';
export type KanbanStatus = 'abertas' | 'em_processo' | 'sem_sucesso' | 'ruins';
export type RecruiterStatus = 'nao_enviado' | 'aguardando_aceite' | 'dm_enviada';
export type JobSeniority = 'estagio' | 'junior' | 'junior_pleno' | 'pleno' | 'senior' | 'especialista';
export type ThemeMode = 'auto' | 'light' | 'dark';

export interface Skill {
  id: number;
  name: string;
  category: string;
  level: SkillLevel;
  keywords: string[];
  honestFramingPt: string;
  honestFramingEn: string;
  projectNote?: string;
}

export interface CertificationItem {
  id: number;
  name: string;
  code: string;
  issuer: string;
  year: string;
  credentialUrl?: string;
}

export interface EducationItem {
  id: number;
  course: string;
  institution: string;
  degree: string;
  status: string;
  year: string;
}

export interface PersonalProject {
  id: number;
  name: string;
  techStack: string[];
  descriptionPt: string;
  descriptionEn: string;
  url?: string;
}

export interface LanguageItem {
  id: number;
  language: string;
  proficiency: string;
}

export interface ExperienceItem {
  id: number;
  role: string;
  company: string;
  period: string;
  descriptionPt: string;
  descriptionEn: string;
}

export interface Profile {
  id: number;
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
  certificationItems: CertificationItem[];
  educations: EducationItem[];
  personalProjects: PersonalProject[];
  languages: LanguageItem[];
  experiences: ExperienceItem[];
  targetSeniority: string;
  targetSeniorityEn: string;
  skills: Skill[];
}

export interface AppSettings {
  aiProvider: 'deterministic' | 'openai' | 'gemini' | 'groq' | 'ollama';
  apiKey: string;
  modelName: string;
  baseUrl: string;
  theme: ThemeMode;
}

export interface AgentPromptMd {
  slug: string;
  title: string;
  description: string;
  content: string;
  updatedAt: string;
}

export interface NewJobInput {
  title: string;
  company: string;
  url: string;
  platform?: string;
  location?: string;
  seniority?: JobSeniority;
  description: string;
  language?: Language;
  matchScore?: number;
  recruiterName?: string;
  recruiterUrl?: string;
  recruiterEmail?: string;
  postedAt?: string;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  url: string;
  platform: string;
  location: string;
  seniority: JobSeniority;
  description: string;
  language: Language;
  status: KanbanStatus;
  rejectReason?: string;
  matchScore: number;
  recruiterName: string;
  recruiterUrl: string;
  recruiterEmail: string;
  recruiterStatus: RecruiterStatus;
  appliedAt?: string;
  postedAt: string;
  createdAt: string;
}

export interface GupyKit {
  apresenteseText: string;
  profileSummaryToUpdate: string;
  experienceBlocksToUpdate: string[];
  skillsTagsToAdd: string[];
}

export interface TailoredCv {
  language: Language;
  targetRoleTitle: string;
  summary: string;
  certifications: string[];
  educations: EducationItem[];
  relevantProjects: PersonalProject[];
  highlights: string[];
  experienceBullets: string[];
  orderedSkills: { name: string; level: SkillLevel; framing: string }[];
  honestAdjustmentsMade: string[];
  gupyKit: GupyKit;
}

export interface RecruiterMessages {
  language: Language;
  inviteNote: string;
  inviteCharCount: number;
  postAcceptDm: string;
  emailSubject: string;
  emailBody: string;
  linkedinSearchUrl: string;
}
