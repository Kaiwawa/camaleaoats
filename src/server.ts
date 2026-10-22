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
  generateRecruiterMessages
} from './ats-engine.ts';
import { generateAtsPdfBuffer } from './pdf-generator.ts';
import {
  collectRemoteDevOpsJobs,
  ingestJobFromUrlOrText,
  runAutoApplication
} from './scraper-and-applier.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
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

      if (method === 'GET' && pathname === '/api/bootstrap') {
        db.deleteDemoJobs();
        let jobs = db.listJobs();
        if (jobs.length === 0 && !customDb) {
          await collectRemoteDevOpsJobs(db);
          jobs = db.listJobs();
        }
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
        const seniorityFilter = body.seniorityFilter ? (String(body.seniorityFilter) as JobSeniority | 'all') : 'all';
        const workMode = body.workMode
          ? (String(body.workMode) as 'remoto_br' | 'remoto_global' | 'hibrido_sp')
          : 'remoto_br';
        db.deleteDemoJobs();
        const result = await collectRemoteDevOpsJobs(db, fetch, { seniorityFilter, workMode });
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && pathname === '/api/jobs/ingest') {
        const body = await readJsonBody(req);
        const created = await ingestJobFromUrlOrText(db, {
          url: String(body.url ?? ''),
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
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${safeName}"`,
          'content-length': pdfBuffer.length
        });
        return res.end(pdfBuffer);
      }

      const moveMatch = pathname.match(/^\/api\/jobs\/(\d+)\/move$/);
      if (method === 'POST' && moveMatch) {
        const jobId = Number(moveMatch[1]);
        const body = await readJsonBody(req);
        const status = String(body.status) as KanbanStatus;
        const reason = String(body.reason ?? '');
        const updated = db.moveJob(jobId, status, reason);
        return sendJson(res, 200, {
          job: updated,
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
        } else if (body.name) {
          db.addCertification({
            name: String(body.name),
            issuer: String(body.issuer ?? ''),
            year: String(body.year ?? ''),
            credentialUrl: String(body.credentialUrl ?? '')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/educations') {
        const body = await readJsonBody(req);
        if (body.deleteId) {
          db.deleteEducation(Number(body.deleteId));
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
        } else if (body.name) {
          const stack = Array.isArray(body.techStack)
            ? body.techStack.map(String)
            : String(body.techStack ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
          db.addPersonalProject({
            name: String(body.name),
            techStack: stack.length ? stack : ['DevOps'],
            descriptionPt: String(body.descriptionPt ?? ''),
            descriptionEn: String(body.descriptionEn || body.descriptionPt || ''),
            url: String(body.url ?? '')
          });
        }
        return sendJson(res, 200, { profile: db.getProfile() });
      }

      if (method === 'POST' && pathname === '/api/profile/evolve') {
        const body = await readJsonBody(req);
        if (body.deleteSkillId) {
          db.deleteSkill(Number(body.deleteSkillId));
        } else if (body.skillId) {
          db.evolveSkill(Number(body.skillId), {
            level: body.level ? (String(body.level) as SkillLevel) : undefined,
            honestFramingPt: body.honestFramingPt ? String(body.honestFramingPt) : undefined,
            honestFramingEn: body.honestFramingEn ? String(body.honestFramingEn) : undefined,
            projectNote: body.projectNote ? String(body.projectNote) : undefined
          });
        } else if (body.newSkillName) {
          db.upsertSkill({
            name: String(body.newSkillName),
            category: String(body.category || 'DevOps / Cloud'),
            level: (String(body.level || 'practical') as SkillLevel),
            keywords: String(body.keywords || body.newSkillName)
              .split(',')
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean),
            honestFramingPt: String(body.honestFramingPt || `Vivência prática com ${body.newSkillName}.`),
            honestFramingEn: String(body.honestFramingEn || `Hands-on experience with ${body.newSkillName}.`)
          });
        }

        if (body.profileInfo && typeof body.profileInfo === 'object') {
          db.updateProfileInfo(body.profileInfo as Record<string, string>);
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
        const body = await readJsonBody(req);
        const agent = db.updateAgentPrompt(slug, String(body.content ?? ''));
        return sendJson(res, 200, { agent, agentPrompts: db.listAgentPrompts() });
      }

      // Serve static files
      const fileMap: Record<string, { file: string; type: string }> = {
        '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
        '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
        '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
        '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' }
      };

      const target = fileMap[pathname];
      if (method === 'GET' && target) {
        const fullPath = path.join(PUBLIC_DIR, target.file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath);
          res.writeHead(200, { 'content-type': target.type });
          return res.end(content);
        }
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
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
