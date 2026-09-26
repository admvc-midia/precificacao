import { Trash2 } from 'lucide-react';

import { ActionForm, DeleteButton, SubmitButton } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/form-controls';
import { Input, Textarea } from '@/components/ui/input';
import { deleteSupplier, saveSupplier } from '@/lib/actions/ingredients';
import { getSuppliers } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function FornecedoresPage() {
  const suppliers = await getSuppliers();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">
          Agrupar insumos por fornecedor e o que permite dividir a lista de compras
          por loja.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>
              {suppliers.length} fornecedor{suppliers.length === 1 ? '' : 'es'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda nao ha fornecedores. Comece pelo supermercado onde compra mais.
              </p>
            ) : (
              suppliers.map((sup) => (
                <div
                  key={sup.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{sup.name}</span>
                      <Badge variant="secondary">
                        {sup._count.ingredients} insumo
                        {sup._count.ingredients === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    {sup.url ? (
                      <a
                        href={sup.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {sup.url}
                      </a>
                    ) : null}
                    {sup.notes ? (
                      <p className="text-xs text-muted-foreground">{sup.notes}</p>
                    ) : null}
                  </div>

                  <ActionForm action={deleteSupplier} showSuccess={false}>
                    <input type="hidden" name="id" value={sup.id} />
                    <DeleteButton
                      confirmMessage={`Remover "${sup.name}"? Os insumos ficam sem fornecedor, mas nao sao apagados.`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </DeleteButton>
                  </ActionForm>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Novo fornecedor</CardTitle>
            <CardDescription>Supermercado, distribuidor ou talho.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveSupplier}>
              <Field label="Nome" htmlFor="sup-name">
                <Input id="sup-name" name="name" placeholder="Continente" required />
              </Field>
              <Field label="Site ou loja online" htmlFor="sup-url">
                <Input id="sup-url" name="url" type="url" placeholder="https://" />
              </Field>
              <Field label="Notas" htmlFor="sup-notes">
                <Textarea
                  id="sup-notes"
                  name="notes"
                  placeholder="Entrega as tercas. Pedido minimo 50 EUR."
                />
              </Field>
              <SubmitButton>Guardar fornecedor</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
