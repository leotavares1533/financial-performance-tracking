# Financial Performance Tracking

Controle gerencial apartado para acompanhar carteiras/fundings fora da estrutura de CRA.

## V1

- Tela estatica e isolada.
- Dados ficticios no arquivo `assets/app.js`.
- Sem links ou botoes para o projeto de laminas de CRA.
- Visao gerencial consolidada com caixa, subordinada sintetica e historico de 30 dias.
- Visao individual por funding com carteira, caixa, funding, resultado e gatilhos de rentabilidade.

## Proxima evolucao

- Separar dados ficticios para `data/`.
- Criar importacao de carteira, caixa e funding.
- Guardar historico diario por funding.
- Criar visao consolidada por investidor, produto e setor.

## Cotacoes pecuarias

- Fonte publica: DATAGRO Indicador do Boi (`https://www.indicadordoboi.com.br/pt-br#bulletin`).
- Coletor tecnico local: `scripts/collect-datagro-cattle.py`.
- Importador visual do agente: `scripts/import-datagro-screen-quotes.py`.
- Banco local: `data/pecuaria/cotacoes-pecuaria.sqlite`.
- Snapshot visual do `index`: `data/pecuaria/cotacoes-pecuaria-latest.js`.
- A rotina diaria roda as 09:00 e deve priorizar a coleta visual do site publico renderizado, lendo os dados que aparecem em tela.
- O coletor tecnico pode falhar quando a fonte recusa conexao direta aos arquivos/API por tras da pagina. Nesse caso, o agente deve abrir o site publico, transcrever as cotacoes exibidas e importar o JSON coletado pelo importador visual.
- Os mapas regionais de boi, vaca e novilha gravam preco em `R$/@` por UF.
- A serie historica publica do site esta disponivel para Boi Gordo - Sao Paulo e fica gravada como `historical_series`.
- Os mapas de reposicao gravam a grade numerica em `R$/kg` com linha, coluna e coordenadas, pois os rotulos visiveis ficam no desenho do boletim.

### Sincronizacao Com O Site

- O banco da coleta permanece em `../landing-page-responsiva/financial-performance-tracking/data/pecuaria/cotacoes-pecuaria.sqlite`. Este checkout e a origem da publicacao no GitHub Pages.
- Apos a coleta visual, execute `scripts/sync-local-cattle-quotes.py` com o Python do runtime. O script le o SQLite sem modifica-lo e atualiza o snapshot deste site.
- `quote_date` indica a referencia do boletim; `collected_at` conserva o momento da coleta. As execucoes antigas de 08/10, 09/10 e 13/10 correspondem aos boletins de 07/10, 08/10 e 09/10, respectivamente.
- As garantias aceitas ate 06/10/2026 conservam suas cotacoes. Depois dessa data, cada posicao usa seu boletim ou o ultimo boletim anterior disponivel, nunca um futuro. Cotacoes ja publicadas com precos divergentes interrompem a sincronizacao para revisao.
- Verifique `scripts/verify-cattle-quote-sync.mjs` com o Node do runtime, atualize o cache da cotacao no `index.html` e publique somente esses dois arquivos. A automacao diaria inclui esses passos.

## Validacoes operacionais

- Posicoes de 20 e 21/10/2026 processadas com os relatorios recebidos em 22/10, em D-1. Compra nova: CPRF 100MM, lastro 556955, R$ 148.830,00 em 20/10. Nenhuma amortizacao nova de funding informada.
- Revisao de 19/10 autorizada expressamente em 22/10: titulo VR432026-1 de Vitor Roratto, lastro 555852 substituido por 556254; nominal corrigido de R$ 1.706.909,52 para R$ 506.325,60 e taxa de 2,210445% para 1,95% a.m. Aquisicao de R$ 459.720,36, VP e caixa de 19/10 inalterados. Registro original e autorizacao arquivados no snapshot; nenhuma outra alteracao anterior.
- Antes da importacao de 21/10, as onze carteiras aceitas em 19/10 foram arquivadas integralmente, respeitando os snapshots anteriores. Garantia de 20/10 usa composicao de 19/10 com cotacao de 20/10, explicitada em tela; garantia de 21/10 usa GERANIMAL (21), relatorio GTA de 22/10 e cotacao de 21/10. Snapshots anteriores, GMD de 1,40 somente nos pesos distorcidos, desconto de parceria de 50% e exclusoes de sem veiculo preservados. Conta operacional e provisoes paralelas sem duplicacao.
- Validacao deste fechamento: `scripts/verify-processing-20261021.mjs`, baseline `d687b67`, e registro em `data/validations/processing-confina-2026-10-21.json`. O roteiro de aplicacao exige a revisao autorizada de 19/10 e um candidato previamente validado.

- Segregacao autorizada em 22/10/2026, vigente de 20/10 em diante: Carteira 100MM e Carteira 50MM deixam de compor a lamina como veiculos. Os registros financeiros originais e a apresentacao de datas ate 19/10 permanecem intactos. A sobra do caixa sobre a divida no fechamento de 20/10, R$ 878.090,06, permanece na linha Caixa da operacao e compoe caixa, subordinada, graficos e garantia, sem duplicacao nem novo ganho pela reclassificacao. Comparativos anteriores usam o ganho liquido historico dos dois veiculos, nao uma entrada retroativa na nova conta. O caixa operacional passa a seguir a remuneracao padrao de caixa a partir de 21/10; nenhum CDI adicional e apropriado na reclassificacao de 20/10.
- A conta gerencial paralela fica somente em `../outputs/controle-paralelo-confina/index.html`, fora deste repositorio e sem link na lamina publica. Do caixa de origem de R$ 50.081.939,80, somente R$ 49.203.849,74 ficam reservados, iguais a provisao de divida de 20/10, sem CDI simulado. A sobra liberada e discriminada por origem: Carteira 100MM R$ 543.299,77 e Carteira 50MM R$ 334.790,29. A provisao continua com as taxas originais, fora da lamina e sem pagamento ficticio; juros posteriores podem gerar deficit no paralelo. Pagamentos reais futuros reduzem ambas as contas uma unica vez. A revisao autorizada de 20/10 em diante conserva copia integral das posicoes anteriores no diretorio local.
- Posicoes de 20 e 21/10 evoluidas sem novo CSV de carteira, explicitadas em tela. `scripts/close-parallel-management.mjs --through 2026-10-21` preserva os fechamentos paralelos e apenas acrescenta datas; divergencias financeiras em uma data preservada interrompem o fechamento para revisao previa. `scripts/verify-parallel-management.mjs` verifica o historico, os totais e a segregacao. A politica publicada contem apenas as regras de apresentacao, nao o controle paralelo local.

- Posicoes de 14, 15, 16 e 19/10/2026: novo CRA 65a Outubro inicia em 14/10, funding R$ 75.790.266,29 a 1,7% a.m., base 360, caixa D0 zero e 89 titulos com valor economico de R$ 75.108.237,81. Transferencias controladas pelo VP calculado na origem em 14/10, liquido de baixas anteriores; recebimentos conforme valores informados, sem rateio nem duplicacao.
- Revisao retroativa expressamente autorizada pelo usuario em 20/10: seis confissoes 542982 a 542987 adquiridas em 30/09, com saida de caixa de R$ 1.718.636,65. Atualizaram apenas o CRA 65a 200MM e o caixa/resultado decorrente dessa compra. A revisao foi aplicada tambem ao snapshot congelado, com registro de autorizacao; nenhuma outra posicao anterior a 14/10 foi revista.
- Lastro 484791 pago em 16/10, confirmado pelo usuario; a data 03/07 do CSV nao deve gerar recebimento retroativo. Lastro 498048 transferido para 555142 em 14/10, preservado ate 13/10. Baixa parcial anterior de R$ 330.844,17 mantida no valor economico transferido de 498057 para 555143, sem criar caixa no novo veiculo.
- Amortizacoes de funding em 15/10 totalizam R$ 18.460.963,33, incluindo CRA 42a 50MM R$ 7.290.683,67. BoiPremium foi confirmado somente pelo principal de R$ 485.522,13; juros de R$ 1.737,76 permanecem pendentes. Pagamentos de funding nao substituem os recebimentos dos ativos nos CSVs.
- Garantia de 14 a 19/10 pendente de novo GERANIMAL: preservar composicao de 13/10 e explicitar a base anterior. O GTA recebido em 20/10 nao foi retroagido aos dias 14 a 19. Nenhum snapshot biologico anterior foi substituido. A revisao autorizada do caixa reflete-se na cobertura correspondente.
- Processamento de 19/10: `scripts/prepare-confina-20261019.mjs`, importador de carteira, `scripts/revise-confessions-20260930.mjs` e `scripts/verify-processing-20261019.mjs`. O ultimo compara com `789b90c` e admite somente a revisao autorizada das seis confissoes nas datas anteriores a 14/10.

- Posicoes de 09 e 13/10/2026 processadas com as bases recebidas em 14/10. Comparacao titulo a titulo e historico diario sem mudancas ate 08/10. Nove compras da CPRF 50 em 13/10 somam R$ 11.993.671,69; nenhuma nova amortizacao de funding informada.
- Feriado de 12/10 sem CDI de caixa. Comparativos novos respeitam feriados: 13/10 compara com 09/10; os comparativos aceitos ate 08/10 conservam o calendario anterior. Titulos e fundings em base 360 continuam com accrual por dias corridos.
- Garantia de 09/10 conserva a composicao conhecida de 08/10, explicitada em tela, com cotacao de 09/10. Garantia de 13/10 usa GERANIMAL (19), relatorio de transito de 14/10 e cotacao de 13/10. Snapshots anteriores preservados; GMD de 1,40 somente nos pesos projetados distorcidos e desconto de parceria de 50% mantidos.
- Validacao reproduzivel: `scripts/verify-processing-20261013.mjs`, comparando com o fechamento `65d6df9`. Arquivamento de uma garantia sem substituir a atual: `scripts/update-biological-history.mjs --snapshot-file <arquivo>`.

- Confina CPRF 100MM: historico validado. Manter os ajustes manuais ja combinados e, sem nova base de carteira, atualizar somente a posicao para frente.
- Confina CPRF 50MM: validado em 18/09/2026 com o mesmo criterio do CPRF 100MM. Manter o historico ja processado; novos ajustes devem ser aplicados apenas quando o usuario apontar itens especificos ou enviar uma nova carteira.
- Confina CRA 42a 50MM: validado em 22/09/2026 para a posicao de 17/09/2026 usando o controle do prototipo como base. Manter o historico ate 17/09/2026 sem novos ajustes contra o controle paralelo; novas carteiras devem ser processadas somente da nova data de referencia para frente. Baseline aceito: VP carteira R$ 38.906.907,39, caixa R$ 7.177.130,13, funding R$ 40.069.455,07.
