# Precificaragao

Precificação, engenharia de cardápio e lista de compras para lanchonete e restaurante.

Next.js 16 (App Router + Server Actions) · TypeScript · Tailwind + shadcn/ui · Prisma + PostgreSQL · pronto para a Vercel.

---

## Arrancar

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL
npm run db:push               # cria as tabelas
npm run db:seed               # dados de exemplo (lanchonete em Portugal)
npm run dev
```

Verificação:

```bash
npm test      # 126 testes da matemática de custos, preços e estoque
npm run lint  # ESLint com as regras do Next — apanha o que o tsc não vê
npx tsc --noEmit
```

O `lint` corre o ESLint diretamente: o `next lint` foi removido no Next 16. Ele apanha uma classe de problemas que o TypeScript ignora e que só apareceria no browser — listas sem `key`, `setState` dentro de efeitos, hooks mal usados.

Um banco Postgres qualquer serve — [Neon](https://neon.tech), Supabase ou Vercel Postgres. **`DATABASE_URL` é a única variável obrigatória**; no Neon, use a *pooled connection string*.

#> **Nesta máquina:** uma política de Controlo de Aplicações do Windows bloqueia o binário nativo do SWC, e o Turbopack não corre sem ele. Por isso o script `dev` usa `--webpack`. Onde o binário carregue normalmente, `npm run dev:turbo` é mais rápido.

### Migrations

O caminho recomendado é `npm run db:push`, que funciona através do pooler. Se preferir migrations versionadas (`npm run db:migrate`), o Prisma precisa de uma ligação direta, porque migrations usam advisory locks que o pooler não suporta. Nesse caso, acrescente ao `datasource db` do schema:

```prisma
directUrl = env("DIRECT_URL")
```

e defina `DIRECT_URL` com a connection string sem pooler. O schema não declara isso por omissão de propósito: o Prisma exige que toda variável declarada exista, e um `DIRECT_URL` obrigatório faria a aplicação inteira falhar em quem só define `DATABASE_URL`.

### Deploy na Vercel

1. Importe o repositório.
2. Defina `DATABASE_URL` (e `DIRECT_URL`) nas variáveis de ambiente.
3. O `build` já corre `prisma generate`; o `postinstall` também, para o caso do cache de dependências da Vercel.
4. Na primeira vez, corra `npm run db:push` apontando para o banco de produção.

---

> **Para usar a app**, e não para mexer nela, leia o [GUIA.md](GUIA.md): explica em
> linguagem de dono de lanchonete o que lançar, em que ordem, e como ler o CMV real.

## As premissas de cálculo

Esta é a parte que decide se o preço está certo. Tudo isto está em `src/lib/pricing/` e é verificado por `npm test` e por `tools/verify_pricing.py`.

**IVA.** O preço de menu pode já incluir o imposto (`INCLUDED`, o normal numa lanchonete em Portugal ou no Brasil) ou tê-lo acrescido na conta (`ADDED`). Em Portugal, restauração é 13% para comida e 23% para bebidas — a aplicação não escolhe por si.

**Base de incidência.** Não há uma única base "certa"; há a base que corresponde a como o dinheiro sai:

| Componente | Incide sobre | Porquê |
|---|---|---|
| Custos fixos, mão de obra, energia | receita líquida (sem IVA) | é o que a casa de facto fatura |
| Lucro alvo | receita líquida | idem |
| Taxa de cartão | valor bruto pago pelo cliente | é sobre esse valor que a rede cobra |
| Comissão de plataforma | valor bruto | é sobre esse valor que a Uber Eats cobra |
| Custo do produto e frete | valor absoluto | não são percentagens |

**A equação.** Com `P` = preço de menu, `C` = custo do produto, `D` = frete, `f` = custos fixos, `m` = lucro alvo, `c` = cartão, `k` = comissão, `iva` = alíquota:

```
receita_líquida × (1 − f − m)  −  bruto × (c + k)  =  C + D
```

resolvida para `P`:

```
IVA incluído:   P × [ (1 − f − m) / (1 + iva) − (c + k) ] = C + D
IVA acrescido:  P × [ (1 − f − m) − (1 + iva) × (c + k) ] = C + D
```

O termo entre colchetes é o **denominador**. Se for ≤ 0, as taxas somadas consomem toda a receita e **não existe preço viável** — a aplicação diz isso em vez de devolver um número absurdo.

**Custo do produto.** Insumos + embalagem de uma porção. Não inclui mão de obra nem custos fixos — esses entram depois, como percentagem da receita. Chamava-se "custo primo" até 2026-09-29, e esse nome estava errado: em gestão de restaurantes americana *prime cost* é CMV **+ mão de obra**, e na contabilidade de custos brasileira *custo primo* é matéria-prima **+ mão de obra direta**. As duas incluem trabalho; este número não. O nome dizia mais do que o número continha.

**Fator de correção.** `FC = peso bruto / peso líquido`. Se 1 kg de alcatra rende 800 g limpos, `FC = 1,25`: cada grama no prato custa 25% mais do que o preço de compra sugere, porque foi preciso comprar 1,25 g para ter 1 g. A aplicação aceita o FC ou a percentagem de perda — são a mesma informação vista de dois lados.

**Sub-receitas.** Uma preparação base (maionese, molho, massa) entra noutra ficha pelo seu custo por grama/ml: `custo do lote ÷ rendimento`. A resolução é recursiva, com deteção de ciclo — se A usa B e B usa A, a aplicação recusa em vez de travar.

**Multicanal.** O canal de balcão é a referência. Para cada outro canal, a aplicação calcula o preço que replica **o mesmo lucro em euros** — não a mesma percentagem. Replicar a percentagem seria um erro: 15% de um preço inflado pela comissão da plataforma não é o mesmo dinheiro no bolso. Repare, na tabela do simulador, que o CMV *cai* nos canais de comissão: o custo não mudou, o preço é que subiu.

**Arredondamento.** Sempre para cima, dentro da estratégia escolhida. Arredondar para baixo comeria a margem que o motor acabou de calcular.

---

## Módulos

| Módulo | Onde | Estado |
|---|---|---|
| 1 · Insumos, embalagens, fornecedores | `/insumos`, `/fornecedores` | pronto |
| 1b · Consulta de preços de supermercados | `src/lib/providers/` | adapter + import CSV; adapters de loja por ligar |
| 2 · Fichas técnicas e preparações base | `/fichas` | pronto |
| 3 · Motor de precificação e DRE | `/precificacao` | pronto |
| 4 · Produção e lista de compras (MRP) | `/producao` | pronto |
| 5 · Configurações e painel | `/configuracoes`, `/` | pronto |
| 6 · Estoque com livro de movimentos | `/estoque` | pronto |
| 7 · Vendas, CMV real e engenharia de cardápio | `/vendas` | pronto |
| 8 · Preços por fornecedor e melhor preço | `/insumos`, `/producao` | pronto |

### Consulta de preços de supermercados (Módulo 1b)

Continente, Pingo Doce e Auchan não publicam API aberta de preços; os sites mudam sem aviso, têm proteção anti-bot e termos de uso que restringem recolha automática. Um scraper embutido aqui deixaria de funcionar sozinho e levaria a precificação errada junto.

A aplicação inverte a dependência: define o contrato `PriceProvider` e sabe comparar e aplicar cotações. De onde a cotação vem é configuração — importação CSV (já funciona), anotação manual (já funciona), ou um adapter seu ligado a uma fonte que tenha direito de usar. Para ativar um adapter de loja, implemente `fetchQuotes` em `supermarketAdapter` e registe-o em `getProviders()`.

Uma cotação **nunca** sobrescreve o preço do insumo sozinha: fica no histórico, a aplicação mostra a diferença normalizada por grama, e você decide. O painel avisa quando um insumo se mexeu mais de 5%.

### Produção e lista de compras (Módulo 4)

Você diz quanto quer produzir (`100 Hambúrgueres da Casa, 50 Porções de batata`); a aplicação desce por todas as fichas técnicas e sub-receitas e responde o que comprar. Três coisas separam essa resposta de uma simples multiplicação:

**Fator de correção.** A lista mostra o que é preciso **comprar**, não o que vai ao prato. 10 bifes de 200 g com FC 1,25 são 2.500 g de compra, não 2.000 g.

**Embalagem inteira.** Ninguém vende 0,4 de um pacote de 5 kg. Se faltam 1,6 kg de carne, compram-se 5 e sobram 3,4 kg. Por isso a página mostra dois números que nunca são iguais:

| Número | O que é |
|---|---|
| **A comprar hoje** | embalagens inteiras ao preço de compra — o que sai da caixa |
| **Custo da produção** | o que estes produtos consomem de facto, incluindo o que já está em casa |

Num lote pequeno o primeiro fica bem acima do segundo, e essa diferença (**Fica em despensa**) é dinheiro que sai hoje mas ainda não virou produto. Não se perde — mas também não é custo desta produção, e confundir os dois é como se estraga a margem de uma promoção.

**Estoque e fornecedor.** Só entra na lista o que falta, e a lista sai dividida por loja, na ordem da volta das compras.

A lista mostrada é sempre recalculada ao vivo. **Guardar lista** congela os preços e o estoque do dia do planeamento; se depois um insumo mudar de preço, a aplicação diz quanto a mesma compra passou a custar.

### Preços por fornecedor

Um insumo **é** um item com uma lista de quem o vende. Açúcar refinado comprado no Continente e no Makro é um item com dois preços, não dois itens — e a primeira versão desta app forçava o contrário, pedindo fornecedor e preço logo no cadastro. O resultado apareceu nos dados reais: dois "Açucar refinado" criados com 15 minutos de diferença, um por fornecedor.

Agora **criar** pede o item e o seu primeiro preço; **editar** mostra o item e a lista completa de preços, na mesma janela. Exatamente um preço fica **em uso**: é ele que alimenta o custo de todas as fichas e o que a lista de compras recomenda. Os outros são alternativas para comparar. Trocar é um clique explícito — se a app adotasse sozinha o mais barato, o custo dos produtos mudava porque alguém anotou um preço só para consultar.

**O preço por grama não chega para decidir onde comprar.** É o instinto, e falha quando se precisa de pouco, porque não se compra fração de embalagem:

```
Preciso de 1 kg de carne.
  Talho     12,50 € / 5 kg  →  0,0025/g, mas levo 5 kg  =  12,50 €
  Mercado    3,20 € / 1 kg  →  0,0032/g, e levo 1 kg    =   3,20 €
```

O "mais barato por grama" custava quatro vezes mais nesta compra. Por isso há duas funções em `offers.ts`: `rankOffers` para a ficha do insumo ("quem vende mais barato") e `bestOfferForNeed` para a lista de compras ("onde é que *esta* compra fica mais barata"). A lista mostra a poupança em euros, já contando embalagens inteiras.

Um fornecedor pode ser marcado como **preferido** — por qualidade, prazo ou confiança. A app respeita a escolha e diz quanto ela custa em relação ao mais barato, em vez de a discutir.

**Nomes parecidos** dão aviso ao criar, não recusa: `findSimilarNames` apanha acentos, maiúsculas, um nome contido no outro e gralhas de uma ou duas letras. Recusar impediria "Tomate" e "Tomate cereja" de coexistirem, que é legítimo.

### Estoque e CMV real (Módulos 6 e 7)

O saldo de cada insumo é a **soma de um livro de movimentos**, não um número digitado. Entradas vêm de *Recebi esta compra* numa ordem de produção; saídas de *Produzi*, pela explosão das fichas. Quebras e contagens de inventário entram pelo `/estoque`. Guardar o livro e não só o saldo é o que permite responder a "porque é que diz 3 kg?".

**Valorização: custo médio ponderado.** O resto da app calcula a partir de `purchasePrice`, que é o preço da *próxima* compra — isso não serve para saber quanto valeu o que saiu do armazém. Cada entrada dilui o custo do que já existia; cada saída é valorizada ao médio do momento. É o padrão em alimentação e o único método que faz o CMV real significar alguma coisa.

Duas regras que parecem detalhe e não são:

- **Saldo com custo médio zero não dilui a entrada.** Zero ali significa "custo desconhecido" (estoque digitado à mão), não "de graça". Ponderar contra ele afundaria o preço do que acabou de entrar. O `/estoque` avisa quando isso acontece e oferece valorizar ao preço de compra atual — porque, enquanto não o fizer, as saídas desse saldo entram no CMV real a zero.
- **Ler fora da transação, escrever dentro.** O plano de movimentos é calculado em memória por `planMovements` e a transação fica só com escritas. A primeira versão lia o estado de cada insumo *dentro* do laço e, contra o Supabase, estourava o limite das transações interativas do Prisma sem gravar nada — devolvendo sucesso na mesma.

**Amostras e divulgação não entram no CMV.** Uma ordem de produção pode ser marcada como *para oferecer* — evento, caixa de correio, prova. Os insumos saem do estoque como em qualquer produção, mas os movimentos ficam com o carimbo `PROMO` e são reportados à parte, como custo de marketing. Somá-los ao custo do vendido faria o CMV disparar e mandava procurar desperdício onde não há: numa campanha de 20 amostras de hambúrguer, o CMV real saltava de 28,8% para 31,6% sem nada ter corrido mal.

**Mexer no estoque à mão também é um movimento.** Editar o saldo na ficha do insumo regista um ajuste no livro. Sem isso o saldo mudava sem deixar rasto — e o livro existe precisamente para se poder perguntar *porque é que diz isto?*.

**O resultado** é a comparação que justifica o resto da app: o que as fichas dizem que o vendido devia ter custado, contra o que saiu mesmo do armazém. A diferença é desperdício, porção a mais, ou ficha desatualizada.

E as vendas que esse cálculo precisa são as mesmas que dão vida à **engenharia de cardápio** — a matriz Estrela/Cavalo/Quebra-cabeça/Abacaxi, que até aqui assumia que todos os produtos vendiam igual.

---

## Estrutura

```
prisma/
  schema.prisma           Settings, Supplier, Ingredient, PriceQuote,
                          Recipe, RecipeItem, SalesChannel,
                          ProductionOrder, PurchaseListLine
  seed.ts                 lanchonete de exemplo, preços de Portugal

src/lib/
  units.ts                conversões kg/g/L/ml/un — o único sítio que converte
  money.ts                formatação e leitura de números com vírgula decimal
  mappers.ts              fronteira Prisma Decimal → number
  queries.ts              leituras (Server Components)
  actions/                mutações (Server Actions)
  providers/              contrato de consulta de preços + CSV
  pricing/
    types.ts              estruturas de dados puras
    cost.ts               custo por unidade base, FC, sub-receitas,
                          flattenRecipe (composição achatada) e MRP
    price.ts              os três modos de cálculo e a autópsia do preço
    channels.ts           simulador multicanal, break-even, engenharia de cardápio
    purchase.ts           lista de compras: estoque, embalagem inteira, fornecedor
    stock.ts              custo médio ponderado, plano de movimentos, variância
    offers.ts             comparar fornecedores, melhor preço por necessidade,
                          deteção de nomes parecidos

src/app/                  páginas (App Router)
src/components/
  action-form.tsx         formulários ligados a Server Actions: página,
                          janela (FormDialog) e confirmação (ConfirmDelete)
  data-list.tsx           tabela/cartão responsivo, busca, secções colapsáveis
  site-nav.tsx            barra de topo e barra inferior do telemóvel
  purchase-checklist.tsx  a lista de compras para levar à loja
  price-explorer.tsx      preço editável com CMV e lucro ao vivo
  ingredient-breakdown.tsx  quantidades por porção, nas duas vistas
  product-switcher.tsx    trocar de produto sem voltar à lista
  forms/fields.tsx        campos partilhados entre criar e editar
  ui/                     shadcn/ui vendorizado

tests/                    Vitest sobre a matemática
tools/verify_pricing.py   segunda derivação das fórmulas, em Python
```

`src/lib/pricing/` não importa React, Prisma nem nada do Next.js. É matemática pura e testável, e foi propositado.

### Porquê um verificador em Python

`tools/verify_pricing.py` é uma reimplementação independente das mesmas fórmulas. Não faz parte da aplicação e não é chamado por ela. Existe porque a precificação é a parte onde um erro custa dinheiro real, e uma segunda derivação apanha o que um teste escrito contra a própria implementação não apanha. Corre com `python tools/verify_pricing.py` e não precisa de Node nem de banco.

---

## Decisões que podem surpreender

**Uma só travessia da árvore de receitas.** `flattenRecipe` desce pelas sub-receitas e devolve, por insumo básico, quanto vai no prato e quanto é preciso comprar. A explosão de insumos do Módulo 4 é construída em cima dela — antes eram duas implementações da mesma recursão, e duas oportunidades de divergirem.

**O preço testa-se no browser, sem ir ao servidor.** Escrever um preço recalcula CMV, lucro, margem, a tabela de canais e o gráfico de DRE enquanto se digita. Isto só é possível porque `src/lib/pricing/` não importa React, Prisma nem Next — foi a primeira decisão do projeto e é aqui que ela se paga.

**Tabela no ecrã grande, cartão no telemóvel.** As listas declaram as colunas uma vez em `src/components/data-list.tsx` e ele decide a forma. As linhas chegam do servidor **já renderizadas** em vez de `cell: (item) => …`: o componente precisa de estado (busca, secções abertas) e por isso é de cliente, e funções não atravessam a fronteira servidor→cliente. Nodes de React atravessam.

**A barra de navegação inferior no telemóvel** tem cinco destinos, não sete. Sete a fazer scroll horizontal no topo não se alcançam com o polegar, e é no telemóvel — dentro do supermercado — que esta app se usa a sério. Fornecedores e Configurações ficam como ícones no canto superior, onde se mexe pouco.

**A lista de compras risca-se com o dedo.** O alvo de toque é a linha inteira, não o quadradinho: 16px não se acerta a andar com um carrinho na outra mão. O progresso vive no `localStorage` deste telemóvel, não no servidor — é conveniência de quem está a fazer a volta, não um dado do negócio, e não faz sentido sincronizá-lo entre dispositivos.

**Preferências do browser passam por `useSyncExternalStore`, não por um efeito.** Secções colapsadas e itens riscados na lista de compras vivem no `localStorage`. Lê-los num `useEffect` e chamar `setState` funciona, mas provoca um render em cascata a cada montagem; `useSyncExternalStore` tem um retrato separado para o servidor e resolve a hidratação sem o segundo render. Está tudo em `src/lib/use-stored-state.ts`, com uma cópia em memória para o caso de o armazenamento estar bloqueado.

**Modal para editar, rota para partilhar.** Editar um registo — insumo, fornecedor, canal, uma linha de ficha — abre uma janela, para não perder a lista de vista. O que se quer imprimir, mandar por link ou abrir num separador tem rota própria: ficha técnica, precificação, ordem de produção. Uma ficha completa dentro de uma janelinha fica apertada e deixa de se poder partilhar.

**As janelas de edição e de remoção só fecham quando a ação corre bem.** Se fechassem ao clicar, uma recusa do servidor — "este insumo é usado em 3 fichas técnicas" — desaparecia antes de ser lida e o utilizador ficava sem perceber por que nada aconteceu. Por isso o botão de confirmar não é o `AlertDialogAction` do Radix (que fecha sozinho), mas um `submit` normal.

**`<select>` nativo em vez do Select do Radix.** Quase todos os formulários são `<form action={serverAction}>` sem JavaScript de cliente, e o `<select>` nativo submete o seu valor sozinho. O Radix obrigaria a transformar cada formulário num componente de cliente com estado e input escondido — mais código para o mesmo resultado, e pior no telemóvel. O visual é o do shadcn/ui.

**Decimal no banco, `number` no cálculo.** Dinheiro é `Decimal(12,4)` no Postgres. O `Decimal` do Prisma não atravessa a fronteira servidor/cliente do Next.js nem entra nas funções puras, então a conversão acontece toda em `src/lib/mappers.ts`.

**O grafo inteiro é carregado de uma vez.** `getPricingData()` traz todos os insumos e fichas numa consulta. O custo de um produto pode descer por várias sub-receitas; buscar sob demanda geraria uma cascata de consultas para um volume de dados que cabe folgado em memória numa lanchonete.

**Uma ficha com erro não derruba a listagem.** Um ciclo ou uma unidade incompatível aparece marcada naquela linha; as outras continuam a mostrar o seu custo.

**A embalagem de transporte não entra no custo do produto de balcão.** Ela só é cobrada nos canais marcados com `usesDeliveryPackaging`.

**Tudo se mede a peso ou a unidade — não há litros.** O formulário de insumo oferece duas famílias: peso (kg/g) e unidades. Os líquidos vão à balança. A razão é que converter volume em peso exige a densidade — 1 L de óleo são 920 g, de mel são 1400 g — e a app não tem como a saber; adivinhar 1,0 dava um custo errado em silêncio, que é a pior espécie de erro numa app de custos. `src/lib/units.ts` continua a converter L e ml, porque um CSV de fornecedor pode trazê-los e internamente funcionam: o que desapareceu foi a opção no ecrã.

**Limpar os dados é um script com ensaio, não um botão.** `prisma/reset-dados.mts` esvazia insumos, fichas, produções, estoque e vendas, e **mantém** configurações e canais. Sem `--apply` não apaga nada, só diz o que apagaria. Apaga tabela a tabela pelo Prisma, na ordem de filho para pai, e nunca com `TRUNCATE` ou `--accept-data-loss`: este Postgres é partilhado com outro projeto, que vive no schema `public`. O script conta as linhas desse outro projeto no fim, para o provar. Há também `prisma/dump-dados.mts`, que grava tudo em JSON antes.

**Uma unidade base para calcular, outra para mostrar.** A base de dados guarda tudo em gramas e unidades, porque um insumo a 1,69 EUR/kg custa 0,00169 por grama e arredondar isso a cada receita acumula erro. O ecrã nunca mostra gramas: quantidades leem-se `0,015 kg`, custos leem-se `1,69 EUR/kg`. A conversão vive toda em `src/lib/units.ts` (`toDisplay`/`fromDisplay`), e os formulários convertem nas duas pontas. Nada escala automaticamente conforme o valor — uma lista onde uma linha diz `900 g` e a de baixo diz `1,2 kg` não se compara de relance, que é para o que a lista serve.

**Os menus de unidade desapareceram.** Sobrava uma opção por família, e um menu de uma opção é um clique que não decide nada — pior, sugere que havia escolha. O `QtyInput` põe `kg` ou `un` dentro do campo e submete a unidade num campo escondido, para as actions do servidor não terem de adivinhar a escala.

**Os custos da ficha técnica começam escondidos.** Uma ficha serve a cozinha, que quer ler o que leva, e o escritório, que quer ver para onde vai o dinheiro. Um botão alterna, e a escolha guarda-se no browser. O total do lote esconde-se com as parcelas: uma soma sozinha só levanta a pergunta de onde vem.

**O ponto decimal e ambiguo, e ja custou dinheiro.** Em pt-PT `1.234` sao mil duzentos e trinta e quatro; no teclado do telemovel `0.200` sao dois decimos. A regra antiga — "ponto seguido de tres digitos e milhar" — lia `0.200` como 200, e foi assim que 0,200 kg de fermento entraram na base como 200 kg, com o insumo a custar 0,01 EUR/kg em vez de 10,00. A regra nova acrescenta o que torna o caso inequivoco: **um grupo de milhar nunca comeca por zero**. Alem disso, ha agora duas funcoes: `parseDecimal` para dinheiro, onde o agrupamento faz sentido, e `parseQty` para quantidades, onde o ponto e sempre decimal — o tamanho de uma embalagem nunca se escreve com separador de milhar. O leitor de CSV usa as mesmas regras, porque sofria o mesmo engano.

**A aplicacao fecha por omissao.** Sem `APP_PASSWORD` definida ninguem entra — nem sequer fica aberta com um aviso. Publicar sem definir a variavel deixa-o de fora ate a definir, e a pagina de entrada diz exatamente o que fazer. E a escolha certa para uma ferramenta que so tinha protecao nenhuma: o risco de ficar trancado durante dois minutos e menor que o de ter os custos e as margens da casa a mercê de quem apanhe o link.

Nao ha contas de utilizador, e e deliberado. Nada na aplicacao pertence a uma pessoa e nao a outra: nao ha autoria, nao ha permissoes, nao ha historico por utilizador. Email, recuperacao de palavra-passe e tabela de utilizadores seriam trabalho e superficie de ataque para distinguir pessoas que a aplicacao nao precisa de distinguir. E uma palavra-passe partilhada e um cookie assinado, e troca-la expulsa toda a gente.

A chave que assina o cookie e derivada da propria palavra-passe em vez de ser uma segunda variavel. Uma variavel poe-se; duas esquecem-se — e uma configuracao de seguranca por fazer nao protege nada. Nao enfraquece: quem partisse a chave por forca bruta partia a palavra-passe pelo mesmo esforco, e entrava pela porta. A data de validade vai **dentro** do que e assinado, para ninguem esticar a sessao mexendo no cookie.

O porteiro esta em `src/proxy.ts`, e nao `middleware.ts`: o Next 16 renomeou a convencao. Corre no Node.js, o que permite assinar com `node:crypto` em vez de reescrever tudo em Web Crypto.
