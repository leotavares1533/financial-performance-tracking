# Rotina de fechamento Confina

- Leia primeiro o ultimo `data/validations/processing-confina-*.json` e o resumo da nova auditoria. Nao releia toda a conversa nem despeje carteiras/animais completos na resposta.
- Fluxo incremental: `audit-incremental-confina.py` -> autorizacoes pontuais -> `value-incremental-transfer.mjs` quando houver cessao -> `stage-incremental-confina.py` -> garantia -> `close-incremental-confina.mjs` -> conferencia de tela -> publicacao.
- Use parametros e arquivos de autorizacao no diretorio local de processamento. Nao copie um script completo para cada dia. A leitura normalizada do GER004 e reaproveitada por SHA-256 em `../outputs/cache-confina`.
- Salve detalhes em arquivos locais e retorne apenas contagens, totais, pendencias e excecoes. Nao use o LLM para somar CSVs ou comparar milhares de registros.
- Nunca altere fechamento anterior sem autorizacao especifica. Mudanca em valor, taxa, vencimento, compra, baixa ou titularidade antiga deve aparecer na previa. Preservar e deixar pendente e diferente de aprovar a alteracao.
- Nunca use o VP do sistema como precificacao. Na cessao, separe VP economico calculado, caixa efetivo confirmado e principal do funding. Nao rateie uma diferenca para forcar fechamento.
- O mesmo lastro pode ocorrer em veiculos diferentes e, em casos ja identificados, em duas ocorrencias economicas distintas. Preserve a origem gerencial e a chave da ocorrencia; nao elimine ou duplique apenas pelo lastro.
- Antes de aplicar: fontes inalteradas, sem pendencia de funding, titulos/caixa/passivo conciliados, d0 sem juros adicionais, historico congelado identico, duplicidades de gado resolvidas e cotacao nunca futura. Nao inferir amortizacao de funding de uma baixa do ativo.
- Em importacao incremental, valide o congelamento identico dos dados anteriores e datas representativas. Se mudar motor de calculo, calendario ou regra compartilhada, execute a regressao historica completa. Nao suprima verificacoes financeiras para economizar tokens.
- Arquive cada composicao biologica. Se nao houver boletim regional da data, use o ultimo boletim completo anterior e exiba a referencia. Nao buscar uma serie SP para substituir todas as UFs.
- Mantenha o paralelo fora da lamina e fora dos totais publicos. Regra vigente da antiga50: reserva igual ao passivo; sobra liquida no caixa da operacao, reduzida pelo carrego uma unica vez. Antiga100 zerada desde10/11.
- Nao publique previas ou fontes pessoais de Downloads. Publique apenas os arquivos validados, confira a implantacao e informe a ultima data efetivamente fechada.
