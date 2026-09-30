/**
 * Ajuda: a versao publicada e um passo a passo de cada parte da app.
 *
 * Escrita para quem usa a app na casa, nao para quem a programa — o
 * `README.md` e para isso. O `GUIA.md` aprofunda Vendas e CMV real; aqui fica
 * o essencial de cada area, pela ordem em que se usam.
 *
 * Cada secao tem um `id` que as paginas usam no "?" ao lado do titulo
 * (`/ajuda#fichas`). Mudar um `id` parte esses links: ver `AjudaLink`.
 */

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

import { AbrirSecaoDoLink } from '@/components/abrir-secao';
import pkg from '../../../package.json';

export const metadata = { title: 'Ajuda · Amo Brigs' };

function versao() {
  const commit = process.env.APP_COMMIT;
  const data = process.env.APP_BUILD_DATE
    ? new Date(process.env.APP_BUILD_DATE).toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;
  return { numero: pkg.version, commit: commit || null, data };
}

interface Secao {
  id: string;
  titulo: string;
  /** Uma linha: o que se faz ali. Aparece com a secao fechada. */
  resumo: string;
  href?: string;
  conteudo: React.ReactNode;
}

/** Passos numerados, com o mesmo aspeto em todas as secoes. */
function Passos({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">{children}</ol>;
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border-l-4 border-primary/60 bg-secondary/60 px-3 py-2 text-sm">
      {children}
    </p>
  );
}

const SECOES: Secao[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    resumo: 'A ordem certa para pôr a casa na app.',
    conteudo: (
      <>
        <p>
          Cada parte depende da anterior: sem insumos não há ficha, sem ficha não há preço,
          sem compras e produção registadas não há CMV real. Por isso vale a pena seguir
          esta ordem da primeira vez:
        </p>
        <Passos>
          <li>
            <strong>Configurações</strong> — nome, IVA, custos fixos, CMV alvo e margem.
          </li>
          <li>
            <strong>Fornecedores</strong> — as lojas onde compra.
          </li>
          <li>
            <strong>Insumos</strong> — tudo o que compra: ingredientes e embalagens, com o
            preço.
          </li>
          <li>
            <strong>Fichas técnicas</strong> — as receitas: primeiro as preparações base
            (recheios, massas, caldas), depois os produtos finais que as usam.
          </li>
          <li>
            <strong>Precificação</strong> — o preço sugerido de cada produto, e o que sobra.
          </li>
          <li>
            <strong>Produção e compras</strong> — no dia a dia: planear, comprar, receber,
            produzir.
          </li>
          <li>
            <strong>Vendas</strong> e <strong>Despesas fixas</strong> — no fim de cada mês.
          </li>
        </Passos>
        <p>
          Os menus da barra de cima seguem esta mesma ordem: <em>Cadastros</em> (passos 2 a
          5), <em>Produção</em> (passo 6) e <em>Resultados</em> (passo 7).
        </p>
      </>
    ),
  },
  {
    id: 'configuracoes',
    titulo: 'Configurações',
    resumo: 'As taxas que decidem todos os preços sugeridos.',
    href: '/configuracoes',
    conteudo: (
      <>
        <p>Está no menu da engrenagem ⚙, no canto superior direito.</p>
        <Passos>
          <li>
            Em <strong>Negócio e moeda</strong>, confirme o nome e a moeda.
          </li>
          <li>
            <strong>IVA / imposto (%)</strong> — em Portugal, restauração é 13% na comida e
            23% nas bebidas. A app não escolhe por si: confirme o seu caso.
          </li>
          <li>
            <strong>O preço de menu…</strong> — se já inclui o IVA (o normal num balcão) ou
            se o IVA é acrescentado na conta.
          </li>
          <li>
            <strong>Custos fixos (%)</strong> — a fatia da receita que vai para renda,
            salários, luz. Se não sabe, preencha as Despesas fixas e use o valor calculado
            de lá.
          </li>
          <li>
            <strong>Taxa média de cartão (%)</strong>, <strong>Lucro líquido alvo (%)</strong>{' '}
            e <strong>CMV alvo (%)</strong>.
          </li>
          <li>
            Em <strong>Canais de venda</strong>, as comissões das plataformas de entrega,
            se usar.
          </li>
        </Passos>
        <Nota>
          Com os custos fixos a 0%, todos os preços sugeridos saem baixos demais. É o
          primeiro número a acertar.
        </Nota>
      </>
    ),
  },
  {
    id: 'fornecedores',
    titulo: 'Fornecedores',
    resumo: 'As lojas onde compra, para a lista sair dividida por loja.',
    href: '/fornecedores',
    conteudo: (
      <Passos>
        <li>
          Em <strong>Cadastros → Fornecedores</strong>, crie cada loja ou armazém onde
          compra.
        </li>
        <li>Morada e telefone são opcionais, mas ajudam na volta das compras.</li>
      </Passos>
    ),
  },
  {
    id: 'insumos',
    titulo: 'Insumos e embalagens',
    resumo: 'Tudo o que compra, com o preço e a embalagem.',
    href: '/insumos',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Cadastros → Insumos</strong>, carregue em adicionar e escreva o nome.
          </li>
          <li>
            <strong>Tamanho da embalagem</strong> e <strong>Preço pago</strong> — o pacote
            como o compra. Um saco de 5 kg a 4,20 € escreve-se 5 e 4,20.
          </li>
          <li>
            <strong>Fator de correção</strong> ou <strong>Perda (%)</strong> — se o insumo
            perde peso a limpar (fruta, carne). Se não perde, deixe como está.
          </li>
          <li>
            <strong>Alergénios</strong> — marque os que tem e depois{' '}
            <strong>&quot;já verifiquei este insumo&quot;</strong>, mesmo que não tenha
            nenhum. Sem essa caixa, as fichas avisam que há insumos por verificar.
          </li>
          <li>
            <strong>Avisar abaixo de</strong> — opcional: a quantidade em que já quer ir
            comprar. O insumo passa a aparecer como <em>a acabar</em> no Estoque e no
            Painel.
          </li>
        </Passos>
        <Nota>
          <strong>Quantidades sempre em kg ou un, nunca em gramas.</strong> Uma lata de 200 g
          escreve-se 0,2; 15 g de fermento escrevem-se 0,015. Líquidos também vão a peso
          (não há litros): ponha a embalagem na balança uma vez.
        </Nota>
        <p>
          <strong>O mesmo insumo em várias lojas</strong> é um insumo só com vários preços,
          não vários insumos. Ao editar, acrescente o preço de outro fornecedor. Exatamente
          um fica <strong>em uso</strong>: é esse que conta no custo das fichas. Trocar é
          sempre um clique seu — a app não troca sozinha.
        </p>
      </>
    ),
  },
  {
    id: 'fichas',
    titulo: 'Fichas técnicas',
    resumo: 'As receitas: o que leva cada produto e quanto custa.',
    href: '/fichas',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Cadastros → Fichas técnicas</strong>, carregue em{' '}
            <strong>Nova ficha</strong>.
          </li>
          <li>
            Escolha se é uma <strong>preparação base</strong> (recheio, massa, calda — entra
            noutras fichas) ou um <strong>produto final</strong> (o que se vende).
          </li>
          <li>
            <strong>Rende</strong> — quanto sai da receita: um bolo, 1,2 kg de recheio, 30
            brigadeiros.
          </li>
          <li>
            Em <strong>Composição</strong>, use <strong>Adicionar item</strong> para cada
            insumo ou preparação base, com a quantidade.
          </li>
          <li>
            Nos produtos finais, acrescente a <strong>embalagem</strong> (caixa, forminha),
            que também é custo.
          </li>
        </Passos>
        <Nota>
          Faça primeiro as preparações base. Um bolo que usa o &quot;Recheio Brigadeiro&quot;
          vai buscar o custo e os alergénios do recheio sozinho — e, se o preço do leite
          condensado mudar, o custo do bolo muda também.
        </Nota>
        <p>
          Os custos começam escondidos; o botão <strong>Ver custos</strong> mostra-os. Para a
          cozinha, <strong>Imprimir</strong> faz uma folha com o que leva, quanto leva e os
          alergénios — sem custos, de propósito.
        </p>
      </>
    ),
  },
  {
    id: 'precificacao',
    titulo: 'Precificação',
    resumo: 'O preço sugerido de cada produto e o que ele deixa.',
    href: '/precificacao',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Cadastros → Precificação</strong>, abra o produto.
          </li>
          <li>
            A app calcula o preço que paga o custo do produto, os custos fixos, o cartão e o
            lucro alvo das Configurações — já com o IVA.
          </li>
          <li>
            Veja <strong>Como calcular o preço</strong>: pode usar o sugerido, escolher um
            arredondamento, ou escrever um <strong>preço manual</strong>.
          </li>
          <li>
            Em <strong>As contas</strong> vê o CMV, a margem de contribuição, o lucro por
            unidade e o <strong>break-even</strong> (quantas unidades pagam os fixos).
          </li>
          <li>
            Em <strong>Nos outros canais</strong>, o preço para as plataformas de entrega
            que deixa o mesmo lucro em euros que o balcão.
          </li>
        </Passos>
        <Nota>
          <strong>CMV</strong> é a fatia do preço que vai para o produto. Abaixo de 30% é bom;
          acima de 40% acende a luz vermelha. Se um produto está caro de fazer, veja na
          composição que insumo come a maior fatia.
        </Nota>
      </>
    ),
  },
  {
    id: 'producao',
    titulo: 'Produção e compras',
    resumo: 'Planear o que fazer, e a lista do que comprar.',
    href: '/producao',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Produção → Produção e compras</strong>, crie uma nova ordem e junte os
            produtos com as quantidades (por exemplo, 10 bolos, 100 brigadeiros).
          </li>
          <li>
            A app desce por todas as fichas e mostra o que falta comprar,{' '}
            <strong>dividido por loja</strong> e em embalagens inteiras. No telemóvel, vá
            riscando no supermercado.
          </li>
          <li>
            Ao chegar, <strong>Recebi esta compra</strong> — põe as embalagens no estoque.
          </li>
          <li>
            Depois de fazer, <strong>Produzi</strong> — tira do estoque o que as fichas
            consomem.
          </li>
        </Passos>
        <Nota>
          Os passos 3 e 4 são os que se esquecem, e são os que fazem o Estoque e o CMV real
          funcionar. Se é para oferecer (evento, prova), marque{' '}
          <strong>&quot;É para oferecer&quot;</strong>: o custo sai do estoque mas não entra
          no CMV.
        </Nota>
        <p>
          <strong>A comprar hoje</strong> e <strong>Custo da produção</strong> são números
          diferentes: o primeiro é o que sai da caixa (pacotes inteiros), o segundo o que a
          produção gasta de facto. A diferença fica em despensa.
        </p>
      </>
    ),
  },
  {
    id: 'estoque',
    titulo: 'Estoque',
    resumo: 'O que há em casa, e porque é que diz o que diz.',
    href: '/estoque',
    conteudo: (
      <Passos>
        <li>
          O saldo não se escreve: é a soma das compras recebidas menos a produção
          registada. Cada linha tem o histórico dos movimentos.
        </li>
        <li>
          <strong>Contagem</strong> — contou o armazém e não bate? Use o botão de contagem
          no insumo. A app regista a diferença, para se ver quanto se perdeu.
        </li>
        <li>
          <strong>Quebra</strong> — caiu, estragou, passou a validade: registe-a aqui.
        </li>
        <li>
          Se aparecer <em>&quot;sem preço registado&quot;</em>, carregue em{' '}
          <strong>Usar o preço atual</strong> ao lado de cada insumo. É só uma vez, no
          arranque.
        </li>
        <li>
          Saldo negativo quer dizer que registou a produção antes da compra: receba a
          compra, ou faça uma contagem.
        </li>
      </Passos>
    ),
  },
  {
    id: 'vendas',
    titulo: 'Vendas e CMV real',
    resumo: 'No fim do mês: o que vendeu, e se a ficha bate com a realidade.',
    href: '/vendas',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Resultados → Vendas e CMV real</strong>, escolha o mês.
          </li>
          <li>
            Escreva quantas unidades de cada produto saíram. A receita é opcional: em branco,
            usa o preço calculado.
          </li>
          <li>
            Leia os quatro números do topo: <strong>receita líquida</strong>,{' '}
            <strong>CMV teórico</strong> (o que as fichas dizem), <strong>CMV real</strong>{' '}
            (o que saiu do armazém) e o <strong>desvio</strong> entre os dois.
          </li>
        </Passos>
        <Nota>
          <strong>Desvio positivo</strong>: gastou mais do que as fichas previam — porção
          maior, desperdício por registar, ou ficha desatualizada. <strong>Desvio
          negativo</strong>: quase sempre falta registar uma produção.
        </Nota>
        <p>
          Mais abaixo, a <strong>engenharia de cardápio</strong> cruza o que vende com o que
          dá margem: <em>Estrela</em> (proteger), <em>Cavalo</em> (baixar o custo),{' '}
          <em>Quebra-cabeça</em> (dar destaque) e <em>Abacaxi</em> (pensar em tirar).
        </p>
        <Nota>
          Deixar a quantidade em branco apaga o lançamento desse produto. Não é o mesmo que
          escrever 0: &quot;não vendi&quot; e &quot;não lancei&quot; são coisas diferentes.
        </Nota>
      </>
    ),
  },
  {
    id: 'despesas',
    titulo: 'Despesas fixas',
    resumo: 'Renda, salários, luz: de onde sai a percentagem de custos fixos.',
    href: '/despesas',
    conteudo: (
      <Passos>
        <li>
          Em <strong>Resultados → Despesas fixas</strong>, junte cada despesa com o valor e{' '}
          <strong>com que frequência</strong> se paga (por semana, mês, trimestre ou ano).
        </li>
        <li>
          Escreva a <strong>faturação mensal esperada, com IVA</strong>.
        </li>
        <li>
          A app calcula a percentagem de custos fixos (sobre a receita sem IVA). Nada muda
          sozinho: carregue no botão para a passar às Configurações quando concordar.
        </li>
      </Passos>
    ),
  },
  {
    id: 'painel',
    titulo: 'Painel',
    resumo: 'O resumo: onde está o lucro e onde está o risco.',
    href: '/',
    conteudo: (
      <p>
        A primeira página. Mostra quantos produtos têm preço, o CMV médio, os produtos com
        mais margem e os que estão em risco (prejuízo ou CMV acima de 40%), e avisa de
        insumos a acabar e preços de fornecedor que mudaram. Carregue num produto para ir
        direto à precificação dele.
      </p>
    ),
  },
  {
    id: 'app',
    titulo: 'A app: tema, entrar e sair',
    resumo: 'Tema claro ou escuro, palavra-passe, telemóvel.',
    conteudo: (
      <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
        <li>
          <strong>Tema</strong> — no menu ⚙ (no telemóvel, em <em>Mais</em>): automático
          (segue o aparelho), claro ou escuro. Fica guardado em cada aparelho.
        </li>
        <li>
          <strong>Palavra-passe</strong> — é uma só, partilhada por quem trabalha na casa.
          Fica ligado 30 dias em cada aparelho. Trocá-la (na Vercel, variável{' '}
          <code>APP_PASSWORD</code>) faz sair toda a gente.
        </li>
        <li>
          <strong>Sair</strong> — no menu ⚙ (ou em <em>Mais</em>, no telemóvel).
        </li>
        <li>
          <strong>No telemóvel</strong>, os cinco atalhos mais usados ficam na barra de
          baixo; o resto está em <em>Mais</em>, no canto de cima.
        </li>
      </ul>
    ),
  },
];

export default function AjudaPage() {
  const v = versao();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AbrirSecaoDoLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajuda</h1>
        <p className="text-sm text-muted-foreground">
          O que é cada parte da app e como fazer as coisas, passo a passo.
        </p>
        <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <span>
            Versão <strong className="text-foreground">{v.numero}</strong>
          </span>
          {v.data ? <span>· atualizada em {v.data}</span> : null}
          <span>
            · {v.commit ? <code title="Código do que está publicado">{v.commit}</code> : 'desenvolvimento'}
          </span>
        </p>
      </header>

      <nav aria-label="Nesta página" className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nesta página
        </p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {SECOES.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-3">
        {SECOES.map((s) => (
          <details
            key={s.id}
            id={s.id}
            // A barra de cima e fixa: sem margem, o titulo ficava por baixo dela.
            className="group scroll-mt-20 rounded-lg border bg-card"
            open={s.id === 'primeiros-passos'}
          >
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <div className="flex-1">
                <h2 className="font-titulo text-xl font-semibold leading-tight">{s.titulo}</h2>
                <p className="text-sm text-muted-foreground">{s.resumo}</p>
              </div>
              <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t px-4 pb-4 pt-3 text-sm leading-relaxed">
              {s.conteudo}
              {s.href ? (
                <p>
                  <Link href={s.href} className="font-medium text-primary hover:underline">
                    Abrir {s.titulo} →
                  </Link>
                </p>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Mais pormenor sobre Vendas, CMV real e engenharia de cardápio está no ficheiro{' '}
        <code>GUIA.md</code> do projeto.
      </p>
    </div>
  );
}
