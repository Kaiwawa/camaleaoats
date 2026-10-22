# 🦎 CamaleãoATS

**CamaleãoATS** é uma plataforma web inteligente e bilíngue (**Português `pt-BR`** e **Inglês `en`**) para busca direcionada de vagas de tecnologia, gestão de candidaturas em **Kanban**, adaptação honesta de currículo otimizado para **ATS (PDF)**, geração de textos para a **Gupy (IA Gaia)** e abordagem estratégica de **Tech Recruiters no LinkedIn**.

---

## ✨ Principais Funcionalidades

### 1. 🔍 Busca de Vagas Direcionada pelo Perfil
- **Pesquisa guiada pelo Título Profissional**: utiliza automaticamente o seu **Título Profissional** cadastrado no perfil (ex.: *DevOps Engineer*, *Cloud Engineer*, *SRE*) para buscar vagas reais em múltiplos portais (**LinkedIn Guest API**, **Gupy**, **InHire**, **Remotive** e **Arbeitnow**).
- **Filtros em Menus Suspensos (Checkboxes)**:
  - **Senioridade**: `Estágio / Trainee`, `Júnior`, `Pleno`, `Sênior` e `Especialista / Staff` (padrão: `Todas` quando nenhuma selecionada).
  - **Modalidade**: `Remoto`, `Híbrido` e `Presencial` (padrão: `Todas` quando nenhuma selecionada).
  - **Local**: `🌎 Brasil` ou `🌐 Global / LatAm`.
- **Confirmação na Primeira Busca**: exibe um modal de confirmação no primeiro clique em **🔄 Buscar Vagas** para revisar Senioridade, Modalidade e Local antes de iniciar o scraping.

### 2. 📋 Quadro Kanban Inteligente com Drag & Drop
- **Colunas**:
  - `📥 Vagas Abertas` (com filtro rápido de leitura por horário/data de postagem ao lado do contador de itens)
  - `⏳ Em Processo`
  - `❌ Sem Sucesso`
  - `🗑️ Vagas Ruins (Filtro)`
- **Aprendizado de Preferências Não-Destrutivo**: mover uma vaga para `Vagas Ruins` penaliza apenas características indesejadas de modalidade/contrato (como presencial/híbrido ou consultoria específica), **nunca penalizando tecnologias da sua stack**. Ao tirar uma vaga de `Vagas Ruins`, os pesos são recalculados automaticamente.

### 3. 📄 Adaptação Honesta de CV (ATS PDF) + Tradução Automática (`PT-BR ⇄ EN`)
- **Destaque Visual na Descrição da Vaga**:
  - 🟢 **Ponto Forte no seu CV** (tecnologias e certificações que você já domina).
  - 🟡 **Em Evolução / Transferível** (tecnologias em aprendizado ou correlatas).
- **Reescrita Inteligente de Experiências e Tradução Automática**:
  - Reescreve o **Resumo da Experiência** de cada experiência profissional para destacar sinergia com a vaga sem inventar tecnologias ou empresas.
  - Traduz automaticamente os campos **"Como descrever"** e **"Resumo da Experiência"** entre **Português (`pt-BR`)** e **Inglês (`en`)** conforme o idioma selecionado no modal da vaga.
- **Projetos Pessoais Condicionais**: inclui projetos do seu portfólio/homelab no currículo **apenas quando a stack do projeto tem interseção com o que a vaga pede**.
- **Ação Rápida (`🚀 Abrir Site, Baixar CV e Mover p/ Processo`)**: abre a vaga original em nova aba, baixa o PDF formatado para ATS e move o card para `Em Processo` em um único clique.

### 4. 🟣 Modo Gupy (IA Gaia) & 💬 Tech Recruiter LinkedIn Free
- **Modo Gupy**: gera o texto **"Apresente-se"** em primeira pessoa calibrado com as palavras-chave da vaga e sugere os blocos de Resumo e Tags para atualizar no perfil pré-cadastrado da Gupy.
- **Tech Recruiter Tracker**:
  - Gera **Nota de Convite para LinkedIn Free (`≤ 200 caracteres`)** com contador em tempo real.
  - Gera **DM Completa Pós-Aceite** mencionando a vaga e seus diferenciais técnicos.
  - Rastreia o status da conexão (`Não enviado`, `Conexão enviada — Aguardando aceite`, `Aceitou — DM enviada`) com alertas visuais direto no card do Kanban.

### 5. 👤 Gestão Completa de Perfil + Extrator de CV (PDF / Texto)
- **Importação Automática de Currículo**: faça upload do seu CV em `.pdf`, `.txt` ou `.md` (ou cole o texto) para preencher automaticamente suas abas sem salvar placeholders em campos ausentes.
- **6 Abas Organizadas com Edição Rápida via Mini-Popups (`✏️`)**:
  1. **Dados Pessoais & Idiomas** (com máscaras de telefone/e-mail e edição de nível de proficiência).
  2. **Experiência Profissional** (Cargo, Empresa, Período e Resumo da Experiência).
  3. **Habilidades & Tecnologias** (Categoria, Nível de Familiaridade e *Como descrever*).
  4. **Certificações** (Nome, Código da Certificação, Emissor e Ano de Vencimento).
  5. **Ensino / Graduação / Cursos** (Tecnólogo, Bacharelado, Pós/MBA, Técnico e Cursos).
  6. **Projetos Pessoais / Homelab** (Nome, Stack, Link do Repositório e *Como descrever*).

### 6. ⚙️ Configurações de IA & Prompts Markdown (`.md`) dos Agentes
- Suporte a **Motor Determinístico Local** (zero custo e instantâneo), **OpenAI**, **Google Gemini**, **Groq Cloud** e **Ollama Local**.
- Editor integrado para customizar as regras Markdown (`.md`) de cada agente:
  - `cv-adapter.md` — Agente Adaptador de CV (ATS)
  - `gupy-gaia.md` — Agente Gupy ("Apresente-se" & Gaia ATS)
  - `recruiter-dm.md` — Agente Tech Recruiter (LinkedIn ≤200c & DM)
  - `cv-extractor.md` — Agente Extrator de Perfil a partir de CV

---

## 🚀 Como Executar

### 📦 Para Usuário Final (Direto via Docker Image — Sem Clonar Repositório)

A imagem oficial já compilada (com **SBOM CycloneDX** anexado via GitHub Actions) é distribuída pelo **GitHub Container Registry (GHCR)**. Você pode rodar o **CamaleãoATS** com um único comando `docker run`:

```bash
docker run -d \
  --name camaleao-ats \
  -p 3000:3000 \
  -v camaleao_data:/app/data \
  --security-opt no-new-privileges:true \
  --restart unless-stopped \
  ghcr.io/kaiwawa/camaleaoats:latest
```

> 💡 Caso prefira salvar o banco SQLite e os arquivos na pasta atual da sua máquina em vez de um volume gerenciado pelo Docker, substitua `-v camaleao_data:/app/data` por `-v $(pwd)/data:/app/data`.

Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

---

### 🛠️ Modo Desenvolvedor (`git clone` + `docker compose`)

Se você deseja modificar o código, criar novas features ou buildar a imagem localmente:

```bash
git clone https://github.com/Kaiwawa/camaleaoats.git
cd camaleaoats
docker compose up -d --build
```

Acesse no navegador: **[http://localhost:3000](http://localhost:3000)**

> Os dados do seu perfil, vagas do Kanban e prompts `.md` ficam persistidos localmente na pasta `./data` (ignorada automaticamente pelo `.gitignore`).

#### Rodando sem Docker (Node.js v24+)

O projeto utiliza o suporte nativo a TypeScript e SQLite (`node:sqlite`) do **Node.js 24**:

```bash
npm start
```

---

## 🧪 Testes Automatizados

Para executar a suíte completa de testes unitários e de integração (motor ATS, gerador de PDF, banco SQLite, scraper, servidor HTTP e validações de segurança):

```bash
npm test
```

---

## 🔒 Segurança por Design

- **Anti-SSRF**: bloqueio de URLs apontando para `localhost`, `127.0.0.1`, redes privadas RFC1918, IPv6 local e endpoints de metadados em nuvem (`169.254.169.254`).
- **Headers HTTP de Segurança**: `Content-Security-Policy (CSP)`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` e `Cache-Control: no-store` nas rotas de API.
- **Proteção contra XSS e Path Traversal**: sanitização estrita de HTML e protocolos de URLs (`http`/`https`/`mailto`), validação de nomes de arquivos `.md` dos agentes e limite de payload HTTP (`5 MB`).
- **Isolamento de Dados Pessoais**: banco SQLite (`data/camaleao.db`) com permissões restritas (`0600`) e pré-configurado no `.gitignore` e `.dockerignore` para nunca vazar credenciais ou dados pessoais em commits.

---

## 📁 Estrutura do Projeto

```text
camaleao-ats/
├── src/
│   ├── ats-engine.ts           # Motor bilíngue ATS, tradução PT⇄EN, extrator de CV e gerador Gupy/Recruiter
│   ├── db.ts                   # Camada de persistência SQLite (node:sqlite) e gestão de perfil/vagas/agentes
│   ├── pdf-generator.ts        # Gerador nativo de currículo em PDF single-column legível por ATS
│   ├── scraper-and-applier.ts  # Buscador multi-fonte de vagas e gerador de scripts de candidatura
│   ├── server.ts               # Servidor HTTP, rotas REST API e middlewares de segurança
│   ├── types.ts                # Contratos e interfaces TypeScript
│   └── public/                 # Frontend SPA (HTML5, CSS3 com tema Dia/Noite e JS Vanilla)
├── tests/                      # Suíte de testes automatizados (node:test)
├── Dockerfile                  # Imagem Node.js 24 Slim
├── docker-compose.yml          # Orquestração do container com volume persistente ./data
└── package.json
```
