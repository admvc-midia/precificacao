/**
 * Matriz de engenharia de cardapio.
 *
 * Cruza popularidade (eixo x) com margem de contribuicao (eixo y). As linhas
 * de corte sao as medias, e os quatro quadrantes que elas criam sao a leitura:
 *
 *   Estrela        vende muito e da margem    -> proteger, nunca baixar preco
 *   Cavalo         vende muito, margem fraca  -> atacar o custo do produto
 *   Quebra-cabeca  margem boa, vende pouco    -> reposicionar no menu
 *   Abacaxi        nem uma coisa nem outra    -> candidato a sair
 *
 * ---------------------------------------------------------------------------
 * PORQUE E QUE OS PONTOS SAO TODOS DA MESMA COR
 * ---------------------------------------------------------------------------
 * Colorir por quadrante seria o instinto, mas num grafico de dispersao todos
 * os pares de cor tem de se distinguir entre si — nao apenas os vizinhos — e
 * quatro categorias nao passam esse crivo com a paleta validada.
 *
 * E seria redundante de qualquer forma: o quadrante ja esta na posicao do
 * ponto, que e o proposito do grafico. Uma serie so tambem dispensa legenda,
 * e cada ponto leva o seu nome ao lado.
 */

import { formatPercent } from '@/lib/money';

export type MenuClass = 'ESTRELA' | 'CAVALO' | 'QUEBRA_CABECA' | 'ABACAXI';

export interface MenuItem {
  id: string;
  name: string;
  qty: number;
  /** Fatia das unidades vendidas, de 0 a 1. */
  popularityShare: number;
  contribution: number;
  contributionLabel: string;
  klass: MenuClass;
  klassLabel: string;
}

const L = 56; // espaco a esquerda para os rotulos do eixo y
const R = 16;
const T = 24;
const B = 40;
const W = 640;
const H = 380;

export function MenuMatrix({
  items,
  avgContribution,
  avgContributionLabel,
  avgPopularityShare,
}: {
  items: MenuItem[];
  avgContribution: number;
  avgContributionLabel: string;
  /** Fatia media: 1/n. E a linha de corte da popularidade. */
  avgPopularityShare: number;
}) {
  if (items.length === 0) return null;

  // Escalas com uma folga de 15%, para nenhum ponto colar a moldura.
  const maxPop = Math.max(...items.map((i) => i.popularityShare), avgPopularityShare);
  const maxCon = Math.max(...items.map((i) => i.contribution), avgContribution);
  const minCon = Math.min(...items.map((i) => i.contribution), 0);

  const padPop = maxPop * 0.15 || 0.1;
  const padCon = (maxCon - minCon) * 0.15 || 1;

  const x0 = 0;
  const x1 = maxPop + padPop;
  const y0 = minCon - padCon;
  const y1 = maxCon + padCon;

  const px = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);

  const cx = px(avgPopularityShare);
  const cy = py(avgContribution);

  // Com poucos produtos vale a pena nomear todos. A partir de nove a chuva de
  // rotulos deixa de se ler, e ficam so os extremos — o resto esta na tabela.
  const rotularTodos = items.length <= 8;
  const extremos = new Set(
    [...items]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)
      .concat(
        [...items].sort((a, b) => b.popularityShare - a.popularityShare).slice(0, 2),
      )
      .map((i) => i.id),
  );

  return (
    <figure className="menu-matrix m-0 space-y-4">
      <style
        dangerouslySetInnerHTML={{
          __html: `
.menu-matrix{ --mm-dot:#2a78d6; --mm-surface:#fcfcfb; --mm-grid:#d9d7d1; }
@media (prefers-color-scheme: dark){
.menu-matrix{ --mm-dot:#3987e5; --mm-surface:#1a1a19; --mm-grid:#3a3a37; }
}
.menu-matrix .mm-dot{ transition: r .12s ease; }
.menu-matrix .mm-hit:hover + .mm-label,
.menu-matrix .mm-hit:focus-visible + .mm-label{ opacity:1; }
`,
        }}
      />

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={resumo(items)}
        >
          {/* Fundo dos quadrantes: um tom quase impercetivel nos dois "bons",
              para orientar sem competir com os pontos. */}
          <rect x={cx} y={T} width={W - R - cx} height={cy - T} className="fill-primary/4" />
          <rect x={L} y={T} width={cx - L} height={cy - T} className="fill-primary/2" />

          {/* Moldura e linhas de corte. Hairline, solidas, recessivas. */}
          <rect
            x={L}
            y={T}
            width={W - L - R}
            height={H - T - B}
            fill="none"
            stroke="var(--mm-grid)"
            strokeWidth={1}
          />
          <line x1={cx} y1={T} x2={cx} y2={H - B} stroke="var(--mm-grid)" strokeWidth={1} />
          <line x1={L} y1={cy} x2={W - R} y2={cy} stroke="var(--mm-grid)" strokeWidth={1} />

          {/* Nome de cada quadrante, discreto, no canto correspondente. */}
          <QuadLabel x={W - R - 8} y={T + 14} anchor="end" texto="Estrela" />
          <QuadLabel x={L + 8} y={T + 14} anchor="start" texto="Quebra-cabeca" />
          <QuadLabel x={W - R - 8} y={H - B - 8} anchor="end" texto="Cavalo de batalha" />
          <QuadLabel x={L + 8} y={H - B - 8} anchor="start" texto="Abacaxi" />

          {/* Eixos */}
          <text x={L} y={H - 12} className="fill-muted-foreground text-[11px]">
            menos vendido
          </text>
          <text
            x={W - R}
            y={H - 12}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            mais vendido →
          </text>
          <text
            transform={`translate(14 ${T + (H - T - B) / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            margem de contribuicao →
          </text>
          <text x={L - 8} y={cy - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
            media
          </text>

          {items.map((item) => {
            const cxp = px(item.popularityShare);
            const cyp = py(item.contribution);
            const rotular = rotularTodos || extremos.has(item.id);

            return (
              <g key={item.id}>
                {/* Anel na cor da superficie: mantem o ponto legivel quando
                    dois produtos se sobrepoem. */}
                <circle
                  cx={cxp}
                  cy={cyp}
                  r={6}
                  fill="var(--mm-dot)"
                  stroke="var(--mm-surface)"
                  strokeWidth={2}
                  className="mm-dot"
                />
                {/* Alvo de rato maior que o ponto. */}
                <circle
                  cx={cxp}
                  cy={cyp}
                  r={14}
                  fill="transparent"
                  tabIndex={0}
                  className="mm-hit outline-hidden"
                >
                  {/* Uma string so: o <title> do SVG e texto, e o React
                      recusa um array de nodes aqui. */}
                  <title>{`${item.name} — ${item.qty} un (${formatPercent(
                    item.popularityShare,
                    'pt-PT',
                    0,
                  )}), ${item.contributionLabel} de margem · ${item.klassLabel}`}</title>
                </circle>

                {rotular ? (
                  <text
                    x={cxp + 10}
                    y={cyp + 4}
                    className="fill-foreground text-[11px]"
                    style={{ paintOrder: 'stroke', stroke: 'var(--mm-surface)', strokeWidth: 3 }}
                  >
                    {item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="text-xs text-muted-foreground">
        Linhas de corte: margem media de {avgContributionLabel} e{' '}
        {formatPercent(avgPopularityShare, 'pt-PT', 0)} das unidades vendidas.
      </figcaption>

      {/* A tabela nao e um extra: garante que nada aqui depende de ver o
          grafico, e da os numeros exatos que a posicao so aproxima. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 text-left font-medium">Produto</th>
              <th className="px-3 py-2 text-right font-medium">Vendidas</th>
              <th className="px-3 py-2 text-right font-medium">Margem/un</th>
              <th className="py-2 pl-3 text-left font-medium">Classificacao</th>
            </tr>
          </thead>
          <tbody>
            {[...items]
              .sort((a, b) => b.qty - a.qty)
              .map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{i.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {i.qty}{' '}
                    <span className="text-muted-foreground">
                      ({formatPercent(i.popularityShare, 'pt-PT', 0)})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {i.contributionLabel}
                  </td>
                  <td className="py-2 pl-3">{i.klassLabel}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function QuadLabel({
  x,
  y,
  anchor,
  texto,
}: {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  texto: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="fill-muted-foreground text-[10px] uppercase tracking-wide"
    >
      {texto}
    </text>
  );
}

function resumo(items: MenuItem[]): string {
  const porClasse = items.reduce<Record<string, string[]>>((acc, i) => {
    (acc[i.klassLabel] ??= []).push(i.name);
    return acc;
  }, {});
  const partes = Object.entries(porClasse).map(
    ([classe, nomes]) => `${classe}: ${nomes.join(', ')}`,
  );
  return `Matriz de engenharia de cardapio. ${partes.join('. ')}.`;
}
