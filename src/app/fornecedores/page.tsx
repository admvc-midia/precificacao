import { MapPin, Phone, Plus } from 'lucide-react';

import { AjudaLink } from '@/components/ajuda-link';
import { ConfirmDelete, FormDialog } from '@/components/action-form';
import { DataList, type ListColumn, type ListRow } from '@/components/data-list';
import { SupplierFields } from '@/components/forms/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deleteSupplier, saveSupplier } from '@/lib/actions/ingredients';
import { getSuppliers } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const COLUMNS: ListColumn[] = [
  { header: 'Fornecedor' },
  { header: 'Contacto', hideBelow: 'lg' },
  { header: 'Insumos', align: 'right' },
];

export default async function FornecedoresPage() {
  const suppliers = await getSuppliers();

  const rows: ListRow[] = suppliers.map((sup) => {
    const morada = sup.address ? (
      <span className="flex items-center gap-1.5">
        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
        {sup.address}
      </span>
    ) : null;

    const telefone = sup.phone ? (
      <span className="flex items-center gap-1.5">
        <Phone className="h-3 w-3 shrink-0" aria-hidden />
        <a href={`tel:${sup.phone}`} className="hover:underline">
          {sup.phone}
        </a>
      </span>
    ) : null;

    const contagem = (
      <Badge key="q" variant="secondary">
        {sup._count.ingredients} insumo{sup._count.ingredients === 1 ? '' : 's'}
      </Badge>
    );

    return {
      id: sup.id,
      search: `${sup.name} ${sup.address ?? ''} ${sup.notes ?? ''}`,
      cells: [
        <div key="n">
          <div className="font-medium">{sup.name}</div>
          {sup.url ? (
            <a
              href={sup.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-primary hover:underline"
            >
              {sup.url.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
        </div>,
        <div key="c" className="space-y-0.5 text-xs text-muted-foreground">
          {morada}
          {telefone}
          {!morada && !telefone ? <span>—</span> : null}
        </div>,
        contagem,
      ],
      title: sup.name,
      lead: contagem,
      meta: (
        <div className="space-y-0.5">
          {morada}
          {telefone}
          {sup.notes ? <span className="block">{sup.notes}</span> : null}
        </div>
      ),
      actions: (
        <>
          <FormDialog
            action={saveSupplier}
            title={`Editar ${sup.name}`}
            submitLabel="Guardar alteracoes"
          >
            <SupplierFields supplier={sup} idPrefix={`edit-${sup.id}`} />
          </FormDialog>
          <ConfirmDelete
            action={deleteSupplier}
            fields={{ id: sup.id }}
            title={`Remover "${sup.name}"?`}
            description={
              sup._count.ingredients > 0
                ? `Os ${sup._count.ingredients} insumos deste fornecedor nao sao apagados — ficam apenas sem fornecedor atribuido.`
                : 'Esta accao nao pode ser desfeita.'
            }
          />
        </>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fornecedores
            <AjudaLink secao="fornecedores" />
          </h1>
        <p className="text-sm text-muted-foreground">
          Agrupar insumos por fornecedor e o que permite dividir a lista de compras
          por loja.
        </p>
      </header>

      <DataList
        columns={COLUMNS}
        rows={rows}
        searchPlaceholder="Procurar fornecedor…"
        empty="Ainda nao ha fornecedores. Comece pelo supermercado onde compra mais."
        toolbar={
          <FormDialog
            action={saveSupplier}
            title="Novo fornecedor"
            description="Supermercado, distribuidor ou talho."
            submitLabel="Guardar fornecedor"
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo fornecedor
              </Button>
            }
          >
            <SupplierFields idPrefix="novo" />
          </FormDialog>
        }
      />
    </div>
  );
}
