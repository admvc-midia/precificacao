'use client';

/**
 * Perda e fator de correcao — dois campos para o mesmo numero.
 *
 * Eles dizem exatamente a mesma coisa vista de dois lados: 20% de perda e o
 * mesmo que FC 1,25. Quem limpa carne pensa em "perdi 20%"; as tabelas de
 * ficha tecnica publicam FC. Vale a pena aceitar os dois.
 *
 * Por isso sincronizam-se: escreva num e o outro acompanha. A versao anterior
 * tinha os dois campos mais um seletor a decidir qual deles contava, e o
 * resultado era que escrever na perda nao fazia nada — o seletor estava no
 * outro modo e ninguem reparava. Um seletor a mais nao e uma opcao a mais,
 * e uma armadilha.
 *
 * O campo que vai para o servidor e o FC, que e o que fica guardado.
 */

import { useState } from 'react';

import { Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { fcFromWastePercent, wastePercentFromFc } from '@/lib/pricing/cost';

/** Mostra no maximo `casas` decimais, sem zeros a mais. */
function fmt(value: number, casas: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(casas)));
}

// As conversoes vivem em `lib/pricing/cost.ts`, com testes. Aqui so se
// adapta a escala (o motor trabalha em fracao, o ecra em percentagem) e se
// protege dos valores fora de gama, que la levantam erro.
function wasteFromFc(fc: number): number {
  return fc > 0 ? wastePercentFromFc(fc) * 100 : 0;
}

function fcFromWaste(waste: number): number {
  return waste > 0 && waste < 100 ? fcFromWastePercent(waste / 100) : 1;
}

/** Aceita virgula decimal, como o resto da aplicacao. */
function parse(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function WasteInput({
  idPrefix,
  defaultFc = 1,
}: {
  idPrefix: string;
  defaultFc?: number;
}) {
  const inicial = Number.isFinite(defaultFc) && defaultFc > 0 ? defaultFc : 1;

  const [fc, setFc] = useState(() => fmt(inicial, 4));
  const [waste, setWaste] = useState(() => fmt(wasteFromFc(inicial), 2));

  const wasteNum = parse(waste);
  const invalida = wasteNum >= 100 || wasteNum < 0;

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium">Perda entre o que se compra e o que se usa</p>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        Limpeza de carne, cascas e aparas nos insumos; caixas amassadas e sacos
        rasgados nas embalagens. Deixe 0 se nao ha perda. Os dois campos dizem a
        mesma coisa — escreva no que lhe for mais natural.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Perda (%)" htmlFor={`${idPrefix}-waste`}>
          <Input
            id={`${idPrefix}-waste`}
            inputMode="decimal"
            value={waste}
            aria-invalid={invalida || undefined}
            onChange={(e) => {
              const v = e.target.value;
              setWaste(v);
              const w = parse(v);
              if (w >= 0 && w < 100) setFc(fmt(fcFromWaste(w), 4));
            }}
          />
        </Field>

        <Field
          label="Fator de correcao"
          htmlFor={`${idPrefix}-fc`}
          hint="Peso bruto / peso liquido."
        >
          <Input
            id={`${idPrefix}-fc`}
            // Este e o campo que o servidor le.
            name="correctionFactor"
            inputMode="decimal"
            value={fc}
            onChange={(e) => {
              const v = e.target.value;
              setFc(v);
              const f = parse(v);
              if (f > 0) setWaste(fmt(wasteFromFc(f), 2));
            }}
          />
        </Field>
      </div>

      {invalida ? (
        <p className="mt-2 text-xs text-destructive">
          A perda tem de estar entre 0% e 100%. Uma perda de 100% significaria que
          nao sobra nada do que se compra.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          1 kg comprado rende{' '}
          <strong>{fmt(1000 / (parse(fc) || 1), 0)} g</strong> aproveitaveis.
        </p>
      )}
    </div>
  );
}
