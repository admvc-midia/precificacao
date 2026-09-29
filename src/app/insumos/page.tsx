import { Plus, Upload } from 'lucide-react';

import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { GroupedList, type ListColumn, type ListRow } from '@/components/data-list';
import { CsvImport } from '@/components/forms/csv-import';
import { IngredientForm } from '@/components/forms/ingredient-form';
import {
  IngredientDialog,
  type PriceRow,
} from '@/components/forms/ingredient-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { importIngredientsCsv } from '@/lib/actions/import';
import { deleteOffer, saveOffer, setOfferInUse } from '@/lib/actions/offers';
import { deleteIngredient, saveIngredient } from '@/lib/actions/ingredients';
import { num, toIngredientFormValues, toIngredientInput } from '@/lib/mappers';
import { formatMoney, formatPercent, formatUnitCost } from '@/lib/money';
import {
  costPerBaseUnit,
  effectiveCostPerBaseUnit,
  wastePercentFromFc,
} from '@/lib/pricing/cost';
import { getIngredients, getSettings, getSuppliers } from '@/lib/queries';
import { rankOffers } from '@/lib/pricing/offers';
import { BASE_UNIT_LABEL, compatibleUnits, UNIT_LABEL } from '@/lib/units';

export const dynamic = 'force-dynamic';

type IngredientRow = Awaited<ReturnType<typeof getIngredients>>[number];
type SupplierRow = Awaited<ReturnType<typeof getSuppliers>>[number];

const COLUMNS: ListColumn[] = [
  { header: 'Insumo' },
  { header: 'Compra', hideBelow: 'lg' },
  { header: 'Custo base', align: 'right', hideBelow: 'xl' },
  { header: 'Perda', align: 'right' },
  { header: 'Custo real', align: 'right' },
];

export default async function InsumosPage() {
  const [rows, suppliers, s] = await Promise.all([
    getIngredients(),
    getSuppliers(),
    getSettings(),
  ]);
  const currency = { currency: s.currency, locale: s.locale };

  const build = (row: IngredientRow): ListRow => {
    const input = toIngredientInput(row);
    const raw = costPerBaseUnit(input);
    const real = effectiveCostPerBaseUnit(input);
    const waste = wastePercentFromFc(input.correctionFactor);
    const unit = BASE_UNIT_LABEL[row.baseUnit];

    const compra = `${formatMoney(num(row.purchasePrice), currency)} / ${num(
      row.purchaseQty,
    )} ${UNIT_LABEL[row.purchaseUnit]}`;

    const perdaBadge =
      waste > 0 ? (
        <Badge key="p" variant="warning">{formatPercent(waste, currency.locale, 0)}</Badge>
      ) : (
        <span key="p" className="text-muted-foreground">—</span>
      );

    // Precos de outros fornecedores, ja ordenados do mais barato ao mais caro.
    const ranked = rankOffers(
      row.offers.map((o) => ({
        id: o.id,
        supplierId: o.supplierId,
        supplierName: o.supplier?.name ?? 'Sem fornecedor',
        purchasePrice: num(o.purchasePrice),
        purchaseQty: num(o.purchaseQty),
        purchaseUnit: o.purchaseUnit,
        inUse: o.inUse,
      })),
    );

    const priceRows: PriceRow[] = ranked.map((o) => ({
      id: o.id,
      supplierName: o.supplierName,
      packLabel: `${formatMoney(o.purchasePrice, currency)} / ${o.purchaseQty} ${UNIT_LABEL[o.purchaseUnit]}`,
      unitCostLabel: `${formatUnitCost(o.unitCost, currency)}/${unit}`,
      cheapest: o.cheapest,
      inUse: o.inUse,
      premiumLabel: o.premium > 0.0001
        ? formatPercent(o.premium, currency.locale, 0)
        : null,
    }));

    const maisBarato = ranked.find((o) => o.cheapest);
    const poupanca =
      maisBarato && raw > 0 && maisBarato.unitCost < raw ? 1 - maisBarato.unitCost / raw : 0;

    const acoes = (
      <>
        <IngredientDialog
          ingredient={toIngredientFormValues(row)}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          unitOptions={compatibleUnits(row.baseUnit).map((u) => ({
            value: u,
            label: UNIT_LABEL[u],
          }))}
          prices={priceRows}
          saveIngredient={saveIngredient}
          saveOffer={saveOffer}
          deleteOffer={deleteOffer}
          setOfferInUse={setOfferInUse}
        />

        <ConfirmDelete
          action={deleteIngredient}
          fields={{ id: row.id }}
          title={`Remover "${row.name}"?`}
          description="Esta accao nao pode ser desfeita. O historico de cotacoes deste insumo tambem se perde."
        />
      </>
    );

    return {
      id: row.id,
      // A busca apanha tambem o fornecedor: "continente" encontra tudo o que
      // se compra la, sem precisar de um filtro separado.
      search: `${row.name} ${row.supplier?.name ?? ''} ${row.sku ?? ''}`,
      cells: [
        <div key="n">
          <div className="font-medium">{row.name}</div>
          {row.supplier ? (
            <div className="text-xs text-muted-foreground">{row.supplier.name}</div>
          ) : null}
        </div>,
        <span key="c" className="whitespace-nowrap text-muted-foreground">
          {compra}
        </span>,
        <span key="b" className="text-muted-foreground">
          {formatUnitCost(raw, currency)}/{unit}
        </span>,
        perdaBadge,
        <span key="r" className="font-medium">
          {formatUnitCost(real, currency)}/{unit}
        </span>,
      ],
      title: row.name,
      lead: (
        <span className="font-medium">
          {formatUnitCost(real, currency)}/{unit}
        </span>
      ),
      meta: (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {row.supplier ? <>{row.supplier.name} · </> : null}
          {compra}
          {waste > 0 ? <> · {perdaBadge}</> : null}
          {poupanca > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {' '}
              · ha {formatPercent(poupanca, currency.locale, 0)} mais barato em{' '}
              {maisBarato!.supplierName}
            </span>
          ) : null}
        </span>
      ),
      actions: acoes,
    };
  };

  const food = rows.filter((r) => r.category === 'FOOD').map(build);
  const packaging = rows.filter((r) => r.category === 'PACKAGING').map(build);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Insumos e embalagens</h1>
        <p className="text-sm text-muted-foreground">
          A base de todos os custos. O que estiver errado aqui fica errado em todas
          as fichas tecnicas.
        </p>
      </header>

      <GroupedList
        storageKey="insumos"
        searchPlaceholder="Procurar insumo ou fornecedor…"
        toolbar={
          <div className="flex gap-2">
            <CsvImport
              action={importIngredientsCsv}
              trigger={
                <Button variant="outline" className="flex-1 sm:flex-none">
                  <Upload className="h-4 w-4" />
                  Importar CSV
                </Button>
              }
            />
            <NovoInsumo suppliers={suppliers} />
          </div>
        }
        groups={[
          {
            id: 'food',
            title: 'Insumos alimenticios',
            columns: COLUMNS,
            rows: food,
            empty: 'Nenhum insumo cadastrado.',
          },
          {
            id: 'packaging',
            title: 'Embalagens e descartaveis',
            columns: COLUMNS,
            rows: packaging,
            empty:
              'Nenhuma embalagem cadastrada. Sem elas o custo do delivery fica subestimado.',
          },
        ]}
      />
    </div>
  );
}

function NovoInsumo({ suppliers }: { suppliers: SupplierRow[] }) {
  return (
    <FormDialog
      action={saveIngredient}
      title="Novo insumo"
      description="Informe o que pagou e o tamanho da embalagem: o custo por grama sai sozinho."
      submitLabel="Guardar insumo"
      trigger={
        <Button className="flex-1 sm:flex-none">
          <Plus className="h-4 w-4" />
          Novo insumo
        </Button>
      }
    >
      <IngredientForm
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        idPrefix="novo"
      />
    </FormDialog>
  );
}
