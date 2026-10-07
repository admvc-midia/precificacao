# Guia rápido — Resultados do mês e CMV real

Escrito para: o dono da lanchonete que vai usar a app, não para quem programa.

O `README.md` explica como a app foi construída. Este explica **como usá-la** na parte
que mais dá trabalho de entender: saber se o custo que você calcula é o custo que você
tem de facto.

---

## A pergunta que isto responde

A app diz que o seu Hambúrguer da Casa custa **1,24 €** de insumos. Esse número sai da
ficha técnica: 160 g de carne, um pão, 40 g de queijo, e por aí.

Mas a ficha é uma promessa. No fim do mês, a pergunta que interessa é outra:

> **Saiu do armazém aquilo que a ficha dizia que ia sair?**

Se saiu mais, há dinheiro a escorrer por algum lado — e há três suspeitos, sempre os
mesmos:

- **Porção maior do que a ficha diz.** Alguém põe 180 g de carne em vez de 160 g.
- **Desperdício que ninguém registou.** Caiu, estragou, passou a validade.
- **Ficha desatualizada.** Mudou a receita e ninguém mudou a ficha.

A app não adivinha qual dos três é. Mas diz-lhe **quanto** e **quando**, que é o que
faz a diferença entre desconfiar e saber.

---

## O que é preciso lançar

Três coisas, e elas só funcionam juntas. Se faltar uma, a conta não fecha.

### 1. Receber as compras

Em **Produção**, abra a ordem e carregue em **"Recebi esta compra"**.

Isso põe no estoque as embalagens que a lista mandou comprar — as **inteiras**, não só o
que faltava. Se faltavam 1,6 kg de carne e o pacote é de 5 kg, entram 5 kg. Os 3,4 kg
que sobram ficam no armazém, como na vida real.

> Enquanto não fizer isto, o estoque não sabe que você comprou, e a coluna **"Falta"**
> da próxima lista de compras vai estar errada.

### 2. Registar a produção

Na mesma ordem, **"Produzi"**.

Isso tira do estoque tudo o que as fichas dizem que aquela produção consome, descendo
pelas sub-receitas — o ovo e o óleo dentro da maionese saem também. Sai a quantidade
**com fator de correção**: se a alcatra perde 20% na limpeza, saem do armazém 250 g para
cada 200 g que vão ao prato.

### 3. Entregar as encomendas

Em **Encomendas**, quando a encomenda sai, carregue em **"Entregue"**.

As vendas não se lançam à mão: são as encomendas entregues, com o preço combinado
(descontos incluídos), no mês em que foram entregues. Uma encomenda que fica esquecida
em *Pronta* não conta.

---

## Como ler o resultado

Em **Resultados → Resultados do mês**, o cartão *CMV teórico e real* tem três números
(a receita sem IVA está no topo da página):

| | O que é |
|---|---|
| **CMV teórico** | O que as fichas dizem que o vendido devia ter custado |
| **CMV real** | O que de facto saiu do armazém, mais as quebras |
| **Desvio** | A diferença entre os dois |

**CMV** é *Custo da Mercadoria Vendida*: a fatia da sua receita que foi para o produto.
Quanto menor, mais sobra para pagar renda, salários e o seu lucro. Numa lanchonete,
abaixo de 30% é bom; acima de 40% acende a luz vermelha.

### O desvio

- **Desvio positivo** — gastou mais do que a ficha previa. Vá pelos três suspeitos, por
  esta ordem: pese uma porção, confira se as quebras estão a ser registadas, releia a
  ficha do produto que mais vende.
- **Desvio negativo** — gastou menos. Quase sempre significa que **faltou registar uma
  produção**, não que a cozinha poupou.
- **Desvio perto de zero** — as suas fichas descrevem a realidade. É o objetivo.

Um desvio de 2 a 3 pontos percentuais de CMV já é dinheiro a sério: numa casa que fatura
10.000 € por mês, são 200 a 300 € que desapareceram.

---

## Amostras e divulgação

Se vai oferecer produto — num evento, na caixa de correio, para provar — crie a ordem de
produção com **"É para oferecer"** marcado.

Os insumos saem do estoque na mesma. A diferença é que esse custo **não entra no CMV**:
é custo de marketing, não custo do que foi vendido. A página Resultados do mês mostra-o à parte.

Se não marcar, uma campanha de amostras faz o CMV subir e você vai procurar desperdício
que não existe — foi produto que saiu de propósito, sem receita associada.

## O aviso do "preço não registado"

Na página **Estoque** pode aparecer: *"N insumos estão no estoque sem preço registado"*.

Isso acontece com o que você digitou à mão e nunca comprou pela app: ela sabe a
quantidade, mas não sabe o que aquilo custou. Enquanto for assim, **o gasto com esses
insumos não entra nas contas** e o seu CMV real aparece mais baixo do que é.

Carregue em **"Usar o preço atual"** ao lado de cada um. É preciso fazer isto uma vez
só, no arranque.

---

## Engenharia de cardápio

Mais abaixo em Resultados do mês, a matriz cruza **o que vende** com **o que dá margem**.
Cada ponto é um produto, e a posição diz tudo:

```
  margem ↑
        │  Quebra-cabeça    │    Estrela
        │  (reposicionar)   │    (proteger)
        ├───────────────────┼──────────────────
        │  Abacaxi          │    Cavalo
        │  (cortar)         │    (atacar o custo)
        └───────────────────┴─────→ vende mais
```

- **Estrela** — vende e dá margem. Não mexa no preço. Ponha em destaque no menu.
- **Cavalo de batalha** — vende muito, margem fraca. Não suba o preço: **ataque o custo**.
  Abra a precificação do produto e veja que insumo come a maior fatia.
- **Quebra-cabeça** — margem boa, vende pouco. Problema de posição no menu ou de nome,
  não de preço. Sugira-o.
- **Abacaxi** — não vende nem dá margem. Candidato a sair, a menos que esteja lá por
  outra razão (o refrigerante que acompanha, o prato da criança).

As linhas de corte são as médias da sua própria casa, não um padrão de fora.

---

## A ordem, resumida

```
1. Planeie a produção        →  Produção → Nova ordem, adicione os produtos
2. Compre                     →  a lista sai dividida por loja, risque no telemóvel
3. Recebi esta compra         →  entra no estoque
4. Produzi                    →  sai do estoque
5. Entregue                   →  a encomenda conta como venda
6. No fim do mês, Resultados  →  leia o desvio e vá atrás dele
```

Os passos 3 e 4 são os que se esquecem, e são os que fazem tudo o resto funcionar.

---

## Perguntas rápidas

**Preciso de uma ordem de produção para tudo o que faço?**
Para o CMV real fazer sentido, sim — é ela que tira do estoque. Uma ordem por semana,
com as quantidades da semana, já chega.

**E se eu esquecer de registar uma produção?**
O CMV real fica baixo demais e o desvio fica negativo. Registe-a com a data certa.

**E se o estoque ficar negativo?**
Significa que registou a produção antes da compra. A página de Estoque avisa. Receba a
compra da ordem, ou faça uma contagem para acertar.

**Ofereci produto sem criar ordem promocional. E agora?**
Esse custo foi para o CMV e vai aparecer como desvio positivo. Registe a próxima como
promocional; para corrigir a passada, não há caminho automático — anote no mês.

**Contei o armazém e não bate com a app. E agora?**
Em **Estoque**, use o botão de contagem ao lado do insumo. A app regista a **diferença**
como um movimento de inventário — e é essa diferença que lhe interessa ver, não o número
corrigido.

**Em que unidade escrevo as quantidades?**
Em **quilos** ou em **unidades**, sempre — não há gramas em lado nenhum. Uma lata de
200 g escreve-se `0,2`, e 15 g de fermento escrevem-se `0,015`. O campo já mostra `kg`
ou `un` do lado direito, por isso não há nada a escolher.

Parece estranho no início, mas evita o engano que dá mais prejuízo: escrever `200`
num campo que está em quilos. Duzentos quilos de fermento por 2 € passam despercebidos
quando o custo aparece como 0,00001 por grama; em quilos lê-se `0,01 €/kg` e salta à
vista.

**Como cadastro um líquido — óleo, leite, xarope?**
A peso, como tudo o resto. A app só mede peso e unidades: não há litros. É de propósito.
Converter litros em quilos exige saber a densidade — 1 L de óleo são 920 g, de mel são
1400 g — e a app não tem como adivinhar isso sem errar o custo. Ponha a embalagem na
balança uma vez e escreva o peso.

**A ficha mostra os custos, e eu só quero ver a receita.**
Há um botão **Ver custos** por cima da tabela. Os custos começam escondidos, e a app
lembra-se da sua escolha neste telemóvel ou computador.

**A app pede-me uma palavra-passe. Onde a defino?**
Na Vercel, em Settings → Environment Variables, com o nome `APP_PASSWORD` e o valor
que quiser; depois publique outra vez para ela valer. No seu computador, acrescente
`APP_PASSWORD=...` ao ficheiro `.env` e reinicie.

Não há contas nem utilizadores: é uma palavra-passe só, partilhada por quem trabalha
na casa. Fica ligado 30 dias em cada aparelho, e o botão de sair está no canto
superior direito. Trocar a palavra-passe faz sair toda a gente — é assim que se tira
o acesso a alguém.

Enquanto não a definir, **ninguém entra**, nem você. É de propósito: esta app tem os
seus custos, as suas margens e os seus fornecedores, e estava publicada sem nada a
proteger.

**Como sei que um insumo está a acabar?**
Abra o insumo e preencha **"Avisar abaixo de"** — a quantidade em que já quer ir
comprar, não a quantidade em que já faltou. A partir daí, o insumo aparece marcado
como *a acabar* no Estoque e num cartão no Painel.

Deixe vazio nos que não quer acompanhar. Sem mínimo não há aviso nenhum, e é por isso
que o Painel começa sem o cartão: é preciso dizer-lhe primeiro o que é pouco para si.

Um bom mínimo é quanto se gasta entre duas idas às compras, mais uma folga. Se faz
compras à segunda e gasta 4 kg de farinha por semana, ponha 5 ou 6.

**Como ponho os alergénios nas fichas?**
Em cada insumo há uma lista com os catorze do Regulamento (UE) 1169/2011, cada um
com uma explicação do que conta. Marque os que o insumo contém e, sobretudo, marque
**"já verifiquei este insumo"** — mesmo quando não tem nenhum.

Essa caixa é o ponto todo. Sem ela, a ficha não diz "sem alergénios": diz que há
insumos por verificar, e mostra quais. Um bolo que leva farinha e ovos a dizer "sem
alergénios" porque ninguém preencheu nada é a pior resposta que esta app podia dar.

Os alergénios das preparações base sobem sozinhos para os produtos que as usam.

**Posso imprimir a ficha para afixar na cozinha?**
Sim — botão **Imprimir** no topo da ficha. A folha leva o que a cozinha precisa: o
que leva, quanto leva, quanto rende e os alergénios. **Custos não vão**, de propósito:
uma ficha na parede é lida por quem passa, e as suas margens não são assunto de
fornecedores nem de clientes.

Para PDF, escolha "Guardar como PDF" no diálogo de impressão.

**Isto serve como declaração legal de alergénios?**
Não. A app junta o que você declarou em cada insumo e poupa-lhe o trabalho de
percorrer as sub-receitas à mão. Quem responde pela declaração é quem a assina, e
continua a ser preciso conferir os rótulos dos fornecedores. Vestígios por
contaminação cruzada não estão aqui de todo.
