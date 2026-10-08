/**
 * Ajuda: a versao publicada e um passo a passo de cada parte da app.
 *
 * Escrita para quem usa a app na casa, nao para quem a programa — o
 * `README.md` e para isso. O `GUIA.md` aprofunda Resultados do mes e CMV real; aqui fica
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
            <strong>Encomendas</strong> e <strong>Produção e compras</strong> — no dia a
            dia: anotar o pedido, planear, comprar, receber, produzir, entregar.
          </li>
          <li>
            <strong>Resultados do mês</strong> e <strong>Despesas fixas</strong> — no fim de
            cada mês.
          </li>
        </Passos>
        <p>
          Os menus da barra de cima seguem esta mesma ordem: <em>Cadastros</em> (passos 2 a
          5), <em>Produção</em> (passo 6) e <em>Resultados</em> (passo 7). As{' '}
          <em>Encomendas</em> estão em <em>Clientes</em>, as <em>Compras</em> em{' '}
          <em>Cadastros</em>, e o <em>Painel</em> abre-se carregando no logótipo. No telemóvel,
          Encomendas, Compras, Fichas, Produção e Calendário estão na barra de baixo.
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
        <p>
          <strong>Casas decimais</strong> — automático (até 4: 0,395 kg) ou 2 casas (0,40
          kg). Muda só o que se lê nas quantidades e no custo por kg; as contas continuam
          com a precisão toda. Quantidades muito pequenas aparecem como &quot;&lt; 0,01
          kg&quot;.
        </p>
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
            <strong>Alergénios</strong> — a secção vem fechada (toque em{' '}
            <em>Alergénios</em> para abrir; o título diz o que já está marcado). Marque os
            que tem e depois <strong>&quot;já verifiquei este insumo&quot;</strong>, mesmo
            que não tenha nenhum. Sem essa caixa, as fichas avisam que há insumos por
            verificar. Na ficha técnica, o cartão de alergénios também vem fechado, com o
            resumo no título; a ficha impressa mostra sempre a lista toda.
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
        <p>
          <strong>Foto:</strong> na ficha, <em>Adicionar foto</em> abre a câmara ou a galeria
          do telemóvel. A foto é reduzida antes de enviar (fica leve) e aparece nas listas e
          na ficha impressa. Só a vê quem entrou com a palavra-passe.
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
            A app desce por todas as fichas e mostra o que falta comprar, em embalagens
            inteiras, numa lista só. No telemóvel, toque no <strong>círculo</strong> para
            riscar; toque na linha para ver a loja, quanto precisa e onde fica mais barato.
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
        <p>
          <strong>Estoque mínimo:</strong> se um insumo tem mínimo (definido em Insumos), a
          lista compra também o que falta para ficar nele — a linha diz{' '}
          <em>&quot;inclui … para manter o mínimo&quot;</em>. Os insumos no mínimo que esta
          produção não usa aparecem em <strong>Também a acabar</strong>, só como lembrete:
          não entram na compra.
        </p>
      </>
    ),
  },
  {
    id: 'encomendas',
    titulo: 'Encomendas',
    resumo: 'O que os clientes pediram, para quando, e quanto deu de lucro.',
    href: '/encomendas',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Encomendas → Nova encomenda</strong>, escreva o nome do cliente. Se já
            encomendou antes, aparece na lista; com o mesmo telefone, a app reconhece-o.
          </li>
          <li>
            Pergunte se <strong>aceita ser contactado depois</strong> (para saber se gostou,
            avisar de novidades) e marque só se disser que sim. Sem isso, o nome e o telefone
            servem só para esta encomenda — é o que pede o RGPD.
          </li>
          <li>
            Escolha os produtos e as quantidades. O preço vem da tabela (o da Precificação);
            se combinou outro, escreva-o — a app mostra o desconto.
          </li>
          <li>
            Dia e hora, se o cliente levanta ou se entregam (com a morada), e notas como
            &quot;escrever Parabéns Ana&quot;.
          </li>
          <li>
            Na lista, marque as encomendas pedidas e carregue em{' '}
            <strong>Produzir as marcadas</strong>: cria uma ordem de produção com tudo somado,
            e daí segue o caminho de sempre — lista de compras, receber, produzir.
          </li>
          <li>
            Quando estiver feita, <strong>Está pronta</strong>; quando sair,{' '}
            <strong>Entregue</strong>. Registe o pagamento e a forma.
          </li>
        </Passos>
        <Nota>
          Só as encomendas <strong>entregues</strong> contam nos Resultados do mês, no mês em que foram
          entregues. Uma que o cliente desmarcou fica como <em>Cancelada</em> — não a apague,
          para se ver depois quantas se perderam.
        </Nota>
        <p>
          <strong>Lucro da encomenda:</strong> o preço combinado menos IVA, insumos,
          embalagens, custos fixos e as taxas. O custo dos insumos é o do dia em que o produto
          entrou na encomenda — se a farinha subir depois, o lucro dessa encomenda não muda. A{' '}
          <strong>taxa de cartão</strong> só conta se pagar com cartão; enquanto não se sabe
          como paga, conta-se com ela.
        </p>
      </>
    ),
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    resumo: 'Quem encomenda, do que gosta, quem trouxe quem, e onde está nas redes.',
    href: '/clientes',
    conteudo: (
      <>
        <p>
          Os clientes nascem sozinhos ao criar uma encomenda. Em{' '}
          <strong>Clientes → Clientes</strong> vê a lista, com o que cada um gastou e a nota
          média que deu.
        </p>
        <Passos>
          <li>
            Abra um cliente. Em <strong>Contacto</strong> (lápis): telefone,{' '}
            <strong>aniversário</strong> (dia/mês, sem o ano), <strong>como nos
            conheceu</strong> e <strong>quem indicou</strong>.
          </li>
          <li>
            Também em <strong>Contacto</strong>: <strong>Instagram, Facebook e TikTok</strong>.
            Escreva o @ ou cole o link do perfil, como vier — a app guarda só o nome. Na ficha
            do cliente e na encomenda aparecem como botões que abrem o perfil; a pesquisa da
            lista encontra pelo @. A cozinha não os vê.
          </li>
          <li>
            Em <strong>Gostos</strong>: do que gosta, do que não gosta, e notas (&quot;encomenda
            sempre para o aniversário do filho&quot;).
          </li>
          <li>
            <strong>Nova encomenda</strong> no topo da ficha já abre com o cliente escolhido.
          </li>
        </Passos>
        <Nota>
          <strong>Alergias e doenças não vão para a ficha</strong> — são dados de saúde, com
          regras mais apertadas no RGPD. Escreva-as nas notas de cada encomenda, que é onde a
          cozinha as lê.
        </Nota>
        <p>
          Os selos da lista: <em>voltou</em> (encomendou mais de uma vez), <em>sem
          encomendar há…</em> (mais de 60 dias) e <em>anos em…</em> (aniversário nos próximos
          7 dias). Se um cliente pedir para ser esquecido, <strong>Apagar cliente</strong> no
          fim da ficha apaga os dados dele; as encomendas ficam, sem nome.
        </p>
      </>
    ),
  },
  {
    id: 'pos-venda',
    titulo: 'Pós-venda e lembretes',
    resumo: 'Perguntar se gostou, aniversários, e o que houver a fazer.',
    href: '/pos-venda',
    conteudo: (
      <>
        <p>
          Quando uma encomenda é marcada como <strong>Entregue</strong>, a app agenda o
          pós-venda para 2 dias depois (muda-se em Configurações) — só para clientes que
          aceitaram ser contactados.
        </p>
        <Passos>
          <li>
            Em <strong>Clientes → Pós-venda</strong>, cada cliente a contactar tem um botão{' '}
            <strong>WhatsApp</strong> que abre a conversa com a mensagem já escrita, e um{' '}
            <strong>Ligar</strong>.
          </li>
          <li>
            Quando ele responder, <strong>Registar opinião</strong>: como falou, a nota de 1 a
            5, a nota de cada produto (opcional) e o que disse.
          </li>
          <li>
            Se não atender, <strong>Não atendeu</strong> — volta amanhã. Se não for para
            contactar, <strong>Não contactar</strong>.
          </li>
        </Passos>
        <p>
          A nota de cada produto aparece na <strong>Precificação</strong> e no{' '}
          <strong>Relatório</strong>. Um produto com boa margem e nota baixa é um aviso.
        </p>
        <p>
          <strong>Lembretes</strong>: escreva o que há a fazer e o dia (&quot;ligar ao Rui
          sobre o bolo de casamento&quot;), ligado ou não a um cliente. Toque no círculo
          quando estiver feito. Os <strong>aniversários</strong> da semana aparecem sozinhos.
          O Painel avisa quando há alguma coisa para hoje.
        </p>
        <Nota>
          A mensagem do WhatsApp muda-se em <strong>Configurações → Pós-venda</strong>.{' '}
          {'{nome}'}, {'{loja}'}, {'{produtos}'} e {'{dia}'} trocam-se sozinhos pelos dados
          da encomenda.
        </Nota>
      </>
    ),
  },
  {
    id: 'relatorio',
    titulo: 'Relatório de vendas',
    resumo: 'Faturação, lucro, produtos, clientes e origens num período.',
    href: '/relatorio',
    conteudo: (
      <>
        <p>
          Em <strong>Resultados → Relatório de vendas</strong>, escolha o período (por
          omissão, os últimos 6 meses). Tudo sai das encomendas entregues.
        </p>
        <Passos>
          <li>
            No topo: encomendas, faturação, lucro e <strong>ticket médio</strong> (quanto
            gasta cada encomenda, em média).
          </li>
          <li>
            <strong>Faturação por mês</strong>, em barras e em tabela.
          </li>
          <li>
            <strong>Por produto</strong>: unidades, faturação, CMV e a nota dos clientes.
          </li>
          <li>
            <strong>Melhores clientes</strong>, <strong>a esfriar</strong> (bons clientes
            que não encomendam há mais de 60 dias — bons para um contacto),{' '}
            <strong>de onde vêm</strong> e <strong>quem mais indica</strong>.
          </li>
        </Passos>
        <p>O botão Excel descarrega todas as encomendas, uma linha por produto.</p>
      </>
    ),
  },
  {
    id: 'receitas',
    titulo: 'Livro de receitas',
    resumo: 'As receitas da casa, de onde vieram, e cada alteração da cozinha.',
    href: '/receitas',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Receitas → Nova receita</strong>, escreva a receita tal como veio da fonte
            (da avó, do curso, do livro), com <strong>de onde veio</strong>. Esta fica como a{' '}
            <strong>versão original</strong> e nunca mais muda.
          </li>
          <li>
            Ou <strong>Importar</strong>: escolha um PDF (ou cole o texto). A app separa o
            título, os ingredientes e o modo de preparo; confira ao lado do texto original e
            guarde. O PDF fica guardado junto da receita.
          </li>
          <li>
            Para mudar uma receita, <strong>Alterar receita</strong>: muda o que quiser, diz
            porquê, e fica como <strong>versão 2</strong> (3, 4…), com o nome de quem a fez. A
            anterior não se perde.
          </li>
          <li>
            <strong>Comparar com a original</strong> mostra o que mudou: riscado a vermelho o
            que saiu, a verde o que entrou, e numa linha alterada só as palavras que mudaram
            (&quot;<del>200</del> 150 g de açúcar&quot;).
          </li>
          <li>
            Em <strong>Livros</strong>, junte receitas num livro (&quot;Receitas da família&quot;),
            por secções, e <strong>Imprimir / PDF</strong>: capa, índice e uma receita por
            folha. Pode imprimir com as versões da cozinha ou com as originais.
          </li>
        </Passos>
        <Nota>
          Na lista, a busca encontra pelo nome, por um ingrediente, pela origem ou pela
          etiqueta, sem ligar a acentos. Uma receita que já não se usa <strong>arquiva-se</strong>{' '}
          (sai das listas e dos livros, mas não se perde); só o dono a apaga de vez.
        </Nota>
        <p>
          <strong>Ficha técnica:</strong> o dono pode ligar a receita à ficha com os custos.
          Quando a cozinha altera a receita depois da última alteração da ficha, a app avisa para
          conferir as quantidades — a ficha não muda sozinha.
        </p>
      </>
    ),
  },
  {
    id: 'utilizadores',
    titulo: 'Contas e permissões',
    resumo: 'Quem entra, e o que cada um pode fazer.',
    href: '/utilizadores',
    conteudo: (
      <>
        <p>Cada pessoa entra com a sua conta. Há três perfis:</p>
        <Passos>
          <li>
            <strong>Dono</strong> — tudo: custos, encomendas, clientes, configurações e contas.
          </li>
          <li>
            <strong>Cozinha</strong> — o livro de receitas: ver, criar, alterar (cada alteração é
            uma versão com o nome dela) e arquivar. Vê também as <strong>encomendas</strong>{' '}
            (o que fazer, quantas e para quando) e as <strong>ordens de produção</strong>: avança
            a encomenda no pipeline e regista o que produziu. Não vê preços, custos, pagamentos nem
            o telefone do cliente; criar, cancelar ou reabrir uma encomenda é com o dono.
          </li>
          <li>
            <strong>Leitura</strong> — o livro de receitas, só para ler e imprimir.
          </li>
        </Passos>
        <p>
          Em <strong>⚙ → Utilizadores</strong>, o dono cria a conta com uma palavra-passe
          provisória e diz-lha; a pessoa tem de a trocar no primeiro acesso, e a partir daí só
          ela a sabe. Se a esquecer, o dono <strong>repõe</strong> uma provisória nova.
        </p>
        <Nota>
          Cinco tentativas erradas seguidas bloqueiam a conta 15 minutos (e muitas falhas da mesma
          ligação, em qualquer conta, bloqueiam a ligação). Desativar uma conta ou mudar-lhe o
          perfil tem efeito logo. Em <strong>⚙ → A minha conta</strong> troca-se a palavra-passe
          e sai-se dos outros aparelhos.
        </Nota>
        <p>
          <strong>Sessão:</strong> 12 horas, ou 30 dias se marcar{' '}
          <em>&quot;Manter a sessão neste aparelho&quot;</em> ao entrar — só no seu telemóvel ou
          computador, nunca num aparelho partilhado da cozinha.
        </p>
        <p>
          <strong>⚙ → Registo de alterações</strong> (só o dono): quem entrou, quem mudou
          configurações, preços, estoque, encomendas, contas, e o que se apagou — com data e hora.
          Nada lá se altera nem se apaga.
        </p>
      </>
    ),
  },
  {
    id: 'compras',
    titulo: 'Compras (a aba do comprador)',
    resumo: 'Listas para o supermercado, preço achado e entrada no estoque.',
    href: '/compras',
    conteudo: (
      <>
        <p>
          Listas de compras próprias, que não dependem do que se vai produzir. É a aba que
          o comprador abre no telemóvel (na barra de baixo, <em>Compras</em>).
        </p>
        <Passos>
          <li>
            Em <strong>Compras</strong>, crie uma lista (por exemplo, &quot;Makro
            sábado&quot;).
          </li>
          <li>
            Em <strong>+ Juntar</strong>: <em>Procurar insumo</em> (nos insumos
            cadastrados), <em>Abaixo do mínimo</em>, ou <em>De uma produção</em>.
          </li>
          <li>
            No supermercado, toque no <strong>círculo</strong> para riscar — o item desce
            para <em>No carrinho</em>. Toque no resto da linha para ver a loja, o preço e
            os botões <em>Editar</em> (preço, loja ou embalagem diferentes),{' '}
            <em>Não havia</em> e <em>Remover</em>.
          </li>
          <li>
            <strong>Achei mais barato:</strong> em <em>+ Juntar → Procurar insumo</em>, escolha o insumo
            e escreva o preço que está a ver. A app mostra o estoque, o mínimo, para quantos
            dias chega e quanto mais barato (ou caro) é que o preço em uso. Depois{' '}
            <em>Juntar à lista</em> ou <em>Comprei — pôr no carrinho</em>.
          </li>
          <li>
            No fim, <strong>Fechar compra</strong>: o que foi riscado entra no estoque ao
            preço pago, e o preço fica registado para a loja.
          </li>
        </Passos>
        <Nota>
          Riscar não mexe no estoque — só fechar. Um preço mais barato noutra loja{' '}
          <strong>não</strong> muda o custo das fichas, a não ser que se marque{' '}
          <em>&quot;usar este preço daqui para a frente&quot;</em>. Se a loja do preço em
          uso mudou o preço, esse passa a valer, porque é a realidade.
        </Nota>
        <p>
          <strong>Sem repetidos:</strong> cada insumo tem uma linha só. Juntar o que já lá
          está soma as embalagens; <em>achei mais barato</em> corrige essa linha (o painel
          avisa &quot;já está na lista&quot;); a mesma produção só se junta uma vez. Só o
          que já está no carrinho fica à parte — precisar de mais é uma linha nova.
        </p>
        <p>
          Uma lista que veio de uma produção dá entrada por aqui <em>ou</em> pelo{' '}
          <em>Recebi esta compra</em> da ordem — não pelos dois, senão o estoque entra a
          dobrar.
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
    titulo: 'Resultados do mês',
    resumo: 'No fim do mês: o que as encomendas deram, e se a ficha bate com a realidade.',
    href: '/vendas',
    conteudo: (
      <>
        <p>
          Aqui não se escreve nada: tudo sai das <strong>encomendas entregues</strong> no mês,
          com o preço combinado.
        </p>
        <Passos>
          <li>
            Em <strong>Resultados → Resultados do mês</strong>, escolha o mês.
          </li>
          <li>
            No topo: quantas encomendas foram entregues, a <strong>faturação</strong>, o{' '}
            <strong>lucro</strong> somado (depois de insumos, custos fixos e taxas) e os{' '}
            <strong>descontos</strong> dados face à tabela.
          </li>
          <li>
            Em <strong>CMV teórico e real</strong>: o que as fichas dizem que devia sair do
            armazém, o que saiu de facto, e o <strong>desvio</strong> entre os dois. Precisa
            das produções registadas em Produção.
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
          A <strong>faturação mensal</strong> sai sozinha das encomendas entregues: a média
          dos últimos três meses completos. Se quiser outro valor (para simular, ou antes de
          haver entregas), escreva-o à mão.
        </li>
        <li>
          A app calcula a percentagem de custos fixos (sobre a receita sem IVA). Nada muda
          sozinho: carregue no botão para a passar às Configurações quando concordar.
        </li>
      </Passos>
    ),
  },
  {
    id: 'calendario',
    titulo: 'Calendário de produção',
    resumo: 'Feriados, datas que vendem e os seus eventos, com o que produzir em cada um.',
    href: '/calendario',
    conteudo: (
      <>
        <Passos>
          <li>
            Em <strong>Resultados → Calendário de produção</strong>. O calendário já traz os
            feriados de Portugal e as datas que vendem doces em Portugal (<strong>PT</strong>) e
            no Brasil (<strong>BR</strong>) — que nem sempre calham no mesmo dia: o Dia da
            Criança é a 1 de junho em Portugal e a 12 de outubro no Brasil; o Dia da Mãe é no
            1.º domingo de maio em Portugal e no 2.º no Brasil. A Páscoa e o que dela depende
            (Carnaval, Sexta-feira Santa, Corpo de Deus) calculam-se para cada ano.
          </li>
          <li>
            <strong>Novo evento</strong> — uma festa, uma feira, uma encomenda grande, uma
            tendência que quer aproveitar, ou a folga de alguém da equipa. Marque{' '}
            <em>Repete todos os anos</em> para o aniversário da loja e afins.
          </li>
          <li>
            <strong>Plano de produção</strong> — em cada data, escolha produtos e diga{' '}
            <em>produzir mais</em> (e quantos), <em>produzir menos</em> ou{' '}
            <em>não produzir</em>. Numa data que se repete, o plano vale para todos os anos.
          </li>
          <li>
            <strong>Como correu</strong> — depois do dia, escreva o que vendeu bem e o que
            sobrou. No ano seguinte aparece na mesma data, ao lado do que se vendeu nesse dia no
            ano anterior (tirado das encomendas).
          </li>
        </Passos>
        <Nota>
          Em <strong>Encomendas</strong> e em <strong>Produção</strong>, uma faixa mostra o que
          vem nos próximos 10 dias, com o plano de cada data. A cozinha vê o calendário e os
          planos, mas só o dono os cria e altera.
        </Nota>
      </>
    ),
  },
  {
    id: 'painel',
    titulo: 'Painel',
    resumo: 'O resumo: onde está o lucro e onde está o risco.',
    href: '/',
    conteudo: (
      <p>
        A primeira página — abre-se carregando no logótipo. Mostra quantos produtos têm preço, o CMV médio, os produtos com
        mais margem e os que estão em risco (prejuízo ou CMV acima de 40%), e avisa de
        insumos a acabar e preços de fornecedor que mudaram. Carregue num produto para ir
        direto à precificação dele.
      </p>
    ),
  },
  {
    id: 'exportar',
    titulo: 'Cópia de segurança e exportar',
    resumo: 'Fazer e restaurar uma cópia de tudo; listas para o Excel.',
    href: '/exportar',
    conteudo: (
      <>
        <Passos>
          <li>
            No menu ⚙ (no telemóvel, em <em>Mais</em>), abra{' '}
            <strong>Cópia de segurança</strong>.
          </li>
          <li>
            <strong>Fazer cópia agora</strong> — todas as tabelas num só ficheiro. Guarde-o
            fora do computador (OneDrive, pen).
          </li>
          <li>
            <strong>Restaurar uma cópia</strong> — escolha o ficheiro. A app mostra primeiro o
            que ia mudar (quantas encomendas, fichas, clientes… ficam) e avisa do que se perde,
            sem mexer em nada. Só depois de escrever <strong>RESTAURAR</strong> a base volta a
            ficar exatamente como no dia da cópia.
          </li>
          <li>
            <strong>Listas para o Excel</strong> — insumos, fornecedores, preços por
            fornecedor, fichas, preços sugeridos, movimentos de estoque, encomendas e despesas.
            Cada uma descarrega um ficheiro CSV que abre direto no Excel, com vírgula decimal
            e acentos.
          </li>
        </Passos>
        <Nota>
          Restaurar <strong>substitui</strong> tudo — o que foi feito depois da cópia perde-se.
          Por isso, antes de restaurar, a app guarda sozinha uma cópia do que havia; aparece em{' '}
          <em>Cópias guardadas pela app</em> e, se o restauro foi engano, restaura-se essa. As
          contas, as palavras-passe e o registo de alterações nunca mudam com um restauro. As
          fotos e os PDFs não vão no ficheiro (só o sítio onde estão); a cópia automática do
          computador guarda-os à parte.
        </Nota>
        <Nota>
          Além do botão, o computador onde a cópia automática foi configurada grava uma cópia
          completa sozinho, uma vez por semana. Se estiver desligado no dia, grava assim que
          for ligado.
        </Nota>
      </>
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
        Mais pormenor sobre os Resultados do mês, CMV real e engenharia de cardápio está no ficheiro{' '}
        <code>GUIA.md</code> do projeto.
      </p>
    </div>
  );
}
