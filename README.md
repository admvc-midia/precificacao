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
npm test                 # ~330 testes sem base: custos, preços, estoque, datas, sessões, diff
npm run lint             # ESLint com as regras do Next — apanha o que o tsc não vê
npx tsc --noEmit
npm run test:db:preparar # uma vez (e depois de mudar o schema): cria o schema dos testes
npm run test:db          # ~80 testes das Server Actions, no schema precificaragao_teste
```

O `lint` corre o ESLint diretamente: o `next lint` foi removido no Next 16. Ele apanha uma classe de problemas que o TypeScript ignora e que só apareceria no browser — listas sem `key`, `setState` dentro de efeitos, hooks mal usados.

Um banco Postgres qualquer serve — [Neon](https://neon.tech), Supabase ou Vercel Postgres. **`DATABASE_URL` é a única variável obrigatória**; no Neon, use a *pooled connection string*.

#> **Nesta máquina:** uma política de Controlo de Aplicações do Windows bloqueia o binário nativo do SWC, e o Turbopack não corre sem ele. Por isso o script `dev` usa `--webpack`. Onde o binário carregue normalmente, `npm run dev:turbo` é mais rápido.

### Prisma 7 (desde 2026-10-08)

- **O cliente é gerado para `src/generated/prisma`** (fora do git) e importa-se de `@/generated/prisma/client`, nunca de `@prisma/client`. Um segundo gerador, `tools/gerador-modelo.mjs`, escreve `src/generated/modelo.ts` com as tabelas e campos — o que a cópia completa e o restauro usavam de `Prisma.dmmf`, que o cliente do Prisma 7 já não traz. Os dois correm em cada `prisma generate` (build e `postinstall`).
- **A aplicação liga-se pelo adaptador `pg`** (`src/lib/db.ts`, `ligacaoDoEndereco`). O `DATABASE_URL` continua igual, mas o adaptador não percebe os parâmetros do Prisma 5, por isso são traduzidos: `schema` → opção do adaptador; `connection_limit` → tamanho da pool (5 sem ele); `sslmode` → TLS sem verificar o certificado, como antes (`sslmode=disable` desliga); `pgbouncer` sai. **Sem `?schema=` a app recusa-se a arrancar**, em vez de cair no `public`, que nesta base é de outro projeto. A pool tem limites de tempo: o `pg` sozinho esperava para sempre por uma ligação que o pooler cortou.
- **SQL escrito à mão leva sempre `tabela('Nome')`** (de `lib/db.ts`): o adaptador põe o schema nas consultas que gera, mas a ligação continua com `search_path` no `public`.
- **A linha de comandos lê `prisma.config.ts`** (endereço e seed), com `dotenv`: o Prisma 7 já não lê o `.env` sozinho. Os scripts em `prisma/` começam por `import 'dotenv/config'` antes de importar `lib/db`.
- Ficou na **7.10.0**, a última estável: a 8 ainda é *release candidate* (a etiqueta `latest` do npm aponta para ela).

### Migrations

O caminho recomendado é `npm run db:push`, que funciona através do pooler — sempre depois de `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` confirmar que a alteração só acrescenta. Migrations versionadas (`npm run db:migrate`) precisam de uma ligação direta (usam advisory locks que o pooler não suporta): em `prisma.config.ts`, aponte `datasource.url` a uma variável com a connection string sem pooler.

### Deploy na Vercel

1. Importe o repositório.
2. Defina as variáveis de ambiente: `DATABASE_URL`, **`APP_PASSWORD`** (uma frase, só para criar a primeira conta de dono), **`SESSION_SECRET`** (32+ caracteres aleatórios, gerados com `npx tsx tools/novo-segredo.mts` — assina as sessões) e `BLOB_READ_WRITE_TOKEN` (fotos e PDFs, ou ligue o store em Storage → Connect). Sem as duas primeiras de segurança ninguém entra, nem você — ver "A aplicação fecha por omissão" mais abaixo.

   A `DATABASE_URL` de produção **não é a mesma** do seu computador. Em serverless cada pedido é um cliente novo, e o pooler do Supabase em modo sessão (porta `5432`) tem tecto de 15 ligações: meia dúzia de pedidos esgota-o e as páginas rebentam com um erro de render genérico, que não aponta para a porta nenhuma. Use o modo transação:

   ```
   postgresql://user:pass@HOST.pooler.supabase.com:6543/postgres?sslmode=require&schema=precificaragao&pgbouncer=true&connection_limit=1
   ```

   `connection_limit=1` evita que cada instância abra mais do que precisa (vira o tamanho da pool do `pg`). O `pgbouncer=true` era para o Prisma 5; com o adaptador `pg` não faz falta, mas pode ficar. O `schema=` não é opcional aqui — esta base é partilhada com outro projeto.
3. O `build` já corre `prisma generate`; o `postinstall` também, para o caso do cache de dependências da Vercel.
4. Na primeira vez, corra `npm run db:push` apontando para o banco de produção. Depois, abra a app: sem contas, a página de entrada pede a `APP_PASSWORD` e cria a conta de dono; as restantes criam-se em ⚙ → Utilizadores.

#### "No Output Directory named 'public' found after the Build completed"

O build correu bem; o que falhou foi o reconhecimento do projeto. A Vercel achou que isto era um site estático e foi procurar uma pasta `public`.

Acontece quando o projeto da Vercel é ligado a um repositório **vazio**, antes de haver código: sem `package.json` não há framework para detetar, o preset fica em *Other* — que espera ficheiros estáticos — e não se corrige sozinho quando o código chega. Foi o que aconteceu aqui: o primeiro commit deste repositório era só o README gerado pelo GitHub.

O `vercel.json` na raiz fixa `"framework": "nextjs"` e resolve o caso normal. Se o erro persistir, é porque há uma substituição manual no painel, que ganha ao ficheiro: **Settings → Build and Deployment**, e em *Output Directory* desligue o override (o botão *Override*), deixando o valor por omissão. Na mesma página, *Framework Preset* deve dizer **Next.js**.

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

**Estoque mínimo.** Um insumo com mínimo compra também o que falta para ficar nele: precisa de 0,4 kg, tem 1 kg, mínimo 0,8 kg — compra 0,2 kg. A linha diz quanto é para o mínimo, e o **Custo da produção** não o conta (repor a despensa não é custo destes produtos). *Recebi esta compra* e *Guardar lista* usam a mesma conta. Os insumos no mínimo que a ordem não usa aparecem em **Também a acabar**, só como lembrete: metê-los na compra faria cada ordem arrastar a despensa inteira.

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

Não há fornecedor "preferido" como campo à parte: a preferência é o próprio preço **em uso**. Pode ser de propósito o de uma loja mais cara — por qualidade, prazo ou confiança. A app respeita a escolha e mostra quanto ela custa em relação ao mais barato ("há 6% mais barato em Continente"), em vez de a trocar.

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

### Compras (a aba do comprador)

`/compras` tem listas de compras **próprias**, que não dependem de uma ordem de produção ("Makro sábado"). Enchem-se à mão (pesquisa nos insumos), com **o que está abaixo do mínimo**, ou copiando a lista de uma ordem. No supermercado, o comprador risca, corrige preço/loja/embalagem, marca "não havia", e usa **Juntar insumo / achei mais barato**: escolhe o insumo, vê estoque, mínimo, para quantos dias chega (saídas dos últimos 30 dias) e o preço em uso, e a comparação por kg aparece enquanto escreve o preço.

Três regras:

- **Riscar não mexe no estoque; só fechar.** `closeShoppingList` dá entrada do que foi riscado ao preço **pago** (é isso que acerta o custo médio), com a mesma guarda atómica do *Recebi esta compra*: dois telemóveis a fechar ao mesmo tempo entram uma vez.
- **O preço pago fica registado para a loja**, mas só passa a ser o **em uso** se o comprador marcar "usar daqui para a frente", se o insumo não tinha nenhum, ou se é da própria loja do preço em uso (a loja mudou o preço — é a realidade). Um preço mais barato noutra loja não muda o custo das fichas sem ninguém decidir.
- Uma lista que veio de uma ordem dá entrada por aqui **ou** pelo *Recebi esta compra* da ordem — não pelos dois.
- **Uma linha por insumo.** Juntar o que já está por comprar (ou "não havia") soma a essa linha; "achei mais barato" corrige-a (preço, loja, embalagem, quantidade); "de uma produção" soma ao que lá está, e a mesma ordem só entra uma vez (`ShoppingList.orderIds`, com guarda atómica). A exceção é o que já está no carrinho: precisar de mais é uma linha nova, para não misturar o apanhado com o que falta.

As escritas partilhadas (`gravarPlano`, `lerEstados`, `sincronizarEmUso`) vivem em `lib/escritas.ts` e não num ficheiro `'use server'`: tudo o que esses exportam fica chamável do browser, e estas gravam sem validar.

### Fotos dos produtos

Cada ficha pode ter uma foto (na ficha, na lista de Fichas e Precificação, e na ficha impressa). Ficam no **Vercel Blob**, store `precificacao-blob`, que é **privado**: um URL do store não abre sem o token. Por isso a base guarda o caminho (`Recipe.photoPath`, `photoThumbPath`) e a foto chega ao browser por `/api/fotos/<id>`, que exige sessão — quem não entrou não vê as fotos, mesmo com o endereço.

- **Reduzida no telemóvel antes de enviar** (`components/foto-produto.tsx`): 1600 px em JPEG, mais uma miniatura de 320 px para as listas. Uma foto de 6,8 MB chega com ~250 KB; cabe no limite das actions sem o alargar.
- **O servidor confere os bytes**, não o que o browser diz (`tipoDaImagem`): só JPEG, PNG e WebP.
- **Cada foto nova tem um caminho novo** (sufixo aleatório). A rota manda guardar em cache para sempre (`private, immutable`) e o `?v=` no endereço garante que nunca se vê a antiga.
- **Nada fica órfão:** trocar grava a nova, aponta a ficha, e só depois apaga a antiga; remover e apagar a ficha apagam do Blob.
- `<img>` e não `next/image`: o otimizador pediria a foto sem o cookie e receberia a página de entrada.
- A **cópia semanal** descarrega as fotos para `fotos/`, só as que faltam.

Configuração: `BLOB_READ_WRITE_TOKEN` no `.env` e na Vercel (ligar o store ao projeto em *Storage → Connect* cria-a sozinha). Sem ela, o resto funciona e o envio de fotos diz o que falta.

### Paginação e casas decimais

As listas (`GroupedList`), a checklist de compras e o livro do Estoque paginam — 20 por secção, 15 por loja. O Estoque pagina **na base** (`getMovementsPage`, com filtros no endereço), porque o livro só cresce; as listas de cliente já têm as linhas e só escolhem quais mostrar. As contas estão em `lib/paginacao.ts`.

Em Configurações, **Casas decimais**: automático (até 4) ou 2. Só muda a leitura das quantidades e do custo por kg (`CurrencyConfig.decimals`, lido por `formatBaseQty`/`formatCostPerUnit`/`formatUnitCost`); as contas, a base e a exportação guardam tudo. Com 2 casas, o que arredondaria para zero aparece como "< 0,01 kg".

### Exportar e cópia de segurança

Em **⚙ → Cópia de segurança** (`/exportar`) há três coisas:

- **Restaurar uma cópia** (só o dono) — a base volta a ficar **exatamente** como no dia da cópia: substitui, não junta. Dois passos: escolher o ficheiro (`analisarCopiaAction` lê e mostra, por tabela, quanto há agora e quanto fica, e quanto foi criado depois da cópia — sem escrever nada) e escrever `RESTAURAR` (`restaurarCopiaAction`). Antes de mexer, grava uma cópia do estado atual no Blob privado (`copias/antes-de-restaurar-*.json`, listadas na página, descarregáveis por `/api/copias`); sem Blob, recusa-se. O restauro corre numa só transação, pela ordem das chaves estrangeiras lida do schema (`lib/exportar/restaurar.ts`); a coluna que aponta para a própria tabela (quem indicou o cliente) preenche-se no fim, e a numeração das encomendas continua a partir da maior da cópia. **Nunca mexe** em `User`, `AuditLog` nem `LoginThrottle`: a cópia não tem as palavras-passe e o registo não se apaga. Uma cópia com dados numa tabela que já não existe, ou sem uma coluna hoje obrigatória, é recusada antes de tocar na base. Fotos e PDFs não vão no JSON (só o caminho no Blob).
- **Listas em CSV** para o Excel — insumos, fornecedores, preços por fornecedor, fichas, preços sugeridos, movimentos, encomendas e despesas. Ponto e vírgula entre colunas, vírgula decimal, BOM UTF-8: é o que o Excel em português abre sem assistente. Quantidades em kg/L/un, nunca gramas; texto que começa por `=`, `+`, `-` ou `@` leva apóstrofo, para não virar fórmula.
- **Cópia completa** em JSON — todas as tabelas tal como estão. As tabelas são lidas do próprio schema (`MODELOS`, gerado a cada `prisma generate`), não de uma lista escrita à mão: um script antigo com a lista à mão esquecia as despesas, e ninguém deu por isso. **Sem segredos**: os hashes das palavras-passe e qualquer campo com nome de segredo (`password`, `hash`, `token`, `secret`) ficam de fora (`camposFora` em `lib/exportar/gerar.ts`).

A mesma cópia corre sozinha: `prisma/copia-seguranca.mts <pasta> [quantas]` grava e apaga as mais antigas (12 por omissão), copia as fotos e os PDFs originais do livro de receitas, e apaga do Blob os PDFs de importações abandonadas há mais de 24 h. `tools/agendar-copia.ps1` cria a tarefa do Windows — segundas às 10h, ou assim que o computador for ligado, para `OneDrive\Copias\precificacao`. O registo da última fica em `ultima-copia.log`, ao lado.

### Encomendas, clientes e pós-venda

A casa trabalha por encomenda, e a venda **é** a encomenda (`CustomerOrder`): conta nos resultados quando é marcada como entregue, no mês de Lisboa em que o foi (`lib/datas.ts`). Cada linha guarda o preço combinado e o **custo do dia** — o lucro de setembro não muda porque a farinha subiu em outubro. "Produzir as marcadas" soma várias encomendas numa ordem de produção. Clientes com origem, quem indicou, gostos e aniversário; o pós-venda agenda-se ao entregar, só para quem deu consentimento (RGPD), com a mensagem do WhatsApp já escrita. `/vendas` (Resultados do mês) e `/relatorio` só leem. As contas puras vivem em `lib/pricing/encomendas.ts`, `clientes.ts` e `relatorio.ts`.

### Calendário de produção

`/calendario` (Resultados → Calendário de produção). Os **feriados de Portugal** e as **datas que vendem doces em Portugal e no Brasil** não estão na base: calculam-se em `lib/calendario/datas.ts`, incluindo a Páscoa (Meeus/Jones/Butcher) e o que dela depende, e os domingos móveis — que diferem entre os dois países (Dia da Mãe 1.º domingo de maio em PT, 2.º no BR; Dia da Criança 1/6 em PT, 12/10 no BR). Cada data tem uma `chave` sem ano.

Na base (`CalendarEvent`) ficam os eventos do dono (`day`, `yearly`, `kind`: evento, tendência, equipa) e as datas conhecidas que o dono completou (`knownKey`; o dia continua a vir do cálculo). Cada um tem um **plano de produção** (`CalendarPlanItem`: produzir mais / menos / não produzir, por ficha de produto) e **como correu** em cada ano (`CalendarReview`). `lib/calendario/eventos.ts` junta tudo num intervalo (puro, testado); `consultas.ts` lê a base e as vendas reais por dia (encomendas não canceladas, pelo dia do `dueAt`), para mostrar o que se vendeu nessa data no ano anterior. Uma faixa com os próximos 10 dias aparece em Encomendas e Produção. A cozinha vê; só o dono escreve.

### Contas, permissões e registo

Três perfis (`UserRole`): **dono** (tudo), **cozinha** (o livro de receitas, sem custos) e **leitura**. O acesso decide-se em três sítios, de propósito redundantes: o `proxy.ts` (lista de rotas por perfil, pelo cookie assinado), o layout (confirma na base, a cada página, que a conta continua ativa e igual) e **cada action** (`exigirDono`, `exigirEditorDoLivro` em `lib/sessao.ts`) — uma action é chamável de qualquer página, e o menu escondido não protege nada. **Uma action nova tem de começar por um destes.**

Palavras-passe em scrypt; 5 falhas seguidas bloqueiam a conta, 20 da mesma origem bloqueiam a origem, ambos 15 minutos. Sessões de 12 horas, ou 30 dias com "manter neste aparelho". O `AuditLog` regista entradas, contas, configurações, preços, estoque, encomendas e o que se apaga (`lib/registo.ts`; página `/registo`), e só se escreve.

### Livro de receitas

Receitas (`BookRecipe`) com versões (`BookRecipeVersion`): a 1 é a original e nunca muda; cada alteração cria a seguinte, com autor e motivo. A comparação é um diff de linhas e palavras próprio (`lib/livro/diff.ts`, LCS — sem dependência). Livros com secções e impressão pelo diálogo do browser (capa, índice, uma receita por folha). A importação lê o texto de PDFs com `unpdf` e separa-o por heurística (`lib/livro/importar.ts`); abre sempre num ecrã de revisão. PDFs digitalizados não têm texto e não se leem.

**Repor a partir de uma cópia não está feito**, de propósito: a base é partilhada com outro projeto, e uma reposição automática é o tipo de script que se escreve com calma no dia em que for preciso, não antes.

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

**Limpar os dados é um script com ensaio, não um botão.** `prisma/reset-dados.mts` esvazia insumos, fichas, produções, estoque, encomendas, clientes e as listas de compras, e **mantém** configurações, canais, contas e o livro de receitas. Sem `--apply` não apaga nada, só diz o que apagaria. Apaga tabela a tabela pelo Prisma, na ordem de filho para pai, e nunca com `TRUNCATE` ou `--accept-data-loss`: este Postgres é partilhado com outro projeto, que vive no schema `public`. O script conta as linhas desse outro projeto no fim, para o provar. Antes de o correr, faça uma cópia (`prisma/copia-seguranca.mts`).

**Uma unidade base para calcular, outra para mostrar.** A base de dados guarda tudo em gramas e unidades, porque um insumo a 1,69 EUR/kg custa 0,00169 por grama e arredondar isso a cada receita acumula erro. O ecrã nunca mostra gramas: quantidades leem-se `0,015 kg`, custos leem-se `1,69 EUR/kg`. A conversão vive toda em `src/lib/units.ts` (`toDisplay`/`fromDisplay`), e os formulários convertem nas duas pontas. Nada escala automaticamente conforme o valor — uma lista onde uma linha diz `900 g` e a de baixo diz `1,2 kg` não se compara de relance, que é para o que a lista serve.

**Os menus de unidade desapareceram.** Sobrava uma opção por família, e um menu de uma opção é um clique que não decide nada — pior, sugere que havia escolha. O `QtyInput` põe `kg` ou `un` dentro do campo e submete a unidade num campo escondido, para as actions do servidor não terem de adivinhar a escala.

**Os custos da ficha técnica começam escondidos.** Uma ficha serve a cozinha, que quer ler o que leva, e o escritório, que quer ver para onde vai o dinheiro. Um botão alterna, e a escolha guarda-se no browser. O total do lote esconde-se com as parcelas: uma soma sozinha só levanta a pergunta de onde vem.

**O ponto decimal e ambiguo, e ja custou dinheiro.** Em pt-PT `1.234` sao mil duzentos e trinta e quatro; no teclado do telemovel `0.200` sao dois decimos. A regra antiga — "ponto seguido de tres digitos e milhar" — lia `0.200` como 200, e foi assim que 0,200 kg de fermento entraram na base como 200 kg, com o insumo a custar 0,01 EUR/kg em vez de 10,00. A regra nova acrescenta o que torna o caso inequivoco: **um grupo de milhar nunca comeca por zero**. Alem disso, ha agora duas funcoes: `parseDecimal` para dinheiro, onde o agrupamento faz sentido, e `parseQty` para quantidades, onde o ponto e sempre decimal — o tamanho de uma embalagem nunca se escreve com separador de milhar. O leitor de CSV usa as mesmas regras, porque sofria o mesmo engano.

**A aplicacao fecha por omissao.** Sem `APP_PASSWORD` e `SESSION_SECRET` definidas ninguem entra — nem sequer fica aberta com um aviso. Publicar sem as definir deixa-o de fora ate as definir, e a pagina de entrada diz exatamente o que fazer. O risco de ficar trancado durante dois minutos e menor que o de ter os custos e as margens da casa a mercê de quem apanhe o link.

Ate outubro de 2026 nao havia contas, e a chave do cookie saia da `APP_PASSWORD`. As duas coisas mudaram com o livro de receitas, que precisa de autoria e de permissoes. E a chave passou a ser uma variavel propria, aleatoria: a `APP_PASSWORD` e uma frase que alguem escreve, e quem apanhasse um cookie podia tentar adivinha-la offline, sem limite de tentativas, e forjar uma sessao de dono. Agora a `APP_PASSWORD` so serve para criar a primeira conta. A data de validade vai **dentro** do que e assinado, para ninguem esticar a sessao mexendo no cookie.

**Cabecalhos de seguranca em `next.config.mjs`.** CSP nas paginas (scripts so do proprio sitio, sem molduras, sem plugins, formularios so para o proprio sitio — com `'unsafe-inline'` nos scripts porque o Next poe scripts seus na pagina), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS em producao, e sem `X-Powered-By`. A CSP nao vai nas rotas `/api`, que entregam ficheiros: o leitor de PDF do browser nao abre debaixo dela.

O porteiro esta em `src/proxy.ts`, e nao `middleware.ts`: o Next 16 renomeou a convencao. Corre no Node.js, o que permite assinar com `node:crypto` em vez de reescrever tudo em Web Crypto.

**O alerta de estoque baixo é opcional, insumo a insumo.** O mínimo (`minStockBase`) é nulo por omissão, e nulo significa "não avisar" — não zero. Um mínimo por insumo é trabalho de quem cadastra, e obrigar a preencher onze campos antes de a aplicação servir para alguma coisa seria trocar um problema por outro. Quem quiser o aviso define o mínimo; quem não quiser não é incomodado, e o cartão do painel nem aparece.

O nível está em `lowStock`/`stockLevel` (`lib/pricing/stock.ts`), fora do React e do Prisma como o resto do motor. Três decisões lá dentro: estar **exatamente** no mínimo já pede reposição (o mínimo é o ponto em que se compra, não aquele em que já faltou); "acabou" é separado de "a acabar" porque são decisões diferentes — uma entra na lista de compras, a outra já parou a produção; e um saldo **negativo** vem antes de tudo mesmo sem mínimo definido, porque não é falta de compras, é produção registada sem a entrada. A ordem dentro de cada gravidade é pela **fração** do mínimo que resta, não pela quantidade em falta: faltar meio quilo de fermento é mais urgente do que faltar meio quilo de farinha.

**Ha uma rota de diagnostico: `/api/saude`.** Quando um Server Component falha em producao, o React esconde a mensagem e deixa so um numero — a verdadeira fica nos registos do servidor, que nem sempre sao faceis de alcancar. Esta rota tenta falar com o banco e devolve o erro tal como e, com o codigo do Prisma, mais o que a aplicacao ve da ligacao: anfitriao, porta, parametros, e se a porta e a de sessao ou a de transacao. Nao sai dali nem a palavra-passe nem as credenciais do banco, e so o dono a ve: o `proxy.ts` cobre a rota pelo cookie assinado. De proposito, nao confirma a conta na base como as outras rotas — existe para quando a base falha.

**O seed recusa-se a correr por cima de dados.** Ele chama-se idempotente, e e — para os registos que ele proprio cria. Numa base com dados a serio nao e inofensivo: apaga as linhas de qualquer ficha cujo nome bata com uma das suas, apaga as cotacoes do insumo de carne, e junta vinte e tal registos de demonstracao aos verdadeiros, que depois ha que distinguir um a um. Agora conta o que encontra, diz o que faria, e sai. `--forcar` para quem souber o que esta a fazer.

**O CI nao tem base de dados, de proposito.** O motor de custos, as unidades, as despesas e a sessao sao funcoes puras e testam-se sem Postgres nenhum. O que depende da base verifica-se a mao contra uma base descartavel — ligar um runner publico a base real seria risco sem ganho. A `DATABASE_URL` no workflow e falsa e so existe porque o `prisma generate` exige que a variavel declarada no schema esteja definida; nada se liga a ela, e o `next build` passa porque todas as rotas sao dinamicas e nenhuma corre durante a compilacao.

**Duas suites: uma sem base de dados, outra contra ela.** `npm test` corre o motor de custos, as unidades, as despesas, as datas, a sessao e o diff — funcoes puras, sem Postgres nenhum. E o que o CI faz e o que funciona logo apos clonar. `npm run test:db` corre os testes das Server Actions contra uma base a serio, que e onde estiveram os defeitos que mais custaram: o preco em uso que nao se copiava para o insumo, o estoque que nascia sem entrada no livro.

Essa base e o schema `precificaragao_teste`, no mesmo Postgres: a ligacao do `.env` com o schema trocado (`tests/integracao/base-de-testes.ts`), e os testes recusam-se a correr noutro. Ate outubro de 2026 escreviam na base da casa, e as defesas de entao ficaram: nada se cria sem o prefixo `ZZTEMP-`; a configuracao fotografa-se antes e repoe-se depois; e conta-se o que nao e de teste antes e depois, falhando se um numero mudar — com um ficheiro que testa a propria rede, porque uma verificacao que passa sempre e indistinguivel de uma avariada. As actions recebem uma sessao falsa (`sessao-falsa.ts`, com `comoSe(perfil)` para provar o que cada perfil nao pode fazer).

**Alergenios: dois campos por insumo, nao um.** A lista diz o que ele contem; a marca de verificado diz se alguem olhou. Um produto que leva farinha e ovos mostraria "sem alergenios" enquanto ninguem preenchesse nada — e isso nao e informacao em falta, e informacao errada, a unica saida deste produto que pode mandar alguem para o hospital. Um insumo por verificar entra no resultado como **duvida**, nunca como ausencia, e a ficha separa os dois numeros. `collectAllergens` recebe as linhas ja achatadas, por isso as sub-receitas vem resolvidas, que e o que a lei quer. Vestigios por contaminacao cruzada nao sao modelados de todo: fingir que eram seria pior que a sua ausencia.

**A ficha para imprimir e uma rota, nao um `@media print` na pagina de edicao.** Esconder botoes, janelas e campos com CSS da uma folha cheia de buracos onde os elementos estavam, e obriga a manter duas leituras do mesmo markup que divergem a primeira alteracao. `/fichas/[id]/imprimir` tem so o que vai para o papel. **Custos nao vao**: uma ficha afixada e lida por quem passa, e as margens da casa nao sao assunto de fornecedores nem de clientes. Nao ha biblioteca de PDF — o dialogo do sistema ja tem "Guardar como PDF", e uma biblioteca traria megabytes e uma segunda maneira de a folha divergir do ecra.
