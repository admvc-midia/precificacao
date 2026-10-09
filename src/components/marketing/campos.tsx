/**
 * Os campos dos formularios de campanha e de tarefa. Sem estado: vao dentro
 * de um `FormDialog` ou `ActionForm`, e o servidor le-os em
 * `lib/actions/marketing.ts`.
 */

import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { CANAIS, CANAL_LABEL, ESTADOS, ESTADO_LABEL, type Canal, type EstadoCampanha } from '@/lib/marketing/contas';

const MARCACAO = (
  <>
    <code>## Título</code> · <code>- item</code> · <code>&gt; destaque</code> · <code>**negrito**</code>
  </>
);

const diaDe = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

export interface CampanhaParaEditar {
  id: string;
  title: string;
  objective: string | null;
  description: string | null;
  status: EstadoCampanha;
  channels: Canal[];
  startsAt: Date | null;
  endsAt: Date | null;
  budget: unknown;
  couponCodes: string[];
}

export function CamposCampanha({ c }: { c?: CampanhaParaEditar }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Field label="Nome" htmlFor="cp-nome">
        <Input id="cp-nome" name="title" defaultValue={c?.title ?? ''} required placeholder="Natal para empresas" />
      </Field>
      <Field label="Objetivo" htmlFor="cp-obj">
        <Input id="cp-obj" name="objective" defaultValue={c?.objective ?? ''} placeholder="O que se quer conseguir" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado" htmlFor="cp-estado">
          <Select id="cp-estado" name="status" defaultValue={c?.status ?? 'IDEA'}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Orçamento (€)" htmlFor="cp-orc" hint="Anúncios, amostras, impressos.">
          <Input
            id="cp-orc"
            name="budget"
            inputMode="decimal"
            defaultValue={c?.budget == null ? '' : Number(c.budget).toFixed(2).replace('.', ',')}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De" htmlFor="cp-de">
          <Input id="cp-de" name="startsAt" type="date" defaultValue={diaDe(c?.startsAt)} />
        </Field>
        <Field label="Até" htmlFor="cp-ate">
          <Input id="cp-ate" name="endsAt" type="date" defaultValue={diaDe(c?.endsAt)} />
        </Field>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Canais</legend>
        <div className="grid grid-cols-2 gap-1 text-sm">
          {CANAIS.map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" name="channel" value={k} defaultChecked={c?.channels.includes(k)} className="h-4 w-4" />
              {CANAL_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Cupões da campanha"
        htmlFor="cp-cupoes"
        hint="Os códigos, separados por espaço ou vírgula. Quem cria o cupão é o dono, em Loja → Cupões; aqui aparecem as encomendas que o usaram."
      >
        <Input id="cp-cupoes" name="couponCodes" defaultValue={c?.couponCodes.join(' ') ?? ''} className="uppercase" placeholder="BEMVINDA10 IG10" />
      </Field>
      <Field label="Descrição" htmlFor="cp-desc" hint={MARCACAO}>
        <Textarea id="cp-desc" name="description" rows={6} defaultValue={c?.description ?? ''} />
      </Field>
    </>
  );
}

export interface TarefaParaEditar {
  id: string;
  title: string;
  notes: string | null;
  assignee: string | null;
  dueAt: Date | null;
}

export function CamposTarefa({ t, campaignId }: { t?: TarefaParaEditar; campaignId?: string }) {
  return (
    <>
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      <Field label="Tarefa" htmlFor={`tf-t-${t?.id ?? 'nova'}`}>
        <Input id={`tf-t-${t?.id ?? 'nova'}`} name="title" defaultValue={t?.title ?? ''} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quem" htmlFor={`tf-q-${t?.id ?? 'nova'}`}>
          <Input id={`tf-q-${t?.id ?? 'nova'}`} name="assignee" defaultValue={t?.assignee ?? ''} placeholder="Ana" />
        </Field>
        <Field label="Até" htmlFor={`tf-d-${t?.id ?? 'nova'}`}>
          <Input id={`tf-d-${t?.id ?? 'nova'}`} name="dueAt" type="date" defaultValue={diaDe(t?.dueAt)} />
        </Field>
      </div>
      <Field label="Notas" htmlFor={`tf-n-${t?.id ?? 'nova'}`}>
        <Textarea id={`tf-n-${t?.id ?? 'nova'}`} name="notes" rows={3} defaultValue={t?.notes ?? ''} />
      </Field>
    </>
  );
}
