/**
 * Os campos da ficha de cliente, para criar e para editar.
 *
 * Os dados de contacto e os gostos vivem em dois formularios separados na
 * ficha, por isso ha dois blocos: `CamposContacto` e `CamposGostos`.
 */

import { Field, Select } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { REDE_LABEL, SOURCE_LABEL, type CustomerSource } from '@/lib/pricing/clientes';

interface ClienteForm {
  id?: string;
  name?: string;
  phone?: string | null;
  birthDay?: number | null;
  birthMonth?: number | null;
  source?: CustomerSource | null;
  referredById?: string | null;
  contactConsentAt?: Date | null;
  likes?: string | null;
  dislikes?: string | null;
  notes?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
}

export function CamposContacto({
  cliente = {},
  outros,
  prefixo,
}: {
  cliente?: ClienteForm;
  /** Os outros clientes, para "quem indicou". */
  outros: Array<{ id: string; name: string }>;
  prefixo: string;
}) {
  const aniversario =
    cliente.birthDay && cliente.birthMonth
      ? `${String(cliente.birthDay).padStart(2, '0')}/${String(cliente.birthMonth).padStart(2, '0')}`
      : '';

  return (
    <>
      <input type="hidden" name="consentSubmitted" value="1" />
      <Field label="Nome" htmlFor={`${prefixo}-nome`}>
        <Input id={`${prefixo}-nome`} name="name" defaultValue={cliente.name ?? ''} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefone" htmlFor={`${prefixo}-tel`}>
          <Input
            id={`${prefixo}-tel`}
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={cliente.phone ?? ''}
          />
        </Field>
        <Field label="Aniversário" htmlFor={`${prefixo}-aniv`} hint="dia/mês, sem o ano">
          <Input
            id={`${prefixo}-aniv`}
            name="birthday"
            inputMode="numeric"
            placeholder="12/11"
            defaultValue={aniversario}
          />
        </Field>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Redes sociais</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['instagram', 'facebook', 'tiktok'] as const).map((rede) => (
            <Input
              key={rede}
              id={`${prefixo}-${rede}`}
              name={rede}
              aria-label={REDE_LABEL[rede]}
              placeholder={rede === 'facebook' ? 'Facebook: nome' : `${REDE_LABEL[rede]}: @nome`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={cliente[rede] ?? ''}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">O @ ou o link do perfil, como vier: a app guarda só o nome.</p>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Como nos conheceu" htmlFor={`${prefixo}-origem`}>
          <Select id={`${prefixo}-origem`} name="source" defaultValue={cliente.source ?? ''}>
            <option value="">Não sei</option>
            {(Object.keys(SOURCE_LABEL) as CustomerSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quem indicou" htmlFor={`${prefixo}-indicou`} hint="Se veio por indicação.">
          <Select
            id={`${prefixo}-indicou`}
            name="referredById"
            defaultValue={cliente.referredById ?? ''}
          >
            <option value="">Ninguém</option>
            {outros
              .filter((o) => o.id !== cliente.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="contactConsent"
          defaultChecked={Boolean(cliente.contactConsentAt)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          Aceita ser contactado depois
          <span className="block text-xs text-muted-foreground">
            Para perguntar se gostou, lembrar o aniversário e avisar de novidades. Sem isto,
            a app não lhe propõe mensagens. Se pedir para não ser contactado, desmarque.
          </span>
        </span>
      </label>
    </>
  );
}

export function CamposGostos({ cliente = {}, prefixo }: { cliente?: ClienteForm; prefixo: string }) {
  return (
    <>
      <Field label="Gosta de" htmlFor={`${prefixo}-gosta`}>
        <Textarea
          id={`${prefixo}-gosta`}
          name="likes"
          rows={2}
          placeholder="Chocolate amargo, frutos vermelhos, pouco doce"
          defaultValue={cliente.likes ?? ''}
        />
      </Field>
      <Field label="Não gosta de" htmlFor={`${prefixo}-nao-gosta`}>
        <Textarea
          id={`${prefixo}-nao-gosta`}
          name="dislikes"
          rows={2}
          placeholder="Coco, passas"
          defaultValue={cliente.dislikes ?? ''}
        />
      </Field>
      <Field
        label="Notas"
        htmlFor={`${prefixo}-notas`}
        hint="Alergias e doenças não ficam aqui: são dados de saúde. Escreva-as nas notas de cada encomenda, que é onde a cozinha as lê."
      >
        <Textarea
          id={`${prefixo}-notas`}
          name="notes"
          rows={3}
          placeholder="Encomenda sempre para o aniversário do filho, em março."
          defaultValue={cliente.notes ?? ''}
        />
      </Field>
    </>
  );
}
