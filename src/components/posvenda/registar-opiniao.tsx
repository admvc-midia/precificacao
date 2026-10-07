/**
 * Janela de "o cliente respondeu": como falou, nota geral (obrigatoria),
 * nota por produto (opcional) e comentario.
 *
 * As estrelas sao radios escondidos com o rotulo pintado por `peer-checked`:
 * funcionam sem JavaScript de cliente e o formulario manda o valor sozinho.
 */

import { FormDialog } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form-controls';
import { Textarea } from '@/components/ui/input';
import { registerFeedback } from '@/lib/actions/posvenda';
import { VIA_LABEL, type ContactVia } from '@/lib/pricing/clientes';

export function RegistarOpiniao({
  orderId,
  numero,
  cliente,
  linhas,
}: {
  orderId: string;
  numero: number;
  cliente: string;
  linhas: Array<{ id: string; name: string }>;
}) {
  return (
    <FormDialog
      action={registerFeedback}
      title={`O que achou ${cliente}?`}
      description={`Encomenda #${numero}`}
      submitLabel="Registar opinião"
      className="max-h-[90vh] overflow-y-auto"
      trigger={<Button size="sm">Registar opinião</Button>}
    >
      <input type="hidden" name="orderId" value={orderId} />

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Como falou</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(VIA_LABEL) as ContactVia[]).map((v, i) => (
            <label key={v} className="cursor-pointer">
              <input
                type="radio"
                name="via"
                value={v}
                defaultChecked={i === 1}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center rounded-md border px-2 py-2 text-sm peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {VIA_LABEL[v]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Nota geral</legend>
        <Estrelas name="rating" obrigatoria />
      </fieldset>

      {linhas.length > 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Por produto <span className="font-normal text-muted-foreground">(opcional)</span>
          </p>
          {linhas.map((l) => (
            <Field key={l.id} label={l.name} htmlFor={`nota-${l.id}`}>
              <Select id={`nota-${l.id}`} name={`nota:${l.id}`} defaultValue="">
                <option value="">Sem nota</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)} {n}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      ) : null}

      <Field label="O que disse" htmlFor={`com-${orderId}`}>
        <Textarea
          id={`com-${orderId}`}
          name="comment"
          rows={3}
          placeholder="Adorou o recheio, achou a massa um pouco seca."
        />
      </Field>
    </FormDialog>
  );
}

/** Cinco botoes de 1 a 5. */
function Estrelas({ name, obrigatoria = false }: { name: string; obrigatoria?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={n}
            required={obrigatoria}
            className="peer sr-only"
          />
          <span className="flex flex-col items-center rounded-md border py-2 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
            <span className="text-base leading-none">★</span>
            <span className="text-xs">{n}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
