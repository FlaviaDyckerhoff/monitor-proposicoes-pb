# 📋 Lições Aprendidas — Projeto Proposições por Email

Registro técnico de descobertas, erros e ajustes feitos durante a implementação dos monitores automáticos de proposições legislativas estaduais e municipais.

---

## 1. `ordering` é ignorado pela API do SAPL

Toda instalação SAPL testada (ALPB e CMJP) ignorou silenciosamente o parâmetro `ordering=-id`. A API sempre retorna em ordem crescente de ID, sem exceção, independente do parâmetro passado.

**Nunca assumir que o parâmetro funciona.** Sempre verificar o primeiro ID retornado antes de confiar na ordenação. Se o primeiro resultado tiver o menor ID do conjunto, o parâmetro está sendo ignorado.

---

## 2. IDs crescentes = proposições recentes nas últimas páginas

Consequência direta do ponto anterior. A estratégia correta para SAPL é sempre buscar as **últimas páginas**, não a primeira. A página 1 traz os registros mais antigos do ano corrente.

**Implementação:** fazer uma chamada sonda na página 1 para descobrir `total_pages`, depois buscar as páginas `total_pages - 1` e `total_pages`.

---

## 3. REQs dominam os IDs altos em câmaras municipais

Requerimentos são protocolados em volume muito maior que PLOs e PLCs. Numa câmara municipal, buscar só as últimas páginas gerais traz centenas de REQs e zero PLOs novos — os PLOs ficam enterrados no meio com IDs menores.

**Solução: busca em duas camadas:**
- Tipos legislativos principais (PLO, PLC, IND, VETO, MP, etc.): busca separada por tipo, últimas 2 páginas de cada
- REQ e demais: busca geral nas últimas 2 páginas

Isso garante que um PLO novo nunca se perde atrás de uma avalanche de REQs.

---

## 4. Assembleia estadual vs câmara municipal têm dinâmicas diferentes

Na **ALPB** (estadual) o volume de REQs é menor e a busca geral ainda captura PLOs sem problema crítico. Na **CMJP** (municipal) o volume de REQs é tão alto que engole tudo — a busca por tipo é obrigatória desde o início.

**Regra geral:** para câmaras municipais, sempre implementar busca por tipo desde a primeira versão.

---

## 5. HTTP vs HTTPS varia por instalação SAPL

A ALPB usa HTTPS (`sapl3.al.pb.leg.br`). A CMJP usa HTTP puro (`sapl.joaopessoa.pb.leg.br`) — tentativa de HTTPS resultou em `ConnectTimeoutError` imediato na porta 443.

**Como verificar:** observar o protocolo nos links retornados pelo próprio payload da API. Se os campos `next`, `previous` e `texto_original` usarem `http://`, o servidor não serve HTTPS.

---

## 6. Filtros de data e ordering frequentemente ignorados

Tanto `ordering=-id` quanto `data_apresentacao_0=2026-04-07` foram ignorados pela API da ALPB — em ambos os casos a resposta retornou o total completo sem qualquer filtragem. O mesmo comportamento foi confirmado na ALMG com `dataPublicacaoInicio`.

**Regra:** nunca confiar em parâmetros de filtro sem confirmar pelo payload retornado. Verificar se `total_entries` mudou e se os resultados correspondem ao filtro aplicado.

---

## 7. O campo `autores` no SAPL retorna IDs numéricos, não nomes

Em todas as instalações SAPL testadas (ALPB e CMJP), o campo `autores` vem como array de IDs numéricos (`[201]`), não como objetos com nome. O nome do autor não está disponível inline.

Resolver isso exige uma chamada extra por proposição ao endpoint `/api/parlamentar/parlamentar/{id}/` — custo alto com muitas proposições novas. **Deixar para implementação futura** se o autor for requisito prioritário.

---

## 8. Testar o payload real antes de gerar qualquer código

O fluxo que funcionou consistentemente:

1. Confirmar URL da API
2. Colar JSON real da resposta
3. Analisar campos disponíveis, tipos, ordenação, paginação
4. Só então gerar o script

Gerar código antes de ver o payload real causou retrabalho em todos os casos — o script assumia campos ou comportamentos que a API não entregava.

---

## 9. Validar ordenação no email, não só no log

O log do GitHub Actions mostrava "456 proposições novas" e parecia correto. Mas o email chegou com PLOs antigos no topo — o sort estava errado e o log não revelava isso. **Só o email mostrou o problema.**

**Regra:** sempre abrir o primeiro email gerado e verificar se a ordem está correta antes de considerar o monitor estável.

---

## 10. `Number()` em vez de `parseInt()` para ordenação numérica

`parseInt("7002")` e `Number("7002")` dão o mesmo resultado na maioria dos casos, mas `parseInt` pode retornar `NaN` silenciosamente em edge cases com strings malformadas, quebrando o sort sem erro visível.

Para ordenação numérica em sort, usar sempre `Number()`:

```javascript
// ❌ Frágil
return (parseInt(b.numero) || 0) - (parseInt(a.numero) || 0);

// ✅ Correto
return Number(b.numero) - Number(a.numero);
```

---

## 11. A API da ALMG tem arquitetura diferente do SAPL

A ALMG usa sistema próprio de busca documental (não SAPL), com ordenação fixa por tipo alfabético e depois número decrescente. Não aceita `ordering` nem filtros por data de publicação.

A única estratégia viável é paginar todo o ano com delay obrigatório de 1,1s entre chamadas (~22 chamadas por execução). Ver estudo técnico completo em `ESTUDO-TECNICO-ALMG-MG.docx`.

**Status:** postergado — implementação mais complexa que SAPL, aguarda decisão de prioridade.

---

## 12. Mapeamento de tipos por instalação SAPL

Cada instalação SAPL tem seus próprios IDs de tipo — não são padronizados entre casas legislativas. Sempre consultar o endpoint `/api/materia/tipomaterialegislativa/` antes de implementar a busca por tipo.

**IDs mapeados:**

### ALPB (sapl3.al.pb.leg.br)
| ID | Sigla | Tipo |
|----|-------|------|
| 1  | PLO   | Projeto de Lei Ordinária |
| 6  | PLC   | Projeto de Lei Complementar |
| 2  | PEC   | Proposta de Emenda Constitucional |
| 7  | PDL   | Projeto de Decreto Legislativo |
| 3  | PRE   | Projeto de Resolução |
| 24 | PC    | Projeto de Código |
| 13 | VET   | Veto |
| 15 | MP    | Medida Provisória |
| 9  | IND   | Indicação |
| 4  | REQ   | Requerimento |
| 40 | JAUS  | Justificativa de Ausência |
| 17 | OF    | Ofício |
| 8  | MOC   | Moção |

### CMJP (sapl.joaopessoa.pb.leg.br)
| ID | Sigla | Tipo |
|----|-------|------|
| 1  | PLO   | Projeto de Lei Ordinária |
| 5  | PLC   | Projeto de Lei Complementar |
| 9  | PELO  | Proposta de Emenda à Lei Orgânica |
| 6  | PDL   | Projeto de Decreto Legislativo |
| 2  | PRE   | Projeto de Resolução |
| 18 | VETO  | Veto |
| 16 | MP    | Medida Provisória |
| 8  | IND   | Indicação |

---

## Checklist para nova instalação SAPL

Antes de gerar qualquer arquivo para uma nova assembleia:

- [ ] Confirmar URL base da API (`/api/materia/materialegislativa/`)
- [ ] Verificar protocolo (HTTP ou HTTPS) nos links do payload
- [ ] Testar se `ordering=-id` funciona (comparar IDs da resposta)
- [ ] Consultar `/api/materia/tipomaterialegislativa/` e mapear todos os tipos
- [ ] Identificar tipos de alto volume (REQs municipais, Ofícios) que dominam IDs altos
- [ ] Decidir se é necessária busca por tipo ou se busca geral é suficiente
- [ ] Confirmar campo de ID único (`id` numérico em todas as instalações testadas)
- [ ] Verificar se `autores` vem inline com nome ou só como ID numérico
- [ ] Abrir e verificar o primeiro email gerado antes de considerar estável
