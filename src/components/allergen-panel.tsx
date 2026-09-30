import { AlertTriangle, CheckCircle2, ShieldQuestion } from 'lucide-react';

import { Alert, Badge } from '@/components/ui/badge';
import { ALLERGEN_LABEL, type AllergenReport } from '@/lib/pricing/allergens';

/**
 * Os alergenios de uma ficha.
 *
 * Tres estados, e a diferenca entre eles e o ponto todo:
 *
 *  - **por verificar** — ha insumos que ninguem olhou. A lista que se mostra e
 *    um minimo, nao um total, e diz-se isso por palavras.
 *  - **verificado, com alergenios** — a lista esta fechada.
 *  - **verificado, sem nenhum** — alguem olhou e nao ha. So isto autoriza a
 *    frase "nao contem".
 *
 * Nunca se escreve "sem alergenios" enquanto houver um insumo por verificar.
 * Essa frase, dita cedo demais, e a unica saida deste ecra que pode mandar
 * alguem para o hospital.
 */
export function AllergenPanel({
  report,
  print,
}: {
  report: AllergenReport;
  /** Na folha impressa nao ha cor nem icones a valer; o texto tem de bastar. */
  print?: boolean;
}) {
  const { present, by, unreviewed, complete } = report;

  return (
    <div className="space-y-3">
      {present.length > 0 ? (
        <ul className={print ? 'space-y-1 text-sm' : 'space-y-1.5'}>
          {present.map((a) => (
            <li key={a} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {print ? (
                <strong className="uppercase">{ALLERGEN_LABEL[a]}</strong>
              ) : (
                <Badge variant="warning">{ALLERGEN_LABEL[a]}</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {by[a]?.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {complete ? (
        present.length === 0 ? (
          <Alert tone="info">
            <span className="flex items-start gap-2">
              {print ? null : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                Todos os insumos desta ficha foram verificados e nenhum declara
                alergenios do Anexo II.
              </span>
            </span>
          </Alert>
        ) : null
      ) : (
        <Alert tone="destructive">
          <span className="flex items-start gap-2">
            {print ? null : (
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>
              <strong>
                Esta lista esta incompleta: {unreviewed.length} insumo(s) por
                verificar.
              </strong>{' '}
              O que aparece acima e o minimo, nao o total. Marque cada insumo
              como verificado no seu cadastro — {unreviewed.join(', ')}.
            </span>
          </span>
        </Alert>
      )}

      <p
        className={
          print
            ? 'text-[10px] leading-snug text-muted-foreground'
            : 'flex items-start gap-1.5 text-xs text-muted-foreground'
        }
      >
        {print ? null : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
        <span>
          Lista montada a partir do que foi declarado em cada insumo, segundo o
          Anexo II do Regulamento (UE) 1169/2011. Nao cobre vestigios por
          contaminacao cruzada, e nao substitui a conferencia dos rotulos dos
          fornecedores — quem assina a declaracao e quem a faz.
        </span>
      </p>
    </div>
  );
}
