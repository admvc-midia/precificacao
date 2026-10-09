/**
 * O cardapio de partida, tirado do "Menu Bolos.pdf" da casa (outubro 2026).
 *
 * So serve o botao "Comecar com o menu do PDF", que cria isto quando ainda
 * nao ha secoes. Os itens nascem sem ficha tecnica (so nome e preco): ligam-se
 * as fichas depois, no ecra do cardapio, e so entao entram nas encomendas.
 *
 * Os textos estao na marcacao de `lib/cardapio/texto.ts`. Duas gralhas do
 * PDF corrigidas: "Ananais" → "Ananás", "Amendôas" → "Amêndoas".
 */

export interface SecaoDoModelo {
  name: string;
  layout: 'LIST' | 'CARDS' | 'TEXT';
  description?: string;
  itemsTitle?: string;
  footnote?: string;
  highlight?: string;
  body?: string;
  itens?: Array<{ name: string; description?: string; unitLabel?: string; price: number }>;
}

export const MODELO_DO_PDF: SecaoDoModelo[] = [
  {
    name: 'Bolos',
    layout: 'CARDS',
    description:
      'Todos os nossos bolos possuem 4 camadas de massa, 3 camadas de recheio e cobertura de Buttercream de Merengue Suíço, que tem uma textura e sabor suave. Produto 100% artesanal, sem conservantes e feito com muito carinho.',
    itemsTitle: 'Tamanho e valores',
    footnote: '*Valor da massa, recheio e cobertura já incluídos, exceto para a decoração.',
    highlight: 'Bolos de dois andares, valores sob consulta.',
    itens: [
      { name: '16 cm', unitLabel: '14 a 16 fatias', price: 50 },
      { name: '20 cm', unitLabel: '26 a 28 fatias', price: 70 },
    ],
    body: [
      '## Massa',
      '- Baunilha',
      '- Chocolate',
      '- Red Velvet',
      '',
      '## Recheios (de 1 até 3 opções)',
      '> Chocolate Belga | Brigadeiro Branco | Pistachio | Coco | Caramelo Salgado | Quatro Leites* | Nozes | Ananás | Pralinê** | Brigadeiro de Maracujá | Mousse de Café | Limão Siciliano | Leite Nido | Curd de Limão | Compota de Frutos Vermelhos | Compota de Morango | Crumble de Biscoito Lotus | Doce de Leite',
      '~ *Leite Condensado, Creme de Leite, Leite Nido e Leite de Coco.',
      '~ **Amêndoas Caramelizadas.',
      '',
      '## Decoração',
      'A decoração é feita conforme a escolha do cliente, por isso sinta-se à vontade para nos enviar as referências e o tema desejado para podermos orientar o nosso trabalho.',
      '> Os valores dependem do modelo e do tema escolhido. Contacte-nos para fazer o orçamento.',
    ].join('\n'),
  },
  {
    name: 'Caseirinhos',
    layout: 'LIST',
    itemsTitle: 'Sabores',
    itens: [
      { name: 'Chocolate', description: 'Massa de chocolate com cobertura de chocolate.', price: 25 },
      { name: 'Cenoura', description: 'Massa de cenoura com cobertura de chocolate.', price: 25 },
      { name: 'Tapioca', description: 'Massa de tapioca com cobertura de doce de leite.', price: 25 },
      {
        name: 'Dois Amores',
        description: 'Massa de baunilha e chocolate com cobertura de chocolate e brigadeiro branco.',
        price: 25,
      },
      { name: 'Coco', description: 'Massa de coco com cobertura de cocada.', price: 25 },
      { name: 'Limão Siciliano', description: 'Massa de limão com cobertura de limão.', price: 25 },
      { name: 'Fubá', description: 'Massa de fubá de milho com cobertura de goiabada.', price: 25 },
      { name: 'Red Velvet', description: 'Massa de Red Velvet com cobertura de Cream Cheese.', price: 25 },
      { name: 'Leite Nido', description: 'Massa de baunilha com cobertura de Leite Nido.', price: 25 },
    ],
  },
  {
    name: 'Informações importantes',
    layout: 'TEXT',
    body: [
      '### Pedidos',
      'Os pedidos de caixas de brigadeiros em quantidades menores podem ser entregues no mesmo dia ou no dia seguinte. Para caixas em quantidades maiores, os pedidos devem ser feitos com **3 dias de antecedência**.',
      '',
      'Recomendamos o prazo mínimo de **2 dias** para encomendas de bolos simples e caseirinhos e **7 dias** para bolos personalizados.',
      '',
      'Os pedidos só são entregues mediante pagamento integral do valor.',
      '',
      '### Pagamento',
      'O pagamento pode ser feito à vista, por MBWay ou transferência bancária.',
      '',
      'Cancelamentos e reembolso de caixas de brigadeiros em maiores quantidades devem ser feitos com 2 dias de antecedência, para bolos com um mínimo de 3 dias.',
      '',
      '### Entrega',
      'Não trabalhamos com pronta entrega, **APENAS NOS FINS DE SEMANA.** Entre em contacto connosco para informarmos o endereço.',
    ].join('\n'),
  },
  {
    name: 'Cuidados extras',
    layout: 'TEXT',
    body: [
      '> Bolos são produtos delicados, então necessitam de alguns cuidados para permanecerem com bom aspecto:',
      '- É importante manter o bolo refrigerado, por isso, armazene-o no frigorífico e retire **APENAS** perto do horário de início do evento. Tempo máximo de exposição é de 4 horas.',
      '- Buttercream, como o nome diz, é uma cobertura à base de manteiga com toque de baunilha, então pode perder a estrutura quando exposta ao sol por um tempo prolongado.',
      '- Sempre transporte o bolo gelado e no assoalho do autocarro, de baixo do banco do passageiro. Não recomendamos o transporte em motos.',
    ].join('\n'),
  },
];

/** Os contactos do PDF, para preencher o que ainda estiver vazio. */
export const CONTACTOS_DO_PDF = { whatsappNumber: '351924005977', instagramHandle: 'amo_brigs' };
