/**
 * Os campos de uma receita, em dois blocos: os dados (titulo, origem,
 * etiquetas — nao mudam de versao para versao) e o conteudo (ingredientes,
 * preparo, rendimento — cada alteracao e uma versao nova).
 *
 * Sem estado de cliente: servem a pagina de nova receita, a de versao nova e
 * o ecra de revisao da importacao, e mandam o valor sozinhos no formulario.
 */

import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { SOURCE_KIND_LABEL, type SourceKind } from '@/lib/livro/receita';

export interface DadosReceita {
  title?: string;
  sourceKind?: SourceKind | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
  fichaId?: string | null;
}

export interface ConteudoReceita {
  ingredients?: string;
  steps?: string;
  yield?: string | null;
  prepTime?: string | null;
  notes?: string | null;
}

export function CamposDados({
  d = {},
  fichas,
  prefixo = 'r',
}: {
  d?: DadosReceita;
  /** So para o dono: as fichas tecnicas que a receita pode descrever. */
  fichas?: Array<{ id: string; name: string }>;
  prefixo?: string;
}) {
  return (
    <>
      <Field label="Título" htmlFor={`${prefixo}-titulo`}>
        <Input
          id={`${prefixo}-titulo`}
          name="title"
          defaultValue={d.title ?? ''}
          placeholder="Bolo de cenoura da avó Maria"
          required
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="De onde veio" htmlFor={`${prefixo}-origem`}>
          <Select id={`${prefixo}-origem`} name="sourceKind" defaultValue={d.sourceKind ?? ''}>
            <option value="">Não sei</option>
            {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
              <option key={k} value={k}>
                {SOURCE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="De quem, ou qual" htmlFor={`${prefixo}-fonte`}>
          <Input
            id={`${prefixo}-fonte`}
            name="sourceName"
            defaultValue={d.sourceName ?? ''}
            placeholder="Avó Maria · Curso X, módulo 3"
          />
        </Field>
      </div>
      <Field label="Link" htmlFor={`${prefixo}-link`} hint="Opcional. A página de onde veio.">
        <Input
          id={`${prefixo}-link`}
          name="sourceUrl"
          type="url"
          inputMode="url"
          defaultValue={d.sourceUrl ?? ''}
          placeholder="https://"
        />
      </Field>
      <Field label="Etiquetas" htmlFor={`${prefixo}-tags`} hint="Separadas por vírgula.">
        <Input
          id={`${prefixo}-tags`}
          name="tags"
          defaultValue={(d.tags ?? []).join(', ')}
          placeholder="bolos, chocolate, festas"
        />
      </Field>
      {fichas ? (
        <Field
          label="Ficha técnica"
          htmlFor={`${prefixo}-ficha`}
          hint="A ficha com os custos deste produto. Só o dono a vê."
        >
          <Select id={`${prefixo}-ficha`} name="fichaId" defaultValue={d.fichaId ?? ''}>
            <option value="">Nenhuma</option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </>
  );
}

export function CamposConteudo({ c = {}, prefixo = 'r' }: { c?: ConteudoReceita; prefixo?: string }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rendimento" htmlFor={`${prefixo}-rend`}>
          <Input id={`${prefixo}-rend`} name="yield" defaultValue={c.yield ?? ''} placeholder="12 fatias" />
        </Field>
        <Field label="Tempo" htmlFor={`${prefixo}-tempo`}>
          <Input id={`${prefixo}-tempo`} name="prepTime" defaultValue={c.prepTime ?? ''} placeholder="1 h 10 min" />
        </Field>
      </div>
      <Field
        label="Ingredientes"
        htmlFor={`${prefixo}-ingr`}
        hint="Um por linha. Para separar partes, escreva o nome da parte numa linha: «Massa:», «Recheio:»."
      >
        <Textarea
          id={`${prefixo}-ingr`}
          name="ingredients"
          rows={10}
          defaultValue={c.ingredients ?? ''}
          placeholder={'3 cenouras médias\n4 ovos\n1 chávena de óleo'}
          required
        />
      </Field>
      <Field
        label="Modo de preparo"
        htmlFor={`${prefixo}-passos`}
        hint="Um passo por parágrafo (deixe uma linha em branco entre passos). A numeração é automática."
      >
        <Textarea
          id={`${prefixo}-passos`}
          name="steps"
          rows={12}
          defaultValue={c.steps ?? ''}
          placeholder={'Bata as cenouras, os ovos e o óleo.\n\nJunte a farinha e misture.'}
          required
        />
      </Field>
      <Field label="Notas e dicas" htmlFor={`${prefixo}-notas`}>
        <Textarea id={`${prefixo}-notas`} name="notes" rows={3} defaultValue={c.notes ?? ''} />
      </Field>
    </>
  );
}
