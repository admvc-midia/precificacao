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

Testes da matemática de precificação:

```bash
npm test
```

Um banco Postgres qualquer serve — [Neon](https://neon.tech), Supabase ou Vercel Postgres. **`DATABASE_URL` é a única variável obrigatória**; no Neon, use a *pooled connection string*.

#### Migrations

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
| Custo primo e frete | valor absoluto | não são percentagens |

**A equação.** Com `P` = preço de menu, `C` = custo primo, `D` = frete, `f` = custos fixos, `m` = lucro alvo, `c` = cartão, `k` = comissão, `iva` = alíquota:

```
receita_líquida × (1 − f − m)  −  bruto × (c + k)  =  C + D
```

resolvida para `P`:

```
IVA incluído:   P × [ (1 − f − m) / (1 + iva) − (c + k) ] = C + D
IVA acrescido:  P × [ (1 − f − m) − (1 + iva) × (c + k) ] = C + D
```

O termo entre colchetes é o **denominador**. Se for ≤ 0, as taxas somadas consomem toda a receita e **não existe preço viável** — a aplicação diz isso em vez de devolver um número absurdo.

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
    cost.ts               custo por unidade base, FC, sub-receitas, MRP
    price.ts              os três modos de cálculo e a autópsia do preço
    channels.ts           simulador multicanal, break-even, engenharia de cardápio
    purchase.ts           lista de compras: estoque, embalagem inteira, fornecedor

src/app/                  páginas (App Router)
src/components/           shadcn/ui vendorizado + DRE + formulários

tests/                    Vitest sobre a matemática
tools/verify_pricing.py   segunda derivação das fórmulas, em Python
```

`src/lib/pricing/` não importa React, Prisma nem nada do Next.js. É matemática pura e testável, e foi propositado.

### Porquê um verificador em Python

`tools/verify_pricing.py` é uma reimplementação independente das mesmas fórmulas. Não faz parte da aplicação e não é chamado por ela. Existe porque a precificação é a parte onde um erro custa dinheiro real, e uma segunda derivação apanha o que um teste escrito contra a própria implementação não apanha. Corre com `python tools/verify_pricing.py` e não precisa de Node nem de banco.

---

## Decisões que podem surpreender

**`<select>` nativo em vez do Select do Radix.** Quase todos os formulários são `<form action={serverAction}>` sem JavaScript de cliente, e o `<select>` nativo submete o seu valor sozinho. O Radix obrigaria a transformar cada formulário num componente de cliente com estado e input escondido — mais código para o mesmo resultado, e pior no telemóvel. O visual é o do shadcn/ui.

**Decimal no banco, `number` no cálculo.** Dinheiro é `Decimal(12,4)` no Postgres. O `Decimal` do Prisma não atravessa a fronteira servidor/cliente do Next.js nem entra nas funções puras, então a conversão acontece toda em `src/lib/mappers.ts`.

**O grafo inteiro é carregado de uma vez.** `getPricingData()` traz todos os insumos e fichas numa consulta. O custo de um produto pode descer por várias sub-receitas; buscar sob demanda geraria uma cascata de consultas para um volume de dados que cabe folgado em memória numa lanchonete.

**Uma ficha com erro não derruba a listagem.** Um ciclo ou uma unidade incompatível aparece marcada naquela linha; as outras continuam a mostrar o seu custo.

**A embalagem de transporte não entra no custo primo de balcão.** Ela só é cobrada nos canais marcados com `usesDeliveryPackaging`.
#   p r e c i f i c a c a o  
 