'use client';

/**
 * As fichas que um combo leva, com a quantidade — linhas que se juntam e
 * tiram no browser. Vai dentro do formulario do combo; os campos chegam a
 * action como `comp.<n>.recipeId` e `comp.<n>.qty`.
 *
 * Mostra a soma dos precos (cardapio ou tabela) e o custo, para o dono ver o
 * desconto e o CMV do combo antes de escolher o preco.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/input';
import { formatMoney, formatPercent, parseDecimal, parseQty, type CurrencyConfig } from '@/lib/money';

export interface FichaDoCombo {
  id: string;
  name: string;
  /** Preco do cardapio, ou de tabela. */
  price: number | null;
  /** Custo direto por unidade (ingredientes + embalagem). */
  cost: number | null;
}

export function ComponentesCombo({
  fichas,
  iniciais,
  precoInicial,
  currency,
}: {
  fichas: FichaDoCombo[];
  iniciais: Array<{ recipeId: string; qty: number }>;
  precoInicial: string;
  currency: CurrencyConfig;
}) {
  const [linhas, setLinhas] = useState(
    (iniciais.length ? iniciais : [{ recipeId: '', qty: 1 }]).map((l, key) => ({
      key,
      recipeId: l.recipeId,
      qty: String(l.qty).replace('.', ','),
    })),
  );
  const [proxima, setProxima] = useState(linhas.length);
  const [preco, setPreco] = useState(precoInicial);
  const porId = new Map(fichas.map((f) => [f.id, f]));

  const soma = linhas.reduce((a, l) => a + (porId.get(l.recipeId)?.price ?? 0) * parseQty(l.qty), 0);
  const custo = linhas.reduce((a, l) => a + (porId.get(l.recipeId)?.cost ?? 0) * parseQty(l.qty), 0);
  const p = parseDecimal(preco);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Leva</p>
      {linhas.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
          <Select
            name={`comp.${i}.recipeId`}
            aria-label="Produto"
            value={l.recipeId}
            onChange={(e) => setLinhas((ls) => ls.map((x) => (x.key === l.key ? { ...x, recipeId: e.target.value } : x)))}
            required
          >
            <option value="" disabled>
              Escolha…
            </option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Input
            name={`comp.${i}.qty`}
            aria-label="Quantidade"
            inputMode="decimal"
            value={l.qty}
            onChange={(e) => setLinhas((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={linhas.length === 1}
            onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Tirar</span>
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setLinhas((ls) => [...ls, { key: proxima, recipeId: '', qty: '1' }]);
          setProxima((n) => n + 1);
        }}
      >
        <Plus className="h-4 w-4" />
        Outro produto
      </Button>

      <div className="space-y-1.5">
        <label htmlFor="combo-preco" className="text-sm font-medium">
          Preço do combo
        </label>
        <Input
          id="combo-preco"
          name="price"
          inputMode="decimal"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Em separado: {formatMoney(soma, currency)}
          {p > 0 && soma > 0 && p < soma ? ` · desconto de ${formatMoney(soma - p, currency)}` : ''}
          {p > 0 && custo > 0 ? ` · custo ${formatMoney(custo, currency)} (${formatPercent(custo / p, currency.locale)} do preço)` : ''}
        </p>
      </div>
    </div>
  );
}
