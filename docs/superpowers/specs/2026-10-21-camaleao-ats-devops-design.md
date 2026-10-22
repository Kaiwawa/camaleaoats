# CamaleãoATS — Plataforma Pessoal de Vagas Remotas DevOps, Adaptação Honesta de CV para ATS e Candidatura Automatizada

**Data:** 2026-10-21  
**Escopo:** Projeto de software completo em Container Docker — 100% focado no Website (Single-User / Autônomo, Bilíngue `pt-BR` e `en`)

---

## 1. Intenção e Motivação (O Porquê)

O usuário atua na área de **DevOps** e precisa com urgência conquistar uma vaga **100% remota** (no Brasil ou internacional, em **Português `pt-BR` ou Inglês `en`**) alinhada à sua stack (**Cloud AWS/GCP/Azure/OCI, Docker, Kubernetes, CI/CD, GitHub Actions, ArgoCD, Ansible, Terraform e Observabilidade com Grafana** — cargos de DevOps, DevSecOps ou SRE).

Hoje ele enfrenta quatro gargalos principais:
1. **Triagem de ATS e especificidade da Gupy vs. InHire/Outros:** Na **InHire**, sites próprios e e-mail direto, envia-se um PDF adaptado; já na **Gupy**, não se envia um PDF avulso por vaga — é preciso ajustar o currículo pré-cadastrado na plataforma e escrever um excelente texto no campo **"Apresente-se"** com as palavras-chave que a IA da Gupy (Gaia) procura.
2. **Vagas e CVs em Português (`pt-BR`) e Inglês (`en`):** Vagas remotas de DevOps exigem alternar rapidamente entre currículos, textos de "Apresente-se" e abordagens em Português do Brasil e em Inglês.
3. **Abordagem a Tech Recruiters no LinkedIn Free:** Procurar o Tech Recruiter da vaga funciona muito bem, mas a conta gratuita do LinkedIn limita notas de convite a **200 caracteres** (e poucas notas por mês), exigindo esperar o recrutador aceitar a conexão para então enviar uma DM completa — o que o quadro Kanban deve ajudar a lembrar.
4. **Tempo gasto na operação manual e falta de rastreamento:** Adaptar o currículo/Apresente-se para cada vaga e controlar quem respondeu ou deu *ghosting* consome tempo precioso.

---

## 2. Perfil Base Real do Usuário e Regra de Ouro Anti-Alucinação

O sistema já nasce pré-configurado com a matriz real de habilidades do usuário (em `pt-BR` e `en`), que possui perfil altamente adaptável ("camaleão") e rápida curva de aprendizado:

| Categoria | Habilidade / Certificação | Nível Atual Real | Como o Sistema Deve Posicionar no CV e na Gupy (Sem Alucinar) |
|-----------|---------------------------|------------------|-----------------------------------------------------|
| **Containers** | Docker | **Sólido / Forte** | Destacar com ênfase: criação de imagens otimizadas, multi-stage builds, containerização de aplicações e troubleshooting. |
| **Cloud** | AWS (Certificado **AWS SAA-C03**) | **Sólido (Certificado)** | Destacar a certificação **AWS Certified Solutions Architect – Associate (SAA-C03)** no topo. Quando a vaga pedir **GCP, Azure ou OCI**, enquadrar a base sólida de arquitetura Cloud (IAM, redes, compute, storage, alta disponibilidade) validada pela SAA-C03 como diretamente transferível e de rápida adaptação. |
| **CI/CD & GitOps** | Git, GitHub Actions, ArgoCD | **Prático / Autônomo** | Destacar automação de pipelines CI/CD com GitHub Actions e entrega contínua / GitOps em Kubernetes utilizando ArgoCD. Quando a vaga pedir GitLab CI, Jenkins ou Azure DevOps, ressaltar domínio dos conceitos de esteira CI/CD e facilidade de transição entre plataformas. |
| **Orquestração** | Kubernetes | **Inicial / Em evolução** (escreve manifestos YAML com segurança; homelab com Kind/ArgoCD) | **Nunca** afirmar que possui anos de administração avançada de clusters produtivos. Posicionar de forma honesta usando as palavras-chave do ATS: *"Criação e manutenção de manifestos YAML para Kubernetes (Deployments, Services, ConfigMaps, Ingress) integrados a fluxos GitOps com ArgoCD e ambientes em containers Docker"*. |
| **IaC, Config & Observabilidade** | Terraform, Ansible, Grafana | **Em evolução / Prático inicial** | Destacar vivência prática com Infraestrutura como Código (Terraform), automação de configuração (Ansible) e dashboards/monitoramento (Grafana), ajustando o nível conforme a evolução do usuário. |

### Diretrizes Obrigatórias do Prompt Anti-Alucinação (Guardrails da IA)
1. **Proibição Absoluta de Invenção:** É estritamente proibido inventar empresas, cargos, anos de experiência, certificações que o usuário não possui ou transformar conhecimentos iniciais (ex: escrita de YAML em Kubernetes) em senioridade de administração de cluster em produção.
2. **Apenas Fatos do Perfil Vivo:** Toda frase gerada no currículo ou no "Apresente-se" da Gupy deve ter lastro direto nas habilidades e níveis cadastrados no "Perfil Vivo" do usuário.
3. **Otimização Semântica Honesta para ATS:** Colocar no topo as tecnologias reais do usuário que a vaga exige, usar a grafia exata das palavras-chave do anúncio (em `pt-BR` ou `en`) e explicitar correlação técnica e rápida adaptação quando a vaga pedir uma ferramenta irmã.

---

## 3. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos (Goals)
1. **Execução Empacotada em Container Docker:**
   - Entregar `Dockerfile` e `docker-compose.yml` prontos para subir o sistema com um único comando (`docker compose up -d --build`), persistindo o banco SQLite e os arquivos gerados em volume mapeado.
2. **Suporte Bilíngue Completo (`pt-BR` e `en`):**
   - Detecção automática do idioma da vaga (`pt-BR` ou `en`) com seletor manual (`🇧🇷 PT-BR | 🇺🇸 EN`) no topo e dentro do popup da vaga.
   - Geração do CV em PDF, do texto **"Apresente-se" (Gupy)**, dos campos do perfil Gupy e das mensagens para Tech Recruiter tanto em **Português do Brasil** quanto em **Inglês**.
3. **Interface Única em Kanban + Popup na Mesma Página:**
   - Quadro Kanban de 4 colunas (`📥 Vagas Abertas`, `⏳ Vagas em Processo`, `❌ Vagas sem Sucesso`, `🗑️ Vagas Ruins`) e Popup (Modal) aberto sobre a mesma página ao clicar em qualquer vaga.
4. **Descrição Completa com Destaques Visuais de Match:**
   - Texto completo da vaga dentro do popup marcando em **Verde** (Ponto Forte Dominado) e **Amarelo** (Em Evolução / Transferível).
5. **Modo Especial Gupy ("Apresente-se" + Ajuste do CV Pré-Cadastrado) vs. Modo PDF (InHire / LinkedIn / E-mail):**
   - **Quando a vaga for na Gupy** (ou para qualquer vaga onde o usuário queira o modo Gupy):
     1. Gera um texto **"Apresente-se para Gupy"** sob medida para a vaga (em `pt-BR` ou `en`), denso nas palavras-chave reais do perfil que a IA da Gupy (Gaia) ranqueia e 100% honesto.
     2. Gera os **Textos de Ajuste Rápido do Perfil Gupy** (*Resumo Profissional* e *Descrição das Experiências / Habilidades*) para o usuário atualizar seu cadastro na Gupy antes de confirmar a vaga.
     3. No robô Playwright para Gupy, preenche o campo "Apresente-se" (e atualiza os textos do perfil pré-cadastrado se solicitado) em vez de tentar subir um anexo PDF inexistente.
   - **Quando a vaga for InHire, LinkedIn, Site Próprio ou E-mail Direto:**
     - Gera o **PDF otimizado para ATS** em coluna única (`pt-BR` ou `en`) e anexa/envia automaticamente.
6. **Fluxo de Abordagem ao Tech Recruiter (Modo LinkedIn Free ≤ 200 caracteres):**
   - Botão para buscar o Tech Recruiter da empresa no LinkedIn, status de conexão no card do Kanban (`⏳ Conexão Enviada — Aguardando Aceite` → `💬 Aceitou! Mandar DM`), **Nota de Convite ≤ 200 caracteres** e **DM Completa Pós-Aceite** (em `pt-BR` ou `en`).
7. **Coleta Integrada de Vagas Remotas + Aprendizado de Gosto + Evolução de Senioridade ("Perfil Vivo"):**
   - Scraper integrado buscando vagas remotas DevOps/SRE/Cloud em português e inglês; aprendizado automático de gosto ao mover cards para `Vagas Ruins` / `Em Processo`; e evolução dinâmica de senioridade conforme o usuário aprimora suas skills.

### Não-Objetivos (Non-Goals)
- Dependência de plataformas externas como n8n.
- Outros idiomas além de `pt-BR` e `en` neste momento.

### Anti-Objetivos (Anti-Goals)
- **Alucinar ou inventar senioridade falsa** no CV ou no "Apresente-se" da Gupy.
- **Tirar o usuário da tela única do Kanban.**
