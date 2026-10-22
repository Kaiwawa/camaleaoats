export type Language = 'pt-BR' | 'en';
export type SkillLevel = 'evolving' | 'practical' | 'solid';
export type KanbanStatus = 'abertas' | 'em_processo' | 'sem_sucesso' | 'ruins';
export type RecruiterStatus = 'nao_enviado' | 'aguardando_aceite' | 'dm_enviada';

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
  targetSeniority: string;
  targetSeniorityEn: string;
  skills: Skill[];
}

export interface NewJobInput {
  title: string;
  company: string;
  url: string;
  platform?: string;
  location?: string;
  description: string;
  language?: Language;
  matchScore?: number;
  recruiterName?: string;
  recruiterUrl?: string;
  recruiterEmail?: string;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  url: string;
  platform: string;
  location: string;
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
