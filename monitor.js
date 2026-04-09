const fs = require('fs');
const nodemailer = require('nodemailer');

const EMAIL_DESTINO = process.env.EMAIL_DESTINO;
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
const EMAIL_SENHA = process.env.EMAIL_SENHA;
const ARQUIVO_ESTADO = 'estado.json';
const API_BASE = 'https://sapl3.al.pb.leg.br/api';
const SITE_BASE = 'https://sapl3.al.pb.leg.br';

// A API da ALPB ignora ordering e retorna IDs em ordem crescente.
// REQs dominam os IDs mais altos — PLOs novos ficam enterrados no meio.
//
// Estratégia em duas camadas:
// 1. Tipos legislativos principais: busca por tipo, últimas 2 páginas de cada
//    → garante PLO, PLC, PEC, IND, VET, MP nunca sejam perdidos
// 2. Busca geral: últimas 2 páginas sem filtro
//    → captura REQ, JAUS, OF, MOC e demais com IDs altos

const TIPOS_PRINCIPAIS = [
  { id: 1,  sigla: 'PLO' },  // Projeto de Lei Ordinária
  { id: 6,  sigla: 'PLC' },  // Projeto de Lei Complementar
  { id: 2,  sigla: 'PEC' },  // Proposta de Emenda Constitucional
  { id: 7,  sigla: 'PDL' },  // Projeto de Decreto Legislativo
  { id: 3,  sigla: 'PRE' },  // Projeto de Resolução
  { id: 24, sigla: 'PC'  },  // Projeto de Código
  { id: 13, sigla: 'VET' },  // Veto
  { id: 15, sigla: 'MP'  },  // Medida Provisória
  { id: 9,  sigla: 'IND' },  // Indicação
];

// Ordem de exibição no email (mais importantes primeiro)
const ORDEM_TIPOS = [
  'PROPOSTA DE EMENDA CONSTITUCIONAL',
  'MEDIDA PROVISÓRIA',
  'PROJETO DE LEI COMPLEMENTAR',
  'PROJETO DE LEI ORDINÁRIA',
  'PROJETO DE DECRETO LEGISLATIVO',
  'PROJETO DE RESOLUÇÃO',
  'PROJETO DE CÓDIGO',
  'VETO',
  'INDICAÇÃO',
];

function carregarEstado() {
  if (fs.existsSync(ARQUIVO_ESTADO)) {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
  }
  return { proposicoes_vistas: [], ultima_execucao: '' };
}

function salvarEstado(estado) {
  fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2));
}

function extrairTipo(str) {
  if (!str) return 'OUTROS';
  const match = str.match(/^(.+?)\s+n[oº°]/i);
  return match ? match[1].trim().toUpperCase() : str.split(' ').slice(0, 3).join(' ').toUpperCase();
}

function ordenarTipos(tipos) {
  const principais = tipos.filter(t => ORDEM_TIPOS.includes(t))
    .sort((a, b) => ORDEM_TIPOS.indexOf(a) - ORDEM_TIPOS.indexOf(b));
  const reqs = tipos.filter(t => t.startsWith('REQUERIMENTO')).sort();
  const outros = tipos.filter(t => !principais.includes(t) && !reqs.includes(t)).sort();
  return [...principais, ...outros, ...reqs];
}

async function enviarEmail(novas) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_REMETENTE, pass: EMAIL_SENHA },
  });

  const porTipo = {};
  novas.forEach(p => {
    if (!porTipo[p.tipo]) porTipo[p.tipo] = [];
    porTipo[p.tipo].push(p);
  });

  const totalReqs = Object.keys(porTipo)
    .filter(t => t.startsWith('REQUERIMENTO'))
    .reduce((acc, t) => acc + porTipo[t].length, 0);
  const totalOutros = novas.length - totalReqs;

  const tiposOrdenados = ordenarTipos(Object.keys(porTipo));
  const primeiroReqIdx = tiposOrdenados.findIndex(t => t.startsWith('REQUERIMENTO'));

  const linhas = tiposOrdenados.map((tipo, idx) => {
    const isReq = tipo.startsWith('REQUERIMENTO');
    const bgHeader = isReq ? '#f5f0eb' : '#f0f4f8';
    const colorHeader = isReq ? '#5c3a1a' : '#1a3a5c';
    const borderColor = isReq ? '#5c3a1a' : '#1a3a5c';

    const separador = (isReq && idx === primeiroReqIdx && totalOutros > 0)
      ? `<tr><td colspan="5" style="padding:8px;background:#fff8f0;font-size:12px;color:#999;border-top:3px dashed #ddd;text-align:center">⬇️ Requerimentos (${totalReqs})</td></tr>`
      : '';

    const header = `<tr><td colspan="5" style="padding:10px 8px 4px;background:${bgHeader};font-weight:bold;color:${colorHeader};font-size:13px;border-top:2px solid ${borderColor}">${tipo} — ${porTipo[tipo].length} proposição(ões)</td></tr>`;
    const rows = porTipo[tipo].map(p =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${p.numero}/${p.ano}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">${p.data}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.autor}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.ementa}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">
          ${p.link ? `<a href="${p.link}" style="color:#1a3a5c">Ver matéria</a>` : ''}
        </td>
      </tr>`
    ).join('');

    return separador + header + rows;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:1000px;margin:0 auto">
      <h2 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:8px">
        🏛️ ALPB — ${novas.length} nova(s) proposição(ões)
      </h2>
      <p style="color:#666">Monitoramento automático — ${new Date().toLocaleString('pt-BR')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#1a3a5c;color:white">
            <th style="padding:10px;text-align:left">Número/Ano</th>
            <th style="padding:10px;text-align:left">Data</th>
            <th style="padding:10px;text-align:left">Autor</th>
            <th style="padding:10px;text-align:left">Ementa</th>
            <th style="padding:10px;text-align:left">Link</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">
        Acesse: <a href="https://sapl3.al.pb.leg.br/materia/pesquisar-materia">sapl3.al.pb.leg.br</a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Monitor ALPB" <${EMAIL_REMETENTE}>`,
    to: EMAIL_DESTINO,
    subject: `🏛️ ALPB: ${novas.length} nova(s) proposição(ões) — ${new Date().toLocaleDateString('pt-BR')}`,
    html,
  });

  console.log(`✅ Email enviado com ${novas.length} proposições novas.`);
}

async function buscarPagina(ano, page, tipoId = null) {
  let url = `${API_BASE}/materia/materialegislativa/?ano=${ano}&page=${page}&page_size=100`;
  if (tipoId) url += `&tipo=${tipoId}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`❌ Erro na API (página ${page}${tipoId ? `, tipo ${tipoId}` : ''}): ${response.status}`);
    return null;
  }
  return await response.json();
}

async function buscarUltimasPaginas(ano, tipoId = null, sigla = 'geral') {
  const sonda = await buscarPagina(ano, 1, tipoId);
  if (!sonda) return [];

  const total = sonda.pagination?.total_entries || 0;
  const totalPaginas = sonda.pagination?.total_pages || 1;

  if (total === 0) return [];
  console.log(`  📋 [${sigla}] ${total} proposições em ${totalPaginas} páginas`);

  const paginasParaBuscar = [];
  if (totalPaginas >= 2) paginasParaBuscar.push(totalPaginas - 1);
  paginasParaBuscar.push(totalPaginas);

  const resultados = [];
  for (const pagina of paginasParaBuscar) {
    const dados = await buscarPagina(ano, pagina, tipoId);
    if (dados?.results) resultados.push(...dados.results);
  }

  return resultados;
}

async function buscarProposicoes() {
  const ano = new Date().getFullYear();
  console.log(`🔍 Buscando proposições de ${ano}...`);

  const todasRaw = [];
  const idsColetados = new Set();

  // Camada 1: tipos legislativos principais
  console.log(`\n📌 Tipos legislativos principais:`);
  for (const tipo of TIPOS_PRINCIPAIS) {
    const resultados = await buscarUltimasPaginas(ano, tipo.id, tipo.sigla);
    for (const r of resultados) {
      if (!idsColetados.has(r.id)) {
        idsColetados.add(r.id);
        todasRaw.push(r);
      }
    }
  }

  // Camada 2: busca geral (REQ, JAUS, OF, MOC e demais)
  console.log(`\n📌 Busca geral (REQ e demais):`);
  const gerais = await buscarUltimasPaginas(ano, null, 'geral');
  for (const r of gerais) {
    if (!idsColetados.has(r.id)) {
      idsColetados.add(r.id);
      todasRaw.push(r);
    }
  }

  console.log(`\n📦 Total carregado: ${todasRaw.length} proposições`);
  return todasRaw;
}

function normalizarProposicao(p) {
  const tipo = extrairTipo(p.__str__);

  let autor = '-';
  if (Array.isArray(p.autores) && p.autores.length > 0) {
    const primeiro = p.autores[0];
    if (typeof primeiro === 'object' && primeiro.nome) {
      autor = p.autores.map(a => a.nome).join(', ');
    }
  }

  return {
    id: p.id,
    tipo,
    numero: p.numero || '-',
    ano: p.ano || '-',
    autor,
    data: p.data_apresentacao || '-',
    ementa: (p.ementa || '-').substring(0, 200),
    link: `${SITE_BASE}/materia/${p.id}`,
  };
}

(async () => {
  console.log('🚀 Iniciando monitor ALPB (Paraíba)...');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);

  const estado = carregarEstado();
  const idsVistos = new Set(estado.proposicoes_vistas);

  const proposicoesRaw = await buscarProposicoes();

  if (proposicoesRaw.length === 0) {
    console.log('⚠️ Nenhuma proposição encontrada.');
    process.exit(0);
  }

  const proposicoes = proposicoesRaw.map(normalizarProposicao);
  console.log(`📊 Total normalizado: ${proposicoes.length}`);

  const novas = proposicoes.filter(p => !idsVistos.has(p.id));
  console.log(`🆕 Proposições novas: ${novas.length}`);

  if (novas.length > 0) {
    novas.sort((a, b) => {
      const aIdx = ORDEM_TIPOS.indexOf(a.tipo);
      const bIdx = ORDEM_TIPOS.indexOf(b.tipo);
      const aReq = a.tipo.startsWith('REQUERIMENTO');
      const bReq = b.tipo.startsWith('REQUERIMENTO');

      // Requerimentos sempre no fim
      if (aReq !== bReq) return aReq ? 1 : -1;
      // Tipos principais: ordem regimental
      if (aIdx !== -1 && bIdx !== -1) {
        if (aIdx !== bIdx) return aIdx - bIdx;
        // Mesmo tipo: número decrescente (mais recente primeiro)
        return Number(b.numero) - Number(a.numero);
      }
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      // Outros: alfabético, depois número decrescente
      if (a.tipo < b.tipo) return -1;
      if (a.tipo > b.tipo) return 1;
      return Number(b.numero) - Number(a.numero);
    });

    await enviarEmail(novas);
    novas.forEach(p => idsVistos.add(p.id));
    estado.proposicoes_vistas = Array.from(idsVistos);
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  } else {
    console.log('✅ Sem novidades. Nada a enviar.');
    estado.ultima_execucao = new Date().toISOString();
    salvarEstado(estado);
  }
})();
