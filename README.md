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

## Validacoes operacionais

- Confina CPRF 100MM: historico validado. Manter os ajustes manuais ja combinados e, sem nova base de carteira, atualizar somente a posicao para frente.
- Confina CPRF 50MM: validado em 18/09/2026 com o mesmo criterio do CPRF 100MM. Manter o historico ja processado; novos ajustes devem ser aplicados apenas quando o usuario apontar itens especificos ou enviar uma nova carteira.
- Confina CRA 42a 50MM: validado em 22/09/2026 para a posicao de 17/09/2026 usando o controle do prototipo como base. Manter o historico ate 17/09/2026 sem novos ajustes contra o controle paralelo; novas carteiras devem ser processadas somente da nova data de referencia para frente. Baseline aceito: VP carteira R$ 38.906.907,39, caixa R$ 7.177.130,13, funding R$ 40.069.455,07.
