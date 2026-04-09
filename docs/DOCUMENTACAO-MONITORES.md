# 📚 Documentação Master — Monitores de Proposições Legislativas

Stack: Node.js + nodemailer + GitHub Actions (4x/dia, gratuito)  
Repositório padrão: `monitor-proposicoes-[uf]` ou `monitor-[tema]-municipios` (privado no GitHub)

---

## Índice

1. [Arquitetura geral](#arquitetura-geral)
2. [Setup base (igual para todos)](#setup-base)
3. [Tipo 1 — API proprietária documentada (ALEP/PR)](#tipo-1--api-proprietária-documentada)
4. [Tipo 2 — SAPL Interlegis (RO, PB, municípios SP)](#tipo-2--sapl-interlegis)
5. [Tipo 3 — SGPL Inlesp / Angular SPA (MS)](#tipo-3--sgpl-inlesp--angular-spa)
6. [Tipo 4 — Angular SPA bloqueado por IP (SC)](#tipo-4--angular-spa-bloqueado-por-ip)
7. [Tipo 5 — SINO Siscam (municípios SP)](#tipo-5--sino-siscam)
8. [Tipo 6 — SPL Ágape / Câmara Sem Papel (municípios SP)](#tipo-6--spl-ágape--câmara-sem-papel)
9. [Tipo 7 — SAGL OpenLegis (municípios SP)](#tipo-7--sagl-openlegis)
10. [Tipo 8 — Backsite PHP (Santos/SP)](#tipo-8--backsite-php)
11. [Tipo 9 — Legisoft / Virtualiza (SBC/SP)](#tipo-9--legisoft--virtualiza)
12. [Tipo 10 — RDM Sistemas (Osasco/SP)](#tipo-10--rdm-sistemas)
13. [Tipo 11 — Sistemas próprios municipais](#tipo-11--sistemas-próprios-municipais)
14. [Tipo 12 — Sem API + LAI](#tipo-12--sem-api--lai)
15. [Arquitetura multi-município com VPS](#arquitetura-multi-município-com-vps)
16. [Como identificar o tipo de sistema](#como-identificar-o-tipo-de-sistema)
17. [Procedimento DevTools](#procedimento-devtools)
18. [Erros comuns e soluções](#erros-comuns-e-soluções)
19. [Placar atual](#placar-atual)

---

## Arquitetura geral

### Monitor simples (uma câmara)
```
GitHub Actions (cron 4x/dia)
    └── node monitor.js
            ├── GET ou POST → API da câmara/assembleia
            ├── Compara com estado.json (IDs já vistos)
            ├── Se há novas → nodemailer → Gmail
            └── Salva estado.json atualizado no repo
```

### Monitor multi-município (SABESP)
```
GitHub Actions (cron 4x/dia) — municípios sem bloqueio de IP
    └── node monitor.js (lê municipios.json)
            ├── parsers/sino-siscam.js  → Botucatu, Várzea Paulista, Bragança Paulista
            ├── parsers/sagl.js         → Hortolândia
            ├── parsers/sapl.js         → Socorro
            ├── parsers/spl.js          → Santo André, Caçapava, Tremembé
            ├── parsers/backsite.js     → Santos
            ├── parsers/cajamar.js      → Cajamar
            └── parsers/nazare-paulista.js → Nazaré Paulista

VPS self-hosted runner (cron 30min depois) — municípios que bloqueiam GA
    └── node monitor.js (lê municipios-vps.json)
            ├── parsers/sapl.js         → Campinas
            ├── parsers/carapicuiba.js  → Carapicuíba
            ├── parsers/legisoft.js     → São Bernardo do Campo
            └── parsers/rdm.js          → Osasco
```

**Secrets necessários em todos os repositórios:**

| Secret | Valor |
|--------|-------|
| `EMAIL_REMETENTE` | Gmail ou Google Workspace do remetente |
| `EMAIL_SENHA` | App Password de 16 chars **sem espaços** |
| `EMAIL_DESTINO` | Email de destino dos alertas |

**Horários (BRT):** 08h, 12h, 17h, 21h → crons UTC: `0 11`, `0 15`, `0 20`, `0 0`  
**VPS roda 30min depois:** `30 11`, `30 15`, `30 20`, `30 0`

---

## Setup base

### 1. Gmail — App Password

1. Acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Confirme que **Verificação em duas etapas** está ativa — sem isso, App Password não existe
3. Clique em **Criar** → nome livre (ex: `monitor-sabesp`)
4. Copie os 16 caracteres gerados — aparecem no formato `xxxx xxxx xxxx xxxx`
5. **Salve sem espaços** → `xxxxxxxxxxxxxxxx`
6. O App Password e o `EMAIL_REMETENTE` devem ser da **mesma conta Google**

> ⚠️ **Armadilha frequente:** copiar com espaços é a causa mais comum de `BadCredentials`. O Google exibe com espaços mas o nodemailer precisa sem.

### 2. Repositório GitHub

1. github.com → **+ → New repository**
2. Nome: `monitor-[tema]-municipios` | Visibilidade: **Private**
3. Upload dos arquivos
4. Criar `.github/workflows/monitor.yml` via **Add file → Create new file**

### 3. Secrets

**Settings → Secrets and variables → Actions → New repository secret**

### 4. Self-hosted runner (VPS)

Para municípios que bloqueiam IPs de datacenter do GitHub Actions:

1. GitHub → Settings → Actions → Runners → **New self-hosted runner**
2. Seleciona **Linux x64**
3. Copia os comandos e roda no VPS
4. Confirma que o runner aparece como **Idle**
5. No workflow VPS: `runs-on: [self-hosted, linux]`

### 5. Primeiro teste

**Actions → [nome do workflow] → Run workflow**

O primeiro run sempre envia email com o backlog completo e salva o estado. A partir do segundo run, só notifica novidades.

---

## Tipo 1 — API proprietária documentada

### Características
- API pública documentada em página de transparência
- Endpoint POST com body JSON
- Resposta no campo `json.lista`
- Sem autenticação

### Implementado
**PR — ALEP** ✅ No ar

### Endpoint
```
URL base: http://webservices.assembleia.pr.leg.br/api/public
Método:   POST /proposicao/filtrar
Docs:     https://transparencia.assembleia.pr.leg.br/servicos/dados-abertos
```

### Body da requisição
```json
{
  "ano": 2026,
  "pagina": 1,
  "itensPorPagina": 100,
  "ordenacao": "dataApresentacao",
  "direcao": "DESC"
}
```

---

## Tipo 2 — SAPL Interlegis

### Características
- Sistema open source do Senado Federal
- API REST padrão Django REST Framework (DRF) em `/api/`
- Sem autenticação — API completamente pública
- Paginação via `results[]` + `count` + `next`
- Domínio padrão: `sapl.al.[uf].leg.br` (assembleias) ou `sapl.[municipio].sp.leg.br` (câmaras)

### Implementados
**RO — ALE-RO** ✅ | **PB — ALPB** ✅ | **Socorro/SP** ✅ | **Campinas/SP** ✅ (VPS)

### Endpoints padrão SAPL
```
Método: GET
Path:   /api/materia/materialegislativa/
Params: ?ano=2026&page=1&page_size=100&ordering=-id
```

### Formato de resposta
```json
{
  "count": 2332,
  "next": "https://sapl.../api/materia/materialegislativa/?ano=2026&page=2",
  "results": [
    {
      "id": 145082,
      "__str__": "Projeto de Lei nº 10 de 2026",
      "numero": "10",
      "ano": "2026",
      "data_apresentacao": "2026-01-15",
      "ementa": "Dispõe sobre...",
      "tipo": 21
    }
  ]
}
```

### Quirks conhecidos

**Tipo como ID numérico:** campo `tipo` retorna número, não nome. Extrair do `__str__`:
```javascript
const tipo = p.__str__ ? p.__str__.split(' nº')[0] : 'Matéria';
```

**Autores vazios:** `autores: []` é normal — busca extra necessária em `/api/materia/autoria/?materia=[id]`.

**Campinas tem paginação customizada:** retorna `next` com URL absoluta diferente do padrão. Usar `json.next` diretamente em vez de incrementar página manualmente.

**Campinas bloqueia IP do GitHub Actions** → roda no VPS via self-hosted runner.

### Verificação rápida
```
GET https://sapl.[municipio].sp.leg.br/api/materia/materialegislativa/?ano=2026&page=1&page_size=1
```
Retorna JSON com `"count"` e `"results"` → é SAPL ✅

---

## Tipo 3 — SGPL Inlesp / Angular SPA

### Características
- Sistema proprietário da Inlesp
- Frontend Angular com hash routing (`#/busca-proposicoes`)
- Página carrega vazia no servidor — renderização client-side
- API REST backend existe mas não documentada publicamente
- Formato de resposta: Spring Page (`content[]` + `totalPages`)

### Implementado
**MS — ALEMS** ✅ No ar

### Como descobrir o endpoint
Obrigatório via DevTools — a página carrega vazia no servidor.

---

## Tipo 4 — Angular SPA bloqueado por IP

### Características
- Mesma arquitetura do Tipo 3
- Servidor bloqueia IPs de datacenter (AWS, GitHub Actions)
- Sintoma: `ConnectTimeoutError` na porta 443 — não é 403, é timeout TCP

### Implementado
**SC — ALESC** ✅ No ar (roda em VPS)

### Solução
Mudar `runs-on: ubuntu-latest` para `runs-on: self-hosted` no workflow.

---

## Tipo 5 — SINO Siscam

### Características
- Sistema da empresa SINO Tecnologia, muito comum em câmaras do interior de SP
- Duas versões: **moderna** (sem captcha) e **legada** (com hCaptcha)
- Identificar pela URL: `/Documentos?Pesquisa=Avancada&GrupoId=N` (moderna) ou `/index/ID/8` (legada)
- Dados servidos no HTML — sem API JSON separada
- Paginação via parâmetro `Pagina=N` na URL

### Implementados
**Botucatu/SP** ✅ | **Várzea Paulista/SP** ✅ | **Bragança Paulista/SP** ✅

### Endpoint (versão moderna)
```
Método: GET
URL:    /Documentos?Pesquisa=Avancada&GrupoId=N&TipoId=X&TipoId=Y&Ano=2026&Pagina=1&ItemsPerPage=100
```

> ⚠️ **Armadilha crítica:** URL correta é `/Documentos`, **não** `/Siscam/Documentos`. O prefixo `/Siscam/` causou 404 em Botucatu, Várzea Paulista e Bragança Paulista.

### Como descobrir GrupoId e TipoIds
1. Abrir o site da câmara
2. Navegar até Pesquisa Avançada
3. Selecionar todos os tipos desejados e fazer uma busca
4. Copiar os `TipoId=` da URL resultante

### Versão legada (com hCaptcha)
URL padrão: `/index/ID/8` — o hCaptcha verifica apenas se é um browser real (não resolve desafio visual). Possível bypass com go-rod + stealth em Go:
- Biblioteca: `github.com/go-rod/rod` + `github.com/go-rod/stealth`
- Estratégia: abrir browser headless, aguardar `#pesquisa_form`, capturar cookies, usar em requests subsequentes

**Câmaras com hCaptcha Siscam:** Paulínia, Mauá, Lins, Itatiba, Itaquaquecetuba → LAI ou microserviço Go no VPS

---

## Tipo 6 — SPL Ágape / Câmara Sem Papel

### Características
- Sistema da empresa Ágape Consultoria
- Domínio: `*.splonline.com.br` ou `camarasempapel.*`
- API REST pública em `/api/publico/proposicao/`
- Paginação via `?pg=N&qtd=100&ano=2026`
- Documentação às vezes disponível em `/dados-abertos.aspx`

### Implementados
**Santo André/SP** ✅ | **Caçapava/SP** ✅ | **Tremembé/SP** ✅ (instável)

### Endpoint
```
Método: GET
URL:    /api/publico/proposicao/?pg=1&qtd=100&ano=2026
```

### Campos da resposta
```json
{
  "total": 1393,
  "proposicoes": [
    {
      "id": 123,
      "ano": "2026",
      "numero": "111",
      "sigla": "PC",
      "tipo": "Parecer da Comissão",
      "assunto": "ementa completa",
      "data": "08/04/2026 14:01:18",
      "AutorRequerenteDados": { "nomeRazao": "Nome do Vereador" }
    }
  ]
}
```

> ⚠️ **Bug conhecido:** não usar `anoAtual` para montar o número — ler `item.ano` da API. A API retorna o ano correto, mas o bug fazia aparecer `816/2026` para proposituras de 2014.

### Variantes com problemas
- **Taubaté:** SPL legado com ASP.NET WebForms, sem API → LAI
- **São José dos Campos:** Cloudflare PrivateToken bloqueia acesso → LAI
- **Tremembé:** HTTP 500 na página 2 (câmara pequena, menos de 100 props/ano) → tratar 500 como fim de paginação, não como erro

---

## Tipo 7 — SAGL OpenLegis

### Características
- Sistema open source, versões 4.2 e 5.x
- **SAGL 5.x:** API pública em `/@@materias?ano=AAAA&tipo=N`
- **SAGL 4.2:** reCAPTCHA na pesquisa — sem API acessível → LAI

### Implementado
**Hortolândia/SP** ✅ (SAGL 5.1)

### Endpoint SAGL 5.x
```
Método: GET
URL:    /@@materias?ano=2026         → retorna só o índice de tipos/anos (sem itens)
URL:    /@@materias?ano=2026&tipo=1  → retorna itens do tipo 1
```

> ⚠️ **Armadilha crítica:** `/@@materias?ano=2026` sem `&tipo=` retorna apenas o índice de filtros disponíveis, não as matérias. É necessário buscar tipo por tipo separadamente.

### Tipos disponíveis (Hortolândia)
| ID | Nome |
|----|------|
| 1  | Projeto de Lei |
| 2  | Projeto de Resolução |
| 3  | Requerimento |
| 6  | Projeto de Decreto Legislativo |
| 7  | Moção |
| 8  | Indicação |
| 9  | Proposta de Emenda à Lei Orgânica |
| 20 | Projeto de Lei Complementar |
| 25 | Veto |

### Como identificar versão SAGL
- Rodapé "SAGL v4.2" + reCAPTCHA → sem API → LAI
- Rodapé "SAGL 5.1" + link `/@@materias` → API disponível ✅

### SAGL 4.2 com reCAPTCHA
**Caraguatatuba/SP** → LAI

---

## Tipo 8 — Backsite PHP

### Características
- Sistema PHP legado com sessão obrigatória para paginação
- Domínio: `administrativo.camara[municipio].sp.gov.br`
- HTML em **Latin-1** (ISO-8859-1) — não UTF-8
- Paginação via GET com `?inicio=N` após POST inicial
- PHPSESSID obrigatório para paginação além da primeira página
- Dados em bloco PHP `Array(...)` no HTML

### Implementado
**Santos/SP** ✅ (100 mais recentes por run)

### Fluxo de acesso
```javascript
// 1. GET para obter PHPSESSID (redirect: 'manual' para capturar Set-Cookie)
const sessao = await fetch(url + '/index.php', { redirect: 'manual' });
const cookie = sessao.headers.get('set-cookie')?.match(/PHPSESSID=[^;]+/)?.[0];

// 2. POST para inicializar busca
await fetch(urlBusca, {
  method: 'POST',
  headers: { 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params
});

// 3. GET para cada página
const pagina = await fetch(`${urlBase}/index.php?inicio=${N}`, {
  headers: { 'Cookie': cookie }
});
```

> ⚠️ **Armadilha crítica:** `redirect: 'follow'` descarta o `Set-Cookie` do redirect intermediário. Usar `redirect: 'manual'` para capturar o cookie.

> ⚠️ **Encoding:** usar `Buffer.from(await response.arrayBuffer()).toString('latin1')` em vez de `response.text()`. O HTML em Latin-1 lido como UTF-8 corrompe acentos e faz regex de `Nº` falhar.

> ⚠️ **HTML entities:** o HTML contém `&#xBA;` para `º`. O regex `N[ºo°]` não casa — incluir `\xba` na classe de caracteres.

### ID único
Usar `auto_10` do bloco Array (ID interno do sistema), não o número da propositura. O número pode aparecer múltiplas vezes no HTML.

---

## Tipo 9 — Legisoft / Virtualiza

### Características
- Sistema da empresa Virtualiza Tecnologia
- URL de listagem: `/documentos/ordem:DESC/tipo:legislativo-2/ano:AAAA/pagina:N`
- URL de detalhe: `/documento/titulo-do-documento-NUMEROID`
- Título em `<span class="title-link"><strong>Tipo Nº numero/ano</strong></span>`
- Ementa **não disponível na listagem** — só na página de detalhe
- Identificar pelo rodapé "Virtualiza Tecnologia"

### Implementado
**São Bernardo do Campo/SP** ✅ (VPS)

### Extração do ID
O ID numérico está no final do slug da URL de detalhe, após o último hífen:
```
/documento/pedido-de-indicacao-no-4120-2026-99999
                                              ↑ ID = 99999
```

> ⚠️ **Sem ementa na listagem:** usar `Situação` do sub-title como fallback. Para ementa real seria necessário uma chamada por item na página de detalhe — viável só para novos itens.

> ⚠️ **Guarulhos tem Cloudflare PrivateToken** → bloqueia acesso programático → LAI.

### SBC bloqueia IP do GitHub Actions → roda no VPS.

---

## Tipo 10 — RDM Sistemas

### Características
- Sistema GRP da RDM Sistemas
- Portal: `*.rdmsistemas.com.br/portalcidadao/`
- SPA com hash no fragment (`#hashcriptografado`) — não navegável diretamente
- API REST JSON em `/GRP/portalcidadao/webservices/proposicao/filtrar`
- Filtro por data de criação no body (`dataCriacaoInicio`/`dataCriacaoFim`)
- Sem paginação — retorna tudo de uma vez filtrado por período

### Status
**Osasco/SP** ❌ — API confirmada, mas servidor bloqueia conexões externas (timeout TCP, código 0)

### Endpoint
```
Método: POST
URL:    /GRP/portalcidadao/webservices/proposicao/filtrar
Content-Type: application/json
```

### Body da requisição
```json
{
  "natureza": "INDICACAO",
  "buscaProposicaoPublica": true,
  "buscaTipoUltimoEvento": true,
  "dataCriacaoInicio": "2026-01-01T00:00:00.000",
  "dataCriacaoFim": "2026-12-31T23:59:59.000",
  "endereco": { "@id": 1 },
  "vinculaProtocolo": true
}
```

### Naturezas disponíveis
| natureza | tipoProposicao.id | endereco.@id |
|----------|-------------------|--------------|
| PROJETO | 63 | 6 |
| INDICACAO | null | 1 |
| REQUERIMENTO | null | 1 |
| MOCAO | null | 1 |

### Campos da resposta
```json
{
  "id": 400789,
  "natureza": "PROJETO",
  "numeroProjeto": "00198/2025",
  "dataCriacao": "2025-10-14T00:00:00.000",
  "tipoProposicao": { "nome": "PROJETO DE LEI" },
  "atores": [{ "agentePolitico": { "nomePolitico": "GABRIEL SAÚDE" }, "tipoPapel": "AUTOR" }],
  "documentoVO": { "descricao": "@ementa Texto da ementa..." }
}
```

> ⚠️ **Ementa:** campo `descricao` começa com `@ementa` — remover com regex. Pode conter HTML entities (`&aacute;` etc).

---

## Tipo 11 — Sistemas próprios municipais

### Cajamar/SP — Sistema próprio (scraping HTML)

**URL:** `https://www.cmdc.sp.gov.br/documentos/lei/N` (paginação por sufixo)

**Paths disponíveis:**
- `/documentos/lei`
- `/documentos/indicacoes`
- `/documentos/requerimentos`
- `/documentos/mocao`

**Sem URL de detalhe** — documento abre em modal PDF, URL não muda. Link no email aponta para listagem.

**Parar paginação quando:** página retorna 0 itens, ou quando aparece item de ano anterior.

---

### Carapicuíba/SP — Sistema próprio (scraping HTML)

**URL de listagem:** `/atividade-legislativa/proposicoes/pesquisa/N?ano=2026`

**URL de detalhe:** `/atividade-legislativa/proposicoes/materia/ID` ← ID único numérico

**Campos disponíveis na listagem:** Identificação (ex: PLO-3646/2026), Ementa/Assunto, Autoria, Situação

> ⚠️ **Armadilha:** regex `/proposicoes/materia/` não casa — a URL completa é `/atividade-legislativa/proposicoes/materia/`. Usar o path completo no regex.

**Carapicuíba bloqueia IP do GitHub Actions** → roda no VPS.

---

### Nazaré Paulista/SP — Sistema PHP legado com base64

**URL:** `/?pag=BASE64&tp=N&view=getTPET&estado=tramitacao&ano=2026`

O parâmetro `pag=` é uma hash em base64 duplo — não é possível gerar dinamicamente. Hardcodar o valor por tipo:

| Tipo | tp= | pag= |
|------|-----|------|
| Projetos em Tramitação | 10 | `T1RFPU9UVT1PVEk9T0dZPU9HRT1PV0k9T1RZPQ==` |
| Indicações | 5 | `T0RVPU9UST1PRFk...` (mesmo para Moções e Req.) |
| Moções | 4 | (mesmo pag= das Indicações) |
| Requerimentos | 3 | (mesmo pag= das Indicações) |

**Status:** ❌ Sistema usa AJAX client-side — endpoint não identificável via curl. Necessita browser headless ou LAI.

---

## Tipo 12 — Sem API + LAI

### Quando usar
- hCaptcha / reCAPTCHA na busca
- Cloudflare PrivateToken
- SPA com AJAX client-side (endpoint não identificável)
- Bloqueio de rede completo (timeout TCP)

### Câmaras nesta situação
| Município | Sistema | Motivo |
|-----------|---------|--------|
| Paulínia | SINO Siscam `/index/` | hCaptcha simples |
| Mauá | SINO Siscam `/index/` | hCaptcha simples |
| Lins | SINO Siscam `/index/` | hCaptcha simples |
| Itatiba | SINO Siscam `/index/` | hCaptcha simples |
| Itaquaquecetuba | SINO Siscam `/index/` | hCaptcha simples |
| Taubaté | SPL Ágape legado | ASP.NET WebForms sem API |
| São José dos Campos | SPL Ágape | Cloudflare PrivateToken |
| Guarulhos | Legisoft | Cloudflare PrivateToken |
| Caraguatatuba | SAGL 4.2 | reCAPTCHA |
| Osasco | RDM Sistemas | Bloqueio de rede (timeout) |
| Nazaré Paulista | Sistema próprio AJAX | Endpoint não identificável |

### Texto padrão do pedido LAI
```
Assunto: Pedido de Acesso à Informação — Disponibilização de Dados de Proposituras em Formato Aberto

Com fundamento na Lei Federal nº 12.527/2011, solicito:

1. Disponibilização de endpoint público (API REST) ou arquivo exportável
   (JSON, CSV ou XML) com proposituras do ano corrente, contendo:
   número, tipo, data, autoria, ementa e link para o texto integral.

2. Caso não exista endpoint, exportação mensal em CSV disponibilizada
   em local de acesso público.

Prazo legal: 20 dias úteis.
```

### hCaptcha simples (Siscam) — bypass possível
O hCaptcha dessas câmaras verifica apenas se é um browser real, sem desafio visual. Bypass com go-rod + stealth:
```go
// github.com/go-rod/rod + github.com/go-rod/stealth
browser := rod.New().MustConnect()
page := stealth.MustPage(browser)
page.MustNavigate(targetURL)
el, _ := page.Timeout(25 * time.Second).Element("#pesquisa_form")
el.WaitVisible()
cookies, _ := page.Cookies([]string{targetURL})
// Usar cookies em requests HTTP subsequentes
```

---

## Arquitetura multi-município com VPS

### Quando usar VPS
Alguns servidores de câmaras bloqueiam o range de IP do GitHub Actions (AWS us-east-1) mas respondem normalmente a IPs de VPS comuns.

**Sintomas:**
- HTTP 403 consistente no GitHub Actions
- Mas curl do VPS retorna 200
- Ou timeout completo (código 0) = bloqueio de rede

**Municípios que exigem VPS:** Campinas, Carapicuíba, SBC

### Dois workflows paralelos

**`.github/workflows/monitor.yml`** — GitHub Actions (municípios normais):
```yaml
name: Monitor SABESP — Proposituras Municipais
on:
  schedule:
    - cron: '0 11 * * *'   # 08:00 BRT
    - cron: '0 15 * * *'   # 12:00 BRT
    - cron: '0 20 * * *'   # 17:00 BRT
    - cron: '0 0 * * *'    # 21:00 BRT
  workflow_dispatch:
jobs:
  monitorar:
    runs-on: ubuntu-latest
    # ... (MUNICIPIOS_FILE padrão = municipios.json)
```

**`.github/workflows/monitor-vps.yml`** — VPS (municípios bloqueados):
```yaml
name: Monitor SABESP — VPS
on:
  schedule:
    - cron: '30 11 * * *'   # 08:30 BRT — 30min depois do principal
    - cron: '30 15 * * *'
    - cron: '30 20 * * *'
    - cron: '30 0 * * *'
  workflow_dispatch:
jobs:
  monitorar-vps:
    runs-on: [self-hosted, linux]
    steps:
      - uses: actions/checkout@v4
      - name: Pull latest
        run: git pull --rebase origin main  # ← obrigatório para evitar conflito com GA
      - name: Executar monitor
        env:
          MUNICIPIOS_FILE: municipios-vps.json  # ← arquivo separado
        run: node monitor.js
      - name: Salvar estado
        run: |
          git pull --rebase origin main  # ← também antes do push
          git add estado.json
          git diff --staged --quiet || git commit -m "chore: atualiza estado VPS [skip ci]"
          git push
```

### Conflito de push GA × VPS

**Problema:** os dois workflows rodam próximos e fazem push ao `estado.json` simultaneamente → push rejeitado com "fetch first".

**Solução:** `git pull --rebase origin main` antes de qualquer push. O `--rebase` incorpora mudanças remotas sem criar merge commit.

### Arquivo de configuração por runner

`municipios.json` — municípios do GitHub Actions  
`municipios-vps.json` — municípios do VPS

O `monitor.js` lê via:
```javascript
const arquivo = process.env.MUNICIPIOS_FILE || 'municipios.json';
const municipios = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
```

### Timing dos crons (evitar colisão)
- GA roda em `:00` (ex: `0 11 * * *`)
- VPS roda em `:30` (ex: `30 11 * * *`)
- O VPS faz `git pull` no início — pega o estado atualizado pelo GA antes de rodar

---

## Como identificar o tipo de sistema

### Passo 1 — Verificar URL do portal
| Padrão na URL | Sistema provável |
|---------------|-----------------|
| `sapl.[municipio].sp.leg.br` | SAPL Interlegis (Tipo 2) |
| `*.siscam.com.br` ou `/Siscam/` ou `/Documentos?GrupoId=` | SINO Siscam (Tipo 5) |
| `*.splonline.com.br` ou `camarasempapel.*` | SPL Ágape (Tipo 6) |
| Rodapé "SAGL v4.2" ou "SAGL 5.1" | SAGL OpenLegis (Tipo 7) |
| `administrativo.camara*.sp.gov.br` + PHP | Backsite (Tipo 8) |
| `/documentos/tipo:legislativo` ou rodapé Virtualiza | Legisoft (Tipo 9) |
| `*.rdmsistemas.com.br` + hash no fragment | RDM Sistemas (Tipo 10) |

### Passo 2 — Testar API diretamente

**SAPL:**
```
GET /api/materia/materialegislativa/?ano=2026&page=1&page_size=1
→ JSON com "count" e "results" = SAPL ✅
```

**SAGL 5.x:**
```
GET /@@materias
→ JSON com "filtros" e "exemplo" = SAGL 5.x ✅
```

**SPL:**
```
GET /api/publico/proposicao/?pg=1&qtd=1&ano=2026
→ JSON com "total" e "proposicoes" = SPL ✅
```

### Passo 3 — DevTools (para SPAs e sistemas desconhecidos)

1. Abrir portal no Chrome → F12 → Network → Fetch/XHR
2. Navegar até proposições / fazer uma busca
3. Clicar no request que retorna lista de proposições
4. Coletar: URL completa, método, payload (se POST), estrutura da resposta

**Sinais de alerta no DevTools:**
- Só aparece Google Analytics (`collect?v=2&tid=G-...`) → ainda não fez a busca
- URL com `#hash` → SPA com routing client-side → buscar API por baixo
- `Authorization: Bearer eyJ...` → autenticação obrigatória → LAI
- Nenhum XHR após busca → AJAX com formulário clássico ou SSR → scraping HTML

### Passo 4 — Testar do VPS se suspeitar de bloqueio de IP

```bash
curl -s -o /dev/null -w "%{http_code}" "URL_DO_ENDPOINT" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

| Código | Significado |
|--------|-------------|
| 200 | Acessível — problema é no parser |
| 403 | Bloqueio por IP ou User-Agent |
| 000 | Timeout TCP — bloqueio de rede completo |

---

## Procedimento DevTools

Obrigatório para qualquer sistema SPA (Angular, React, Vue).

1. Abrir o portal no **Chrome**
2. **F12** → aba **Network** → clicar em **Fetch/XHR**
3. Fazer uma busca no formulário (qualquer filtro)
4. Clicar na requisição de proposições que aparecer
5. Coletar:
   - **Headers** → Request URL completa
   - **Headers** → Request Method (GET ou POST)
   - **Payload** → body da requisição (se POST)
   - **Response** → estrutura do JSON retornado

---

## Erros comuns e soluções

### GitHub Actions / Setup

| Erro | Causa | Solução |
|------|-------|---------|
| `BadCredentials` / `535 5.7.8` | App Password errado ou com espaços | Recriar App Password, salvar sem espaços |
| App Password não aparece | 2FA não ativado | Ativar verificação em 2 etapas primeiro |
| Email enviado mas `BadCredentials` no log | Segunda tentativa de envio falhou | Ignorar se email chegou — o erro é pós-envio |
| Push rejeitado "fetch first" | GA e VPS fizeram push simultâneo | Adicionar `git pull --rebase origin main` antes do push |
| Workflow não aparece em Actions | Arquivo não está em `.github/workflows/` | Recriar com caminho correto |
| `EMAIL_REMETENTE` e App Password de contas diferentes | Conta errada | App Password deve ser da mesma conta do remetente |

### Parser / API

| Erro | Causa | Solução |
|------|-------|---------|
| `404 Not Found` (Siscam) | URL com `/Siscam/Documentos` em vez de `/Documentos` | Remover prefixo `/Siscam/` |
| `0 proposituras` (SAGL) | `/@@materias?ano=2026` sem `&tipo=` retorna só índice | Buscar tipo por tipo |
| `0 proposituras` (Backsite) | HTML em Latin-1 lido como UTF-8 corrompe regex | Usar `arrayBuffer().toString('latin1')` |
| Duplicação de items | Regex casando múltiplas vezes no mesmo bloco | Usar ID numérico do sistema como chave de dedup, não o número da propositura |
| Ano errado nas proposituras (SPL) | Parser monta `numero/anoAtual` em vez de ler `item.ano` | Usar `item.numero + '/' + item.ano` |
| Paginação para na página 1 (Backsite) | PHPSESSID não sendo passado | Capturar cookie com `redirect: 'manual'`, passar em todos os requests |
| `fetch failed` (Osasco/RDM) | Bloqueio de rede completo — timeout TCP | LAI ou aguardar liberação |
| HTTP 403 (Campinas, Carapicuíba) | Bloqueio de IP do GitHub Actions | Rodar no VPS via self-hosted runner |
| HTTP 500 página 2 (Tremembé) | Câmara pequena, sem dados na página 2 | Tratar 500 como fim de paginação (`break`) |
| Ementa com tags HTML vazando | `response.text()` não limpou as tags | Aplicar `.replace(/<[^>]+>/g, ' ')` |

### Erros específicos por sistema

**SAPL:**
- `autores: []` → normal, busca extra necessária
- `tipo` como número → extrair nome do `__str__`
- `ordering=-data_apresentacao` retorna 400 → usar `ordering=-id`

**SINO Siscam:**
- `/index/ID/8` com hCaptcha → bypass com go-rod + stealth (Go) ou LAI
- Sem `/Siscam/` na URL → versão moderna sem captcha ✅

**Backsite (Santos):**
- Sempre testar com `redirect: 'manual'` para capturar PHPSESSID
- Encoding Latin-1: `Buffer.from(await r.arrayBuffer()).toString('latin1')`
- `&#xBA;` no HTML = `º` em entity — incluir no regex

**SAGL 4.2:**
- reCAPTCHA visual — não tem bypass viável → LAI

---

## Placar atual

### Assembleias estaduais

| UF | Assembleia | Sistema | Status | Observações |
|----|-----------|---------|--------|-------------|
| PR | ALEP | API própria documentada | ✅ No ar | Endpoint POST, docs públicas |
| RO | ALE-RO | SAPL Interlegis | ✅ No ar | GET, `results[]`, 100 prop/página |
| MS | ALEMS | SGPL Inlesp | ✅ No ar | Spring Page, 894 páginas de backlog |
| PB | ALPB | SAPL Interlegis | ✅ No ar | `sapl3.` é o domínio ativo |
| SC | ALESC | Angular SPA | ✅ No ar | Roda em VPS (bloqueio de IP) |
| MT | ALMT | A definir | ⏳ Pendente | Aguardando resposta da LAI |

### Monitor SABESP — Câmaras municipais SP

| Município | Sistema | Runner | Total | Observações |
|-----------|---------|--------|-------|-------------|
| Hortolândia | SAGL 5.1 | GA | 1768 | Busca por tipo separadamente |
| Bragança Paulista | SINO Siscam | GA | 163 | tipo_ids confirmados |
| Botucatu | SINO Siscam | GA | 109 | URL sem `/Siscam/` |
| Várzea Paulista | SINO Siscam | GA | 103 | URL sem `/Siscam/` |
| Santos | Backsite PHP | GA | 100/run | Latin-1, PHPSESSID obrigatório |
| Santo André | SPL Ágape | GA | 100/run | API `/api/publico/proposicao/` |
| Caçapava | SPL Ágape | GA | 100/run | 1393 props totais em 2026 |
| Socorro | SAPL 3.x | GA | 259 | API REST padrão |
| Cajamar | Sistema próprio | GA | 35 | Scraping HTML, sem URL de detalhe |
| Campinas | SAPL 3.x | VPS | 4887 | Bloqueia IP do GA |
| São Bernardo do Campo | Legisoft | VPS | 20+ | Sem ementa na listagem |
| Carapicuíba | Sistema próprio | VPS | 3000 | Bloqueia IP do GA |
| Tremembé | SPL Ágape | GA | 0 | Site instável |
| Nazaré Paulista | PHP legado AJAX | — | 0 | LAI pendente |
| Osasco | RDM Sistemas | — | 0 | Bloqueio de rede completo |

### Pendentes de LAI (câmaras municipais SP)

| Município | Sistema | Motivo |
|-----------|---------|--------|
| Paulínia | SINO Siscam | hCaptcha |
| Mauá | SINO Siscam | hCaptcha |
| Lins | SINO Siscam | hCaptcha |
| Itatiba | SINO Siscam | hCaptcha |
| Itaquaquecetuba | SINO Siscam | hCaptcha |
| Taubaté | SPL legado | Sem API |
| São José dos Campos | SPL | Cloudflare |
| Guarulhos | Legisoft | Cloudflare |
| Caraguatatuba | SAGL 4.2 | reCAPTCHA |
| Osasco | RDM Sistemas | Bloqueio rede |
| Nazaré Paulista | PHP AJAX | AJAX client-side |
