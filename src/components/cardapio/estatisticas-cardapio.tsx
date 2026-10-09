/**
 * "Como esta a correr" o cardapio publico: visitas, cliques em Encomendar e
 * pedidos de orcamento dos ultimos 30 dias, por origem e por semana, e os
 * links de cada canal (com `?o=`) para saber de onde vem cada visita.
 *
 * So contadores, sem valores de venda: serve o dono (Loja → Cardapio) e o
 * marketing (Campanhas).
 */

import { BarChart3 } from 'lucide-react';

import { CopiarLink } from '@/components/cardapio/copiar-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ORIGEM_LABEL, PARAMETRO_DA_ORIGEM, type Origem } from '@/lib/cardapio/estatisticas';
import { produtosMaisVistos, resumoDoCardapio } from '@/lib/cardapio/estatisticas-base';
import { formatPercent } from '@/lib/money';

const semanaFmt = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

export async function EstatisticasCardapio({ urlDoCardapio }: { urlDoCardapio: string }) {
  const [r, vistos] = await Promise.all([resumoDoCardapio(), produtosMaisVistos()]);
  const maior = Math.max(1, ...r.porSemana.map((s) => s.visitas));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          Cardápio: como está a correr
        </CardTitle>
        <CardDescription>
          Últimos 30 dias. Contadores sem cookies nem dados de quem visita; os robôs que fazem a
          pré-visualização do link não contam.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Visitas', String(r.visitas)],
            ['Encomendar', String(r.encomendar)],
            ['Taxa', r.taxa == null ? '—' : formatPercent(r.taxa, 'pt-PT', 1)],
            ['Pedidos de orçamento', String(r.orcamentos)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Por origem</h3>
            {r.porOrigem.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem visitas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="font-normal">Origem</th>
                    <th className="text-right font-normal">Visitas</th>
                    <th className="text-right font-normal">Encomendar</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porOrigem.map((o) => (
                    <tr key={o.origem} className="border-t">
                      <td className="py-1">{ORIGEM_LABEL[o.origem]}</td>
                      <td className="py-1 text-right tabular-nums">{o.visitas}</td>
                      <td className="py-1 text-right tabular-nums">{o.encomendar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Por semana (visitas · encomendar)</h3>
            <ul className="space-y-1 text-sm">
              {r.porSemana.map((s) => (
                <li key={s.semana} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{semanaFmt(s.semana)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full bg-primary" style={{ width: `${(s.visitas / maior) * 100}%` }} />
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    {s.visitas} · {s.encomendar}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Produtos mais vistos (aberto · juntado ao pedido)</h3>
          {vistos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem produtos abertos.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {vistos.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 border-t py-1 first:border-t-0">
                  <span className="truncate">{p.nome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.abertos} · {p.juntados}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            Muito aberto e pouco juntado: o preço, a foto ou a descrição podem estar a afastar.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Link de cada canal</h3>
          <p className="text-xs text-muted-foreground">
            Use o link certo em cada sítio para a origem contar certo (o Instagram nem sempre diz de
            onde se vem).
          </p>
          <ul className="space-y-2">
            {(Object.entries(PARAMETRO_DA_ORIGEM) as Array<[Origem, string]>).map(([origem, p]) => (
              <li key={origem} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-center">
                <span className="text-sm">{ORIGEM_LABEL[origem]}</span>
                <CopiarLink url={`${urlDoCardapio}?o=${p}`} />
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
