# CamaleãoATS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir e containerizar o website autônomo **CamaleãoATS** (bilíngue `pt-BR` e `en`) com quadro Kanban em tela única, popup de vaga na mesma página com grifos de match no texto completo, adaptador honesto de CV para ATS (PDF para InHire/LinkedIn/E-mail + **Modo Gupy com "Apresente-se" e ajuste do CV pré-cadastrado**), rastreador de conexão/DM para Tech Recruiter (LinkedIn Free ≤ 200 caracteres), coletor integrado de vagas remotas DevOps/SRE, aprendizado de gosto e evolução contínua de senioridade.

**Architecture:** Aplicação web full-stack em `/root/camaleao-ats` empacotada em container Docker (`Dockerfile` + `docker-compose.yml` com volume persistente `/app/data`) usando Node.js v24 nativo (`node:sqlite`, `node:http`, `node:test`). O backend gerencia o banco SQLite, o motor bilíngue (`pt-BR` / `en`) de match/adaptação anti-alucinação (incluindo o gerador específico de "Apresente-se" e campos do perfil da Gupy), o gerador de PDF ATS em coluna única, o coletor de vagas remotas e o executor de aplicação; o frontend SPA renderiza o Kanban de 4 colunas e os modais sobrepostos na mesma página.

**Tech Stack:** Docker & Docker Compose, Node.js v24, TypeScript nativo, SQLite (`node:sqlite`), HTML5/CSS3/Vanilla JS SPA, gerador PDF `%PDF-1.4` ATS-friendly (`WinAnsiEncoding`), automação Playwright.

**Spec:** `/root/docs/superpowers/specs/2026-10-21-camaleao-ats-devops-design.md`

## Global Constraints

- **Containerização Obrigatória:** Deve incluir `Dockerfile` e `docker-compose.yml` funcionais persistindo o banco SQLite e artefatos em volume, além de rodar localmente para testes rápidos.
- **Suporte Bilíngue (`pt-BR` e `en`):** Auto-detectar o idioma da vaga (`pt-BR` ou `en`) e permitir alternar manualmente no popup para gerar o CV em PDF, o "Apresente-se" da Gupy, os ajustes de perfil Gupy e as mensagens de Tech Recruiter tanto em Português do Brasil quanto em Inglês.
- **Modo Específico Gupy:** Quando a vaga for na Gupy (onde não se envia PDF avulso por vaga), gerar o texto **"Apresente-se"** otimizado para a IA da Gupy (Gaia) e os blocos exatos para atualizar o **CV pré-cadastrado na Gupy** (Resumo + Experiências/Habilidades), além de orientar o robô Playwright a preencher o "Apresente-se" e o perfil.
- **Anti-Alucinação Estrita:** Jamais inventar empresas, anos de experiência, certificações não possuídas ou transformar o nível `evolving` de Kubernetes (escrita de YAML) em administração sênior de clusters.
- **LinkedIn Free Limit:** A nota curta de convite para Tech Recruiter (`inviteNote`) deve ter **no máximo 200 caracteres** (`inviteNote.length <= 200`), em `pt-BR` ou `en`.

## Review Focus

1. **HTML bruto ou scripts na descrição da vaga ao aplicar grifos (`<mark>`):** Descrições vindas de scraping contendo `<`, `>` ou `<script>` devem ser escapadas antes de inserir `<mark class="match-strong">` e `<mark class="match-evolving">` (testado em Task 2: `test_highlight_escapes_html_before_marking`).
2. **Pressão por senioridade falsa em vagas Sênior de Kubernetes ou outras Clouds (em `pt-BR` e `en`):** Quando uma vaga exige "5+ years of production Kubernetes cluster administration" ou "Especialista GCP", o CV adaptado e o "Apresente-se" da Gupy devem manter o enquadramento real do perfil (manifestos YAML + ArgoCD + Docker e certificação AWS SAA-C03) sem inventar senioridade (testado em Task 2: `test_adapt_cv_and_gupy_apresentese_never_hallucinate_in_pt_and_en`).
3. **Estouro de 200 caracteres na nota de convite do LinkedIn com nomes longos (em `pt-BR` e `en`):** Mesmo com títulos e empresas longos, `inviteNote.length <= 200` deve ser respeitado nos dois idiomas (testado em Task 2: `test_invite_note_never_exceeds_200_chars_with_long_names`).
4. **Acentuação em português no PDF para leitura por robôs ATS:** Caracteres como `ã, ç, é, ê, í, ó, ú` devem ser codificados corretamente em `WinAnsiEncoding` no fluxo do PDF (testado em Task 3: `test_pdf_preserves_portuguese_accents_and_valid_header`).
5. **Duplicação de vagas e perda de status Kanban ao rodar o scraper novamente:** Coletar novamente uma vaga já existente não pode recriar o card em `abertas` nem perder o status `em_processo`/`ruins` (testado em Task 1: `test_upsert_job_deduplicates_and_preserves_kanban_status`).

---

## File Structure

- `/root/camaleao-ats/package.json` — Metadados e scripts (`start`, `test`).
- `/root/camaleao-ats/Dockerfile` & `/root/camaleao-ats/docker-compose.yml` — Containerização da aplicação com volume persistente `/app/data`.
- `/root/camaleao-ats/src/types.ts` — Interfaces TypeScript (`Language = 'pt-BR' | 'en'`, `Skill`, `Profile`, `Job`, `TailoredCv`, `GupyKit`, `RecruiterMessages`).
- `/root/camaleao-ats/src/db.ts` — Banco SQLite (`node:sqlite`), seed bilíngue do perfil DevOps do usuário, evolução de senioridade, deduplicação e aprendizado de gosto.
- `/root/camaleao-ats/src/ats-engine.ts` — Detector de idioma (`pt-BR`/`en`), grifos verde/amarelo, adaptador honesto de CV bilíngue, gerador do **Kit Gupy ("Apresente-se" + ajuste do CV pré-cadastrado)** e gerador de mensagens LinkedIn Free (≤ 200 chars + DM pós-aceite).
- `/root/camaleao-ats/src/pdf-generator.ts` — Gerador de currículo em PDF (`%PDF-1.4`, coluna única, `WinAnsiEncoding`, `pt-BR` e `en`).
- `/root/camaleao-ats/src/scraper-and-applier.ts` — Coletor integrado de vagas remotas DevOps/SRE (nacionais e internacionais) e executor de aplicação automatizada (diferenciando fluxo Gupy vs. fluxo de upload PDF).
- `/root/camaleao-ats/src/server.ts` — Servidor HTTP e API REST.
- `/root/camaleao-ats/src/public/index.html`, `styles.css`, `app.js` — Interface Kanban em tela única + Popup na mesma página (com aba/bloco Gupy "Apresente-se", seletor `🇧🇷 PT-BR | 🇺🇸 EN`, rastreador Tech Recruiter e modal de Evolução de Senioridade).
- `/root/camaleao-ats/tests/*.test.ts` — Suíte de testes automatizados.

---

### Task 1: Fundação do Projeto, Banco SQLite, Perfil Vivo Bilíngue e Aprendizado de Gosto

**Files:**
- Create: `/root/camaleao-ats/package.json`
- Create: `/root/camaleao-ats/src/types.ts`
- Create: `/root/camaleao-ats/src/db.ts`
- Test: `/root/camaleao-ats/tests/db.test.ts`

**Interfaces:**
- Produces:
  - `Language = 'pt-BR' | 'en'`
  - `SkillLevel = 'evolving' | 'practical' | 'solid'`
  - `KanbanStatus = 'abertas' | 'em_processo' | 'sem_sucesso' | 'ruins'`
  - `RecruiterStatus = 'nao_enviado' | 'aguardando_aceite' | 'dm_enviada'`
  - `class AppDatabase` (gerencia `profile`, `skills` com `honestFramingPt` e `honestFramingEn`, `jobs` e `preference_weights`)

- [ ] **Step 1: Garantir `node` no PATH, inicializar Git em `/root/camaleao-ats` e criar `package.json` + `src/types.ts`**
- [ ] **Step 2: Escrever os testes em `/root/camaleao-ats/tests/db.test.ts` (incluindo `test_upsert_job_deduplicates_and_preserves_kanban_status`)**
- [ ] **Step 3: Rodar `node --test tests/db.test.ts` e verificar que falha**
- [ ] **Step 4: Implementar `/root/camaleao-ats/src/db.ts` com seed bilíngue (`pt-BR` e `en`) do perfil DevOps real**
- [ ] **Step 5: Rodar `node --test tests/db.test.ts` e verificar que passa**
- [ ] **Step 6: Commit**

---

### Task 2: Motor ATS Bilíngue (`pt-BR` / `en`), Kit Especial Gupy ("Apresente-se" + Perfil) e Mensagens LinkedIn Free (≤ 200 caracteres)

**Files:**
- Create: `/root/camaleao-ats/src/ats-engine.ts`
- Test: `/root/camaleao-ats/tests/ats-engine.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Job`, `Language` from `src/types.ts`
- Produces:
  - `detectJobLanguage(text: string): Language`
  - `analyzeAndHighlightJob(job, profile, weights)`
  - `generateHonestTailoredCv(job, profile, lang?: Language): TailoredCv` (inclui `gupyKit: { apresenteseText: string; profileSummaryToUpdate: string; experienceBlocksToUpdate: string[]; skillsTagsToAdd: string[] }`)
  - `generateRecruiterMessages(job, profile, strongMatches, lang?: Language): RecruiterMessages`

- [ ] **Step 1: Escrever os testes em `/root/camaleao-ats/tests/ats-engine.test.ts` cobrindo:**
  - `test_highlight_escapes_html_before_marking`
  - `test_adapt_cv_and_gupy_apresentese_never_hallucinate_in_pt_and_en` (valida geração honesta em `pt-BR` e `en` + presença do `gupyKit.apresenteseText` e `gupyKit.profileSummaryToUpdate`)
  - `test_invite_note_never_exceeds_200_chars_with_long_names` (valida `<= 200` chars tanto em `pt-BR` quanto em `en`)
- [ ] **Step 2: Rodar `node --test tests/ats-engine.test.ts` e confirmar que falha**
- [ ] **Step 3: Implementar `/root/camaleao-ats/src/ats-engine.ts`**
- [ ] **Step 4: Rodar `node --test tests/ats-engine.test.ts` e confirmar que passa**
- [ ] **Step 5: Commit**

---

### Task 3: Gerador de PDF Otimizado para ATS Bilíngue (`pt-BR` / `en`)

**Files:**
- Create: `/root/camaleao-ats/src/pdf-generator.ts`
- Test: `/root/camaleao-ats/tests/pdf-generator.test.ts`

**Interfaces:**
- Consumes: `TailoredCv`, `Profile` from `src/types.ts`
- Produces: `generateAtsPdfBuffer(cv: TailoredCv, profile: Profile): Buffer`

- [ ] **Step 1: Escrever `tests/pdf-generator.test.ts` (`test_pdf_preserves_portuguese_accents_and_valid_header` + teste em inglês)**
- [ ] **Step 2: Rodar `node --test tests/pdf-generator.test.ts` e confirmar que falha**
- [ ] **Step 3: Implementar `src/pdf-generator.ts`**
- [ ] **Step 4: Rodar `node --test tests/pdf-generator.test.ts` e confirmar que passa**
- [ ] **Step 5: Commit**

---

### Task 4: Coletor Integrado de Vagas Remotas (`pt-BR` e `en`) + Executor de Aplicação Automática (Gupy Mode vs. PDF Upload Mode)

**Files:**
- Create: `/root/camaleao-ats/src/scraper-and-applier.ts`
- Test: `/root/camaleao-ats/tests/scraper-and-applier.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `ats-engine.ts`, `pdf-generator.ts`
- Produces:
  - `collectRemoteDevOpsJobs(db, fetchImpl)`
  - `ingestJobFromUrlOrText(db, input, fetchImpl)`
  - `runAutoApplication(db, jobId, options)` (quando `job.platform === 'Gupy'`, gera o script Playwright focado em atualizar os campos do currículo pré-cadastrado na Gupy e preencher o campo **"Apresente-se"** com `gupyKit.apresenteseText`; para InHire/LinkedIn/outros, anexa o PDF gerado)

- [ ] **Step 1: Escrever `tests/scraper-and-applier.test.ts` testando tanto vaga Gupy (geração de automação "Apresente-se") quanto vaga InHire (anexo de PDF)**
- [ ] **Step 2: Rodar `node --test tests/scraper-and-applier.test.ts` e confirmar que falha**
- [ ] **Step 3: Implementar `src/scraper-and-applier.ts`**
- [ ] **Step 4: Rodar `node --test tests/scraper-and-applier.test.ts` e confirmar que passa**
- [ ] **Step 5: Commit**

---

### Task 5: Servidor Web, Interface Kanban + Popup Bilíngue com Modo Gupy e Container Docker (`Dockerfile` + `docker-compose.yml`)

**Files:**
- Create: `/root/camaleao-ats/src/server.ts`
- Create: `/root/camaleao-ats/src/public/index.html`
- Create: `/root/camaleao-ats/src/public/styles.css`
- Create: `/root/camaleao-ats/src/public/app.js`
- Create: `/root/camaleao-ats/Dockerfile`
- Create: `/root/camaleao-ats/docker-compose.yml`
- Test: `/root/camaleao-ats/tests/server.test.ts`

**Interfaces:**
- Produces:
  - `createAppServer(db?: AppDatabase): http.Server`
  - Endpoints REST suportando `?lang=pt-BR|en`:
    - `GET /api/bootstrap`
    - `GET /api/jobs/:id/detail?lang=pt-BR|en` (retorna `job`, `analysis`, `tailoredCv` com `gupyKit`, e `recruiterMessages`)
    - `GET /api/jobs/:id/cv.pdf?lang=pt-BR|en`
    - `POST /api/jobs/scrape`, `POST /api/jobs/ingest`, `POST /api/jobs/:id/move`, `POST /api/jobs/:id/recruiter`, `POST /api/jobs/:id/apply`, `POST /api/profile/evolve`
  - Container Docker funcional escutando na porta `3000`.

- [ ] **Step 1: Escrever `tests/server.test.ts` validando API bilíngue (`?lang=pt-BR` e `?lang=en`), Kit Gupy ("Apresente-se"), PDF e rastreador de Recruiter**
- [ ] **Step 2: Rodar `node --test tests/server.test.ts` e confirmar que falha**
- [ ] **Step 3: Implementar `src/server.ts`, `src/public/*`, `Dockerfile` e `docker-compose.yml`**
- [ ] **Step 4: Rodar `node --test tests/*.test.ts` e subir o container Docker para validar funcionamento real**
- [ ] **Step 5: Commit**
