import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppDatabase } from './db.ts';
import type { JobSeniority, KanbanStatus, Language, RecruiterStatus, SkillLevel, ThemeMode } from './types.ts';
import {
  analyzeAndHighlightJob,
  extractProfileFromCvText,
  extractTextFromPdfBuffer,
  generateHonestTailoredCv,
  generateRecruiterMessages,
  translateCvText
} from './ats-engine.ts';
import { generateAtsPdfBuffer } from './pdf-generator.ts';
import {
  collectRemoteDevOpsJobs,
  ingestJobFromUrlOrText,
  isSafeExternalHttpUrl,
  runAutoApplication,
  type LocationScope,
  type ModalityOption
} from './scraper-and-applier.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB max request body size

const BASE_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload Too Large');
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      req.destroy();
      throw new PayloadTooLargeError();
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    ...BASE_SECURITY_HEADERS,
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data)
  });
  res.end(data);
}

export function createAppServer(customDb?: AppDatabase): http.Server {
  const db = customDb ?? new AppDatabase(process.env.CAMALEAO_DB_PATH || path.join(process.cwd(), 'data', 'camaleao.db'));

  const rescoreAllJobs = () => {
    const profile = db.getProfile();
    const weights = db.getPreferenceWeights();
    for (const j of db.listJobs()) {
      const analysis = analyzeAndHighlightJob(j, profile, weights);
      db.upsertJob({ ...j, matchScore: analysis.matchScore });
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = reqUrl.pathname;
      const method = req.method || 'GET';

      // Block Cross-Origin Drive-By CSRF attacks against local/self-hosted instance
      if ((method === 'POST' || method === 'DELETE') && pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin) {
          try {
            const originHost = new URL(origin).hostname.toLowerCase();
            const reqHost = String(req.headers.host || 'localhost').split(':')[0].toLowerCase();
            const isLocal =
              (originHost === 'localhost' || originHost === '127.0.0.1') &&
              (reqHost === 'localhost' || reqHost === '127.0.0.1');
            if (originHost !== reqHost && !isLocal) {
              return sendJson(res, 403, { error: 'Forbidden: Cross-origin request blocked' });
            }
          } catch {
            return sendJson(res, 403, { error: 'Forbidden: Invalid Origin header' });
          }
        }
      }

      if (method === 'GET' && pathname === '/api/bootstrap') {
        db.deleteDemoJobs();
        const jobs = db.listJobs();
        return sendJson(res, 200, {
          profile: db.getProfile(),
          jobs,
          preferenceWeights: db.getPreferenceWeights(),
          settings: db.getSettings(),
          agentPrompts: db.listAgentPrompts()
        });
      }

      if (method === 'POST' && pathname === '/api/jobs/scrape') {
        const body = await readJsonBody(req);
        const customQueryTitle = body.customQueryTitle ? String(body.customQueryTitle).trim() : undefined;
        const seniorityFilter = body.seniorityFilter ? (String(body.seniorityFilter) as JobSeniority | 'all') : 'all';
        const seniorities = Array.isArray(body.seniorities) ? body.seniorities.map(String) : undefined;
        const workMode = body.workMode
          ? (String(body.workMode) as 'remoto_br' | 'remoto_global' | 'hibrido_sp')
          : 'remoto_br';
        const locationFilter = body.locationFilter ? (String(body.locationFilter) as LocationScope) : undefined;
        const workModes = Array.isArray(body.workModes)
          ? (body.workModes.map(String) as ModalityOption[])
          : undefined;
        db.deleteDemoJobs();
        const result = await collectRemoteDevOpsJobs(db, fetch, {
          customQueryTitle,
          seniorityFilter,
          seniorities,
          workMode,
          locationFilter,
          workModes
        });
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && pathname === '/api/jobs/ingest') {
        const body = await readJsonBody(req);
        const rawUrl = String(body.url ?? '').trim();
        if (rawUrl && !isSafeExternalHttpUrl(rawUrl)) {
          return sendJson(res, 400, { error: 'Invalid or restricted URL' });
        }
        const created = await ingestJobFromUrlOrText(db, {
          url: rawUrl,
          rawText: String(body.rawText ?? ''),
          title: String(body.title ?? ''),
          company: String(body.company ?? ''),
          location: String(body.location ?? '100% Remoto'),
          recruiterName: String(body.recruiterName ?? ''),
          recruiterUrl: String(body.recruiterUrl ?? ''),
          recruiterEmail: String(body.recruiterEmail ?? '')
        });
        if (body.seniority) {
          db.updateJobSeniority(created.id, String(body.seniority) as JobSeniority);
        }
        return sendJson(res, 200, db.getJob(created.id));
      }

      const detailMatch = pathname.match(/^\/api\/jobs\/(\d+)\/detail$/);
      if (method === 'GET' && detailMatch) {
        const jobId = Number(detailMatch[1]);
        const job = db.getJob(jobId);
        if (!job) return sendJson(res, 404, { error: 'Job not found' });

        const langParam = reqUrl.searchParams.get('lang') as Language | null;
        const lang: Language = langParam === 'en' || langParam === 'pt-BR' ? langParam : job.language;
        const profile = db.getProfile();
        const analysis = analyzeAndHighlightJob(job, profile, db.getPreferenceWeights());
        const tailoredCv = generateHonestTailoredCv(job, profile, lang);
        const recruiterMessages = generateRecruiterMessages(job, profile, analysis.strongMatches, lang);

        return sendJson(res, 200, {
          job,
          analysis,
          tailoredCv,
          recruiterMessages
        });
      }

      const pdfMatch = pathname.match(/^\/api\/jobs\/(\d+)\/cv\.pdf$/);
      if (method === 'GET' && pdfMatch) {
        const jobId = Number(pdfMatch[1]);
        const job = db.getJob(jobId);
        if (!job) return sendJson(res, 404, { error: 'Job not found' });

        const langParam = reqUrl.searchParams.get('lang') as Language | null;
        const lang: Language = langParam === 'en' || langParam === 'pt-BR' ? langParam : job.language;
        const profile = db.getProfile();
        const tailoredCv = generateHonestTailoredCv(job, profile, lang);
        const pdfBuffer = generateAtsPdfBuffer(tailoredCv, profile);

        const safeName = `CV-DevOps-${job.company.replace(/[^a-zA-Z0-9_-]/g, '_')}-${lang}.pdf`;
        res.writeHead(200, {
          ...BASE_SECURITY_HEADERS,
          'cache-control': 'no-store',
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${safeName}"`,
          'content-length': pdfBuffer.length
        });
        return res.end(pdfBuffer);
      }

      if (method === 'POST' && pathname === '/api/jobs/clear-open') {
        const deletedCount = db.clearOpenJobs();
        return sendJson(res, 200, {
          deletedCount,
          jobs: db.listJobs()
        });
      }

      if (method === 'POST' && pathname === '/api/jobs/clear-unsuccessful') {
        const deletedCount = db.clearJobsByStatus('sem_sucesso');
        return sendJson(res, 200, {
          deletedCount,
          jobs: db.listJobs()
        });
      }

      const deleteJobMatch = pathname.match(/^\/api\/jobs\/(\d+)(?:\/delete)?$/);
      if ((method === 'DELETE' || (method === 'POST' && pathname.endsWith('/delete'))) && deleteJobMatch) {
        const jobId = Number(deleteJobMatch[1]);
        const deleted = db.deleteJob(jobId);
        if (!deleted) return sendJson(res, 404, { error: 'Job not found' });
        rescoreAllJobs();
        return sendJson(res, 200, {
          deleted: true,
          jobs: db.listJobs()
        });
      }

      const moveMatch = pathname.match(/^\/api\/jobs\/(\d+)\/move$/);
      if (method === 'POST' && moveMatch) {
        const jobId = Number(moveMatch[1]);
        const body = await readJsonBody(req);
        const status = String(body.status) as KanbanStatus;
        const reason = String(body.reason ?? '');
        const updated = db.moveJob(jobId, status, reason);
        rescoreAllJobs();
        return sendJson(res, 200, {
          job: db.getJob(jobId) ?? updated,
          preferenceWeights: db.getPreferenceWeights()
        });
      }

      const seniorityMatch = pathname.match(/^\/api\/jobs\/(\d+)\/seniority$/);
      if (method === 'POST' && seniorityMatch) {
        const jobId = Number(seniorityMatch[1]);
        const body = await readJsonBody(req);
        const updated = db.updateJobSeniority(jobId, String(body.seniority) as JobSeniority);
        return sendJson(res, 200, updated);
      }

      const recruiterMatch = pathname.match(/^\/api\/jobs\/(\d+)\/recruiter$/);
      if (method === 'POST' && recruiterMatch) {
        const jobId = Number(recruiterMatch[1]);
        const body = await readJsonBody(req);
        const updated = db.updateRecruiterTracker(jobId, {
          recruiterName: body.recruiterName !== undefined ? String(body.recruiterName) : undefined,
          recruiterUrl: body.recruiterUrl !== undefined ? String(body.recruiterUrl) : undefined,
          recruiterEmail: body.recruiterEmail !== undefined ? String(body.recruiterEmail) : undefined,
          recruiterStatus: body.recruiterStatus !== undefined ? (String(body.recruiterStatus) as RecruiterStatus) : undefined
        });
        return sendJson(res, 200, updated);
      }

      const applyMatch = pathname.match(/^\/api\/jobs\/(\d+)\/apply$/);
      if (method === 'POST' && applyMatch) {
        const jobId = Number(applyMatch[1]);
        const body = await readJsonBody(req);
        const lang = (body.lang === 'en' || body.lang === 'pt-BR' ? body.lang : undefined) as Language | undefined;
        const outcome = await runAutoApplication(db, jobId, { lang });
        return sendJson(res, 200, {
          ...outcome,
          job: db.getJob(jobId)
        });
      }

      if (method === 'POST' && pathname === '/api/profile/extract-cv') {
        const body = await readJsonBody(req);
        let rawText = String(body.rawText ?? '');
        if (body.pdfBase64 && typeof body.pdfBase64 === 'string') {
          const pdfBuf = Buffer.from(body.pdfBase64, 'base64');
          const pdfExtracted = extractTextFromPdfBuffer(pdfBuf);
          if (pdfExtracted.trim().length > 0) {
            rawText = pdfExtracted + '\n' + rawText;
          }
        }
        const profile = extractProfileFromCvText(rawText, db);
        rescoreAllJobs();
        return sendJson(res, 200, {
          profile,
          jobs: db.listJobs()
        });
      }

      if (method === 'POST' && pathname === '/api/profile/certifications') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deleteCertification(Number(body.deleteId));
        } else if (body.editId) {
          db.updateCertification(Number(body.editId), {
            name: body.name !== undefined ? String(body.name) : undefined,
            code: body.code !== undefined ? String(body.code) : undefined,
            issuer: body.issuer !== undefined ? String(body.issuer) : undefined,
            year: body.year !== undefined ? String(body.year).replace(/\D/g, '').slice(0, 4) : undefined,
            credentialUrl: body.credentialUrl !== undefined ? String(body.credentialUrl) : undefined
          });
        } else if (body.name) {
          db.addCertification({
            name: String(body.name),
            code: String(body.code ?? ''),
            issuer: String(body.issuer ?? ''),
            year: String(body.year ?? '').replace(/\D/g, '').slice(0, 4),
            credentialUrl: String(body.credentialUrl ?? '')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/educations') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deleteEducation(Number(body.deleteId));
        } else if (body.editId) {
          db.updateEducation(Number(body.editId), {
            course: body.course !== undefined ? String(body.course) : undefined,
            institution: body.institution !== undefined ? String(body.institution) : undefined,
            degree: body.degree !== undefined ? String(body.degree) : undefined,
            status: body.status !== undefined ? String(body.status) : undefined,
            year: body.year !== undefined ? String(body.year).replace(/\D/g, '').slice(0, 4) : undefined
          });
        } else if (body.course) {
          db.addEducation({
            course: String(body.course),
            institution: String(body.institution ?? ''),
            degree: String(body.degree ?? 'Graduação'),
            status: String(body.status ?? 'Concluído'),
            year: String(body.year ?? '')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/projects') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deletePersonalProject(Number(body.deleteId));
        } else if (body.editId) {
          const stack =
            body.techStack !== undefined
              ? Array.isArray(body.techStack)
                ? body.techStack.map(String)
                : String(body.techStack)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
              : undefined;
          const rawDesc = body.description !== undefined ? String(body.description) : body.descriptionPt !== undefined ? String(body.descriptionPt) : undefined;
          db.updatePersonalProject(Number(body.editId), {
            name: body.name !== undefined ? String(body.name) : undefined,
            techStack: stack,
            descriptionPt: rawDesc !== undefined ? translateCvText(rawDesc, 'pt-BR') : undefined,
            descriptionEn:
              body.descriptionEn !== undefined && body.descriptionEn !== body.descriptionPt
                ? String(body.descriptionEn)
                : rawDesc !== undefined
                ? translateCvText(rawDesc, 'en')
                : undefined,
            url: body.url !== undefined ? String(body.url) : undefined
          });
        } else if (body.name) {
          const stack = Array.isArray(body.techStack)
            ? body.techStack.map(String)
            : String(body.techStack ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
          const rawDesc = String(body.description ?? body.descriptionPt ?? '');
          db.addPersonalProject({
            name: String(body.name),
            techStack: stack.length ? stack : ['DevOps'],
            descriptionPt: translateCvText(rawDesc, 'pt-BR'),
            descriptionEn:
              body.descriptionEn && body.descriptionEn !== body.descriptionPt
                ? String(body.descriptionEn)
                : translateCvText(rawDesc, 'en'),
            url: String(body.url ?? '')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/languages') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deleteLanguage(Number(body.deleteId));
        } else if (body.editId) {
          db.updateLanguage(Number(body.editId), {
            language: body.language !== undefined ? String(body.language) : undefined,
            proficiency: body.proficiency !== undefined ? String(body.proficiency) : undefined
          });
        } else if (body.language) {
          db.addLanguage({
            language: String(body.language),
            proficiency: String(body.proficiency ?? 'Intermediário')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/experiences') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deleteExperience(Number(body.deleteId));
        } else if (body.editId) {
          const rawSummary =
            body.summary !== undefined
              ? String(body.summary)
              : body.descriptionPt !== undefined
              ? String(body.descriptionPt)
              : undefined;
          db.updateExperience(Number(body.editId), {
            role: body.role !== undefined ? String(body.role) : undefined,
            company: body.company !== undefined ? String(body.company) : undefined,
            period: body.period !== undefined ? String(body.period) : undefined,
            descriptionPt: rawSummary !== undefined ? translateCvText(rawSummary, 'pt-BR') : undefined,
            descriptionEn:
              body.descriptionEn !== undefined && body.descriptionEn !== body.descriptionPt
                ? String(body.descriptionEn)
                : rawSummary !== undefined
                ? translateCvText(rawSummary, 'en')
                : undefined
          });
        } else if (body.role && body.company) {
          const rawSummary = String(body.summary ?? body.descriptionPt ?? '');
          db.addExperience({
            role: String(body.role),
            company: String(body.company),
            period: String(body.period ?? ''),
            descriptionPt: translateCvText(rawSummary, 'pt-BR'),
            descriptionEn:
              body.descriptionEn && body.descriptionEn !== body.descriptionPt
                ? String(body.descriptionEn)
                : translateCvText(rawSummary, 'en')
          });
        }
        rescoreAllJobs();
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/evolve') {
        const body = await readJsonBody(req);
        if (body.deleteSkillId) {
          db.deleteSkill(Number(body.deleteSkillId));
        } else if (body.skillId) {
          const rawFraming =
            body.description !== undefined
              ? String(body.description)
              : body.honestFramingPt !== undefined
              ? String(body.honestFramingPt)
              : undefined;
          db.evolveSkill(Number(body.skillId), {
            name: body.name ? String(body.name) : undefined,
            category: body.category ? String(body.category) : undefined,
            level: body.level ? (String(body.level) as SkillLevel) : undefined,
            honestFramingPt: rawFraming !== undefined ? translateCvText(rawFraming, 'pt-BR') : undefined,
            honestFramingEn:
              body.honestFramingEn && body.honestFramingEn !== body.honestFramingPt
                ? String(body.honestFramingEn)
                : rawFraming !== undefined
                ? translateCvText(rawFraming, 'en')
                : undefined,
            projectNote: body.projectNote ? String(body.projectNote) : undefined
          });
        } else if (body.newSkillName) {
          const rawFraming = String(
            body.description || body.honestFramingPt || `Vivência prática com ${body.newSkillName}.`
          );
          db.upsertSkill({
            name: String(body.newSkillName),
            category: String(body.category || 'DevOps / Cloud'),
            level: (String(body.level || 'practical') as SkillLevel),
            keywords: String(body.keywords || body.newSkillName)
              .split(',')
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean),
            honestFramingPt: translateCvText(rawFraming, 'pt-BR'),
            honestFramingEn:
              body.honestFramingEn && body.honestFramingEn !== body.honestFramingPt
                ? String(body.honestFramingEn)
                : translateCvText(rawFraming, 'en')
          });
        }

        if (body.profileInfo && typeof body.profileInfo === 'object') {
          const info = body.profileInfo as Record<string, string>;
          if (info.titlePt && !info.titleEn) {
            info.titleEn = info.titlePt;
          }
          db.updateProfileInfo(info);
        }

        rescoreAllJobs();
        return sendJson(res, 200, {
          profile: db.getProfile(),
          jobs: db.listJobs()
        });
      }

      if (method === 'POST' && pathname === '/api/settings') {
        const body = await readJsonBody(req);
        const settings = db.updateSettings({
          aiProvider: body.aiProvider ? (String(body.aiProvider) as 'deterministic' | 'openai' | 'gemini' | 'groq' | 'ollama') : undefined,
          apiKey: body.apiKey !== undefined ? String(body.apiKey) : undefined,
          modelName: body.modelName !== undefined ? String(body.modelName) : undefined,
          baseUrl: body.baseUrl !== undefined ? String(body.baseUrl) : undefined,
          theme: body.theme ? (String(body.theme) as ThemeMode) : undefined
        });
        return sendJson(res, 200, { settings });
      }

      const agentMatch = pathname.match(/^\/api\/agents\/([a-zA-Z0-9._-]+)$/);
      if (method === 'POST' && agentMatch) {
        const slug = agentMatch[1];
        if (!/^[a-zA-Z0-9_-]+\.md$/.test(slug) || slug.includes('..')) {
          return sendJson(res, 400, { error: 'Invalid agent filename' });
        }
        const body = await readJsonBody(req);
        const agent = db.updateAgentPrompt(slug, String(body.content ?? ''));
        return sendJson(res, 200, { agent, agentPrompts: db.listAgentPrompts() });
      }

      // Serve static files
      const fileMap: Record<string, { file: string; type: string }> = {
        '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
        '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
        '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
        '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
        '/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml; charset=utf-8' },
        '/favicon.ico': { file: 'favicon.svg', type: 'image/svg+xml; charset=utf-8' }
      };

      const target = fileMap[pathname];
      if (method === 'GET' && target) {
        const fullPath = path.join(PUBLIC_DIR, target.file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath);
          res.writeHead(200, {
            ...BASE_SECURITY_HEADERS,
            'content-type': target.type
          });
          return res.end(content);
        }
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return sendJson(res, 413, { error: 'Payload Too Large (max 5MB)' });
      }
      if (err instanceof SyntaxError) {
        return sendJson(res, 400, { error: 'Malformed JSON body' });
      }
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Internal server error'
      });
    }
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const srv = createAppServer();
  srv.listen(port, '0.0.0.0', () => {
    console.log(`CamaleaoATS running on http://0.0.0.0:${port}`);
  });
}
