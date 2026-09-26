"""
Espelho em Python das formulas de src/lib/pricing/, usado para verificar a
matematica de forma independente da implementacao em TypeScript.

Nao faz parte da aplicacao. Existe porque as formulas de precificacao sao a
parte onde um erro custa dinheiro real, e merecem uma segunda derivacao.

Rodar:  python tools/verify_pricing.py
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field

TOL = 1e-9

# ---------------------------------------------------------------------------
# Espelho de units.ts
# ---------------------------------------------------------------------------

TO_BASE = {"KG": ("G", 1000.0), "G": ("G", 1.0),
           "L": ("ML", 1000.0), "ML": ("ML", 1.0), "UN": ("UN", 1.0)}


def to_base(qty: float, unit: str, expected: str | None = None) -> float:
    base, factor = TO_BASE[unit]
    if expected and base != expected:
        raise ValueError(f"unidade {unit} incompativel com base {expected}")
    return qty * factor


# ---------------------------------------------------------------------------
# Espelho de cost.ts
# ---------------------------------------------------------------------------

@dataclass
class Ingredient:
    id: str
    name: str
    purchase_price: float
    purchase_qty: float
    purchase_unit: str
    fc: float = 1.0


@dataclass
class Recipe:
    id: str
    name: str
    kind: str          # BASE | PRODUCT
    yield_qty: float
    yield_unit: str    # G | ML | UN
    items: list = field(default_factory=list)   # (kind, ref_id, qty, unit)
    packaging_id: str | None = None
    delivery_packaging_id: str | None = None


def cost_per_base_unit(ing: Ingredient) -> float:
    return ing.purchase_price / to_base(ing.purchase_qty, ing.purchase_unit)


def effective_cost(ing: Ingredient) -> float:
    return cost_per_base_unit(ing) * ing.fc


def recipe_cost(rid: str, ings: dict, recs: dict, stack=None) -> dict:
    stack = stack or []
    if rid in stack:
        raise RecursionError("ciclo: " + " -> ".join(stack + [rid]))
    r = recs[rid]
    stack = stack + [rid]

    batch = 0.0
    for kind, ref, qty, unit in r.items:
        if kind == "INGREDIENT":
            ing = ings[ref]
            qty_base = to_base(qty, unit, TO_BASE[ing.purchase_unit][0])
            batch += qty_base * effective_cost(ing)
        else:
            child = recs[ref]
            child_cost = recipe_cost(ref, ings, recs, stack)
            qty_base = to_base(qty, unit, child.yield_unit)
            batch += qty_base * (child_cost["batch_food_cost"] / child.yield_qty)

    food_per_unit = batch / r.yield_qty
    pack = effective_cost(ings[r.packaging_id]) if r.packaging_id else 0.0
    dpack = (effective_cost(ings[r.delivery_packaging_id])
             if r.delivery_packaging_id else 0.0)

    return {
        "batch_food_cost": batch,
        "food_cost_per_unit": food_per_unit,
        "packaging_cost": pack,
        "delivery_packaging_cost": dpack,
        "prime_cost": food_per_unit + pack,
    }


def explode(demand: list, ings: dict, recs: dict) -> dict:
    """Explosao de insumos (MRP). demand = [(recipe_id, portions)]."""
    totals: dict[str, float] = {}

    def walk(rid: str, portions: float, stack: list):
        if rid in stack:
            raise RecursionError("ciclo")
        r = recs[rid]
        batches = portions / r.yield_qty
        for kind, ref, qty, unit in r.items:
            if kind == "INGREDIENT":
                ing = ings[ref]
                qb = to_base(qty, unit, TO_BASE[ing.purchase_unit][0])
                totals[ref] = totals.get(ref, 0.0) + qb * ing.fc * batches
            else:
                child = recs[ref]
                qb = to_base(qty, unit, child.yield_unit)
                walk(ref, qb * batches, stack + [rid])
        for pid in (r.packaging_id, r.delivery_packaging_id):
            if pid:
                totals[pid] = totals.get(pid, 0.0) + portions

    for rid, qty in demand:
        walk(rid, qty, [])
    return totals


def purchase_list(demand: list, ings: dict, recs: dict, ignore_stock=False) -> dict:
    """Espelho de purchase.ts: do que falta ao que se compra."""
    needed = explode(demand, ings, recs)
    lines, total, theoretical = {}, 0.0, 0.0

    for iid, required in needed.items():
        ing = ings[iid]
        pack = to_base(ing.purchase_qty, ing.purchase_unit)
        stock = 0.0 if ignore_stock else getattr(ing, "stock_base", 0.0)
        missing = max(0.0, required - stock)
        packs = math.ceil(missing / pack - 1e-9) if missing > 0 else 0
        cost = packs * ing.purchase_price
        theo = missing * (ing.purchase_price / pack)
        lines[iid] = {
            "required": required, "stock": stock, "missing": missing,
            "packs": packs, "purchased": packs * pack,
            "leftover": max(0.0, packs * pack - missing),
            "cost": cost, "theoretical": theo,
        }
        total += cost
        theoretical += theo

    return {"lines": lines, "total": total, "theoretical": theoretical,
            "leftover_cost": total - theoretical}


# ---------------------------------------------------------------------------
# Espelho de price.ts
# ---------------------------------------------------------------------------

@dataclass
class Params:
    vat_rate: float = 0.13
    vat_mode: str = "INCLUDED"
    fixed_cost_rate: float = 0.22
    card_fee_rate: float = 0.012
    platform_fee_rate: float = 0.0
    delivery_cost: float = 0.0


def denominator(p: Params, target_margin: float) -> float:
    on_gross = p.card_fee_rate + p.platform_fee_rate
    on_net = 1 - p.fixed_cost_rate - target_margin
    if p.vat_mode == "INCLUDED":
        return on_net / (1 + p.vat_rate) - on_gross
    return on_net - (1 + p.vat_rate) * on_gross


def solve_price(cost_total: float, p: Params, target_margin: float):
    d = denominator(p, target_margin)
    if d <= 0:
        return None
    return cost_total / d


def breakdown(price: float, food: float, packaging: float, p: Params) -> dict:
    gross = price if p.vat_mode == "INCLUDED" else price * (1 + p.vat_rate)
    net = price / (1 + p.vat_rate) if p.vat_mode == "INCLUDED" else price
    prime = food + packaging
    fixed = net * p.fixed_cost_rate
    card = gross * p.card_fee_rate
    platform = gross * p.platform_fee_rate
    profit = net - fixed - card - platform - prime - p.delivery_cost
    return {
        "price": price, "gross": gross, "net": net, "vat": gross - net,
        "food": food, "packaging": packaging, "prime": prime,
        "delivery": p.delivery_cost, "fixed": fixed, "card": card,
        "platform": platform, "profit": profit,
        "cmv": prime / net if net > 0 else 0,
        "net_margin": profit / net if net > 0 else 0,
    }


def price_from_target_cmv(food, packaging, p: Params, cmv: float) -> dict:
    net = (food + packaging) / cmv
    price = net * (1 + p.vat_rate) if p.vat_mode == "INCLUDED" else net
    return breakdown(price, food, packaging, p)


def price_from_target_margin(food, packaging, p: Params, margin: float):
    price = solve_price(food + packaging + p.delivery_cost, p, margin)
    if price is None:
        return None
    return breakdown(price, food, packaging, p)


def match_profit(target_profit, food, packaging, p: Params):
    price = solve_price(food + packaging + p.delivery_cost + target_profit, p, 0)
    if price is None:
        return None
    return breakdown(price, food, packaging, p)


def apply_rounding(price: float, strategy: str) -> float:
    if price <= 0:
        return round(price, 2)
    if strategy == "NEAREST_05":
        return round(math.ceil(price * 20) / 20, 2)
    if strategy == "NEAREST_10":
        return round(math.ceil(price * 10) / 10, 2)
    if strategy in ("ENDING_90", "ENDING_95"):
        cents = 0.90 if strategy == "ENDING_90" else 0.95
        fl = math.floor(price)
        cand = fl + cents
        return round(cand if cand >= price else fl + 1 + cents, 2)
    return round(price, 2)


# ---------------------------------------------------------------------------
# Verificacoes
# ---------------------------------------------------------------------------

PASS, FAIL = [], []


def check(name: str, condition: bool, detail: str = ""):
    (PASS if condition else FAIL).append(name)
    mark = "  ok  " if condition else " FALHA"
    print(f"[{mark}] {name}" + (f"\n         {detail}" if detail and not condition else ""))


def close(a: float, b: float, tol: float = 1e-8) -> bool:
    return abs(a - b) <= tol


# --- Cenario: uma lanchonete real ------------------------------------------

ings = {
    "carne": Ingredient("carne", "Carne picada 20% gordura", 12.50, 5, "KG", fc=1.0),
    "alcatra": Ingredient("alcatra", "Alcatra para limpar", 18.00, 1, "KG", fc=1.25),
    "pao": Ingredient("pao", "Pao de hamburguer", 3.60, 24, "UN"),
    "queijo": Ingredient("queijo", "Queijo cheddar fatiado", 6.90, 1, "KG"),
    "maionese_ovo": Ingredient("maionese_ovo", "Ovo", 2.40, 12, "UN"),
    "oleo": Ingredient("oleo", "Oleo de girassol", 2.00, 1, "L"),
    "caixa": Ingredient("caixa", "Caixa de hamburguer", 0.12, 1, "UN"),
    "saco": Ingredient("saco", "Saco de transporte", 0.08, 1, "UN"),
}

recs = {
    # Base: maionese caseira. Lote de 1200 ml.
    "maionese": Recipe("maionese", "Maionese da casa", "BASE", 1200, "ML", items=[
        ("INGREDIENT", "maionese_ovo", 4, "UN"),
        ("INGREDIENT", "oleo", 1, "L"),
    ]),
    # Produto: 1 lote = 1 porcao (o caso mais comum numa ficha tecnica).
    "burger": Recipe("burger", "Hamburguer da Casa", "PRODUCT", 1, "UN", items=[
        ("INGREDIENT", "carne", 160, "G"),
        ("INGREDIENT", "pao", 1, "UN"),
        ("INGREDIENT", "queijo", 40, "G"),
        ("RECIPE", "maionese", 30, "ML"),
    ], packaging_id="caixa", delivery_packaging_id="saco"),
}

print("=" * 72)
print("MODULO 1 — custo por unidade base e fator de correcao")
print("=" * 72)

# Pacote de 5 kg por 12,50 -> 12,50 / 5000 g = 0,0025 EUR/g
check("custo por grama de pacote 5kg/12,50 = 0,0025",
      close(cost_per_base_unit(ings["carne"]), 0.0025))

# 1 L por 2,00 -> 0,002 EUR/ml
check("custo por ml de garrafa 1L/2,00 = 0,002",
      close(cost_per_base_unit(ings["oleo"]), 0.002))

# Alcatra 18,00/kg com FC 1,25 -> 0,018 * 1,25 = 0,0225 EUR/g aproveitavel
check("FC 1,25 encarece a grama aproveitavel em 25%",
      close(effective_cost(ings["alcatra"]), 0.0225))

# FC e perda sao a mesma informacao vista de dois lados.
def waste_from_fc(fc): return 1 - 1 / fc
def fc_from_waste(w): return 1 / (1 - w)

check("FC 1,25 equivale a 20% de perda", close(waste_from_fc(1.25), 0.20))
check("20% de perda equivale a FC 1,25", close(fc_from_waste(0.20), 1.25))
check("FC <-> perda e uma bijecao (round-trip)",
      close(fc_from_waste(waste_from_fc(1.6667)), 1.6667, 1e-6))

# 1 kg bruto rendendo 800 g limpos custa, por grama util, o mesmo que
# comprar 1,25 g ao preco de compra.
check("FC: 1kg bruto -> 800g limpos custa 18,00/800g por grama util",
      close(effective_cost(ings["alcatra"]), 18.00 / 800))

print()
print("=" * 72)
print("MODULO 2 — fichas tecnicas e sub-receitas")
print("=" * 72)

mayo = recipe_cost("maionese", ings, recs)
# 4 ovos a 0,20 = 0,80 ; 1 L de oleo = 2,00 ; total 2,80 por 1200 ml
check("custo do lote de maionese = 2,80", close(mayo["batch_food_cost"], 2.80))
check("maionese custa 0,0023333/ml",
      close(mayo["batch_food_cost"] / 1200, 2.80 / 1200))

burger = recipe_cost("burger", ings, recs)
expected_food = (
    160 * 0.0025          # carne     0.40
    + 1 * (3.60 / 24)     # pao       0.15
    + 40 * (6.90 / 1000)  # queijo    0.276
    + 30 * (2.80 / 1200)  # maionese  0.07
)
check("custo de alimento do hamburguer bate com o calculo manual",
      close(burger["food_cost_per_unit"], expected_food),
      f"obtido {burger['food_cost_per_unit']:.6f}, esperado {expected_food:.6f}")
check("custo primo = alimento + embalagem principal (sem a de transporte)",
      close(burger["prime_cost"], expected_food + 0.12))
check("embalagem de transporte fica de fora do custo primo de balcao",
      close(burger["delivery_packaging_cost"], 0.08))

# Rendimento: dobrar o lote sem mexer nas quantidades deve metade o custo unitario.
recs["burger_x2"] = Recipe("burger_x2", "Lote duplo", "PRODUCT", 2, "UN",
                           items=recs["burger"].items, packaging_id="caixa")
double = recipe_cost("burger_x2", ings, recs)
check("dobrar o rendimento do lote divide o custo de alimento por 2",
      close(double["food_cost_per_unit"], burger["food_cost_per_unit"] / 2))

# Ciclo A -> B -> A tem de estourar, nao entrar em loop infinito.
recs["cycle_a"] = Recipe("cycle_a", "A", "BASE", 100, "G",
                         items=[("RECIPE", "cycle_b", 10, "G")])
recs["cycle_b"] = Recipe("cycle_b", "B", "BASE", 100, "G",
                         items=[("RECIPE", "cycle_a", 10, "G")])
try:
    recipe_cost("cycle_a", ings, recs)
    check("ciclo de sub-receitas e detetado", False, "nao levantou erro")
except RecursionError:
    check("ciclo de sub-receitas e detetado", True)

# Unidade incompativel tem de ser rejeitada.
try:
    to_base(200, "ML", "G")
    check("unidade incompativel e rejeitada", False)
except ValueError:
    check("unidade incompativel e rejeitada", True)

print()
print("=" * 72)
print("MODULO 3 — motor de precificacao")
print("=" * 72)

p = Params(vat_rate=0.13, vat_mode="INCLUDED", fixed_cost_rate=0.22,
           card_fee_rate=0.012)
food = burger["food_cost_per_unit"]
pack = burger["packaging_cost"]

# --- Identidade contabil: o preco tem de fechar exatamente.
b = breakdown(10.00, food, pack, p)
soma = (b["fixed"] + b["card"] + b["platform"] + b["prime"]
        + b["delivery"] + b["profit"])
check("identidade: receita liquida = soma de todos os custos + lucro",
      close(b["net"], soma),
      f"net={b['net']:.10f} soma={soma:.10f}")
check("identidade: bruto = liquido + IVA", close(b["gross"], b["net"] + b["vat"]))

# --- Modo margem alvo: a margem pedida tem de sair exatamente.
for margin in (0.05, 0.10, 0.15, 0.25, 0.40):
    r = price_from_target_margin(food, pack, p, margin)
    check(f"margem alvo de {margin:.0%} devolve margem liquida de {margin:.0%}",
          r is not None and close(r["net_margin"], margin),
          f"obtido {r['net_margin']:.6f}" if r else "sem preco viavel")

# --- Modo CMV alvo: o CMV pedido tem de sair exatamente.
for cmv in (0.25, 0.30, 0.35):
    r = price_from_target_cmv(food, pack, p, cmv)
    check(f"CMV alvo de {cmv:.0%} devolve CMV de {cmv:.0%}",
          close(r["cmv"], cmv), f"obtido {r['cmv']:.6f}")

# --- Os dois modos convergem quando descrevem a mesma realidade.
r_margin = price_from_target_margin(food, pack, p, 0.15)
r_cmv = price_from_target_cmv(food, pack, p, r_margin["cmv"])
check("modo CMV e modo margem dao o mesmo preco quando os alvos coincidem",
      close(r_margin["price"], r_cmv["price"], 1e-7),
      f"margem={r_margin['price']:.6f} cmv={r_cmv['price']:.6f}")

# --- Inviabilidade tem de ser detetada, nao devolver numero negativo.
impossivel = Params(vat_rate=0.23, fixed_cost_rate=0.40, card_fee_rate=0.02,
                    platform_fee_rate=0.30)
check("alvo impossivel devolve None em vez de preco negativo",
      price_from_target_margin(food, pack, impossivel, 0.30) is None)
check("denominador negativo e sinalizado",
      denominator(impossivel, 0.30) <= 0,
      f"denominador={denominator(impossivel, 0.30):.6f}")

# --- IVA: com aliquota zero, os dois modos tem de coincidir.
p_inc0 = Params(vat_rate=0.0, vat_mode="INCLUDED")
p_add0 = Params(vat_rate=0.0, vat_mode="ADDED")
check("com IVA 0%, INCLUDED e ADDED dao o mesmo preco",
      close(price_from_target_margin(food, pack, p_inc0, 0.15)["price"],
            price_from_target_margin(food, pack, p_add0, 0.15)["price"]))

# --- IVA INCLUDED: o preco de menu e o bruto; ADDED: e o liquido.
p_inc = Params(vat_rate=0.13, vat_mode="INCLUDED")
p_add = Params(vat_rate=0.13, vat_mode="ADDED")
r_inc = price_from_target_margin(food, pack, p_inc, 0.15)
r_add = price_from_target_margin(food, pack, p_add, 0.15)
check("INCLUDED: preco de menu = bruto pago pelo cliente",
      close(r_inc["price"], r_inc["gross"]))
check("ADDED: preco de menu = receita liquida",
      close(r_add["price"], r_add["net"]))
check("ambos os modos produzem a mesma receita liquida para a mesma margem",
      close(r_inc["net"], r_add["net"], 1e-6),
      f"inc={r_inc['net']:.6f} add={r_add['net']:.6f}")

# --- Custo maior nunca pode baratear o preco (monotonicidade).
precos = [price_from_target_margin(f, pack, p, 0.15)["price"]
          for f in (0.5, 1.0, 1.5, 2.0, 3.0)]
check("preco cresce monotonicamente com o custo",
      all(precos[i] < precos[i + 1] for i in range(len(precos) - 1)))

# --- Arredondamento nunca pode destruir margem: so sobe.
for strat in ("NEAREST_05", "NEAREST_10", "ENDING_90", "ENDING_95"):
    raw = r_inc["price"]
    rounded = apply_rounding(raw, strat)
    check(f"arredondamento {strat} nunca baixa o preco",
          rounded >= raw - 1e-9, f"raw={raw:.4f} -> {rounded:.4f}")

check("ENDING_90 de 7,12 = 7,90", close(apply_rounding(7.12, "ENDING_90"), 7.90))
check("ENDING_90 de 7,95 = 8,90", close(apply_rounding(7.95, "ENDING_90"), 8.90))
check("NEAREST_05 de 7,12 = 7,15", close(apply_rounding(7.12, "NEAREST_05"), 7.15))

print()
print("=" * 72)
print("MODULO 3 — simulador multi-canal")
print("=" * 72)

# Balcao: sem comissao, sem frete, sem embalagem de transporte.
counter = Params(vat_rate=0.13, fixed_cost_rate=0.22, card_fee_rate=0.012)
r_counter = price_from_target_margin(food, pack, counter, 0.15)
lucro_balcao = r_counter["profit"]

# Uber Eats: 30% de comissao, cartao ja embutido, usa embalagem de transporte.
uber = Params(vat_rate=0.13, fixed_cost_rate=0.22, card_fee_rate=0.0,
              platform_fee_rate=0.30)
pack_delivery = pack + burger["delivery_packaging_cost"]
r_uber = match_profit(lucro_balcao, food, pack_delivery, uber)

check("preco na plataforma replica o MESMO lucro em euros do balcao",
      r_uber is not None and close(r_uber["profit"], lucro_balcao, 1e-7),
      f"balcao={lucro_balcao:.6f} uber={r_uber['profit']:.6f}" if r_uber else "-")
check("preco na plataforma e maior que no balcao",
      r_uber["price"] > r_counter["price"],
      f"balcao={r_counter['price']:.2f} uber={r_uber['price']:.2f}")
check("margem PERCENTUAL na plataforma e menor que no balcao "
      "(mesmo euro sobre preco maior)",
      r_uber["net_margin"] < r_counter["net_margin"],
      f"balcao={r_counter['net_margin']:.4f} uber={r_uber['net_margin']:.4f}")

# Entrega propria: frete de 2,50 por pedido, sem comissao.
own = Params(vat_rate=0.13, fixed_cost_rate=0.22, card_fee_rate=0.012,
             delivery_cost=2.50)
r_own = match_profit(lucro_balcao, food, pack_delivery, own)
check("entrega propria replica o mesmo lucro em euros",
      close(r_own["profit"], lucro_balcao, 1e-7))
check("entrega propria: o frete de 2,50 aparece inteiro no preco",
      r_own["price"] > r_counter["price"] + 2.50,
      f"balcao={r_counter['price']:.2f} propria={r_own['price']:.2f}")

# Cobrar o mesmo preco na plataforma que no balcao destroi o lucro.
mesmo_preco = breakdown(r_counter["price"], food, pack_delivery, uber)
check("vender na plataforma ao preco de balcao reduz drasticamente o lucro",
      mesmo_preco["profit"] < lucro_balcao,
      f"lucro cai de {lucro_balcao:.2f} para {mesmo_preco['profit']:.2f}")

# Break-even: o preco que zera o lucro.
be = solve_price(food + pack, counter, 0)
be_check = breakdown(be, food, pack, counter)
check("preco de break-even zera o lucro exatamente",
      close(be_check["profit"], 0.0, 1e-9),
      f"lucro no break-even = {be_check['profit']:.12f}")
check("break-even e menor que o preco com margem alvo",
      be < r_counter["price"])

print()
print("=" * 72)
print("MODULO 4 — explosao de insumos (MRP)")
print("=" * 72)

exp = explode([("burger", 100)], ings, recs)
check("100 hamburgueres consomem 16.000 g de carne",
      close(exp["carne"], 100 * 160))
check("100 hamburgueres consomem 100 paes", close(exp["pao"], 100))
check("100 hamburgueres consomem 3.000 ml de maionese -> 2.500 ml de oleo",
      close(exp["oleo"], 100 * 30 / 1200 * 1000),
      f"obtido {exp.get('oleo', 0):.4f}")
check("100 hamburgueres consomem 10 ovos (4 ovos por 1200 ml de maionese)",
      close(exp["maionese_ovo"], 100 * 30 / 1200 * 4))
check("embalagens: 100 caixas e 100 sacos",
      close(exp["caixa"], 100) and close(exp["saco"], 100))

# A explosao tem de aplicar o fator de correcao — e o que se compra, nao o
# que se usa.
recs["bife"] = Recipe("bife", "Bife limpo", "PRODUCT", 1, "UN",
                      items=[("INGREDIENT", "alcatra", 200, "G")])
exp_fc = explode([("bife", 10)], ings, recs)
check("a lista de compras aplica o FC: 10 bifes de 200g com FC 1,25 = 2.500 g",
      close(exp_fc["alcatra"], 10 * 200 * 1.25),
      f"obtido {exp_fc['alcatra']:.2f}")

# O custo da explosao tem de bater com o custo da ficha tecnica.
custo_via_explosao = sum(
    qty * cost_per_base_unit(ings[iid]) for iid, qty in exp.items()
)
custo_via_ficha = 100 * (burger["food_cost_per_unit"]
                         + burger["packaging_cost"]
                         + burger["delivery_packaging_cost"])
check("custo total via MRP = custo total via ficha tecnica",
      close(custo_via_explosao, custo_via_ficha, 1e-7),
      f"mrp={custo_via_explosao:.6f} ficha={custo_via_ficha:.6f}")

print()
print("=" * 72)
print("MODULO 4 — lista de compras (embalagem inteira e estoque)")
print("=" * 72)

# Sem estoque: 10 hamburgueres precisam de 1600 g de carne, mas o pacote e
# de 5 kg. Compra-se 1 pacote e sobram 3400 g.
for i in ings.values():
    i.stock_base = 0.0

pl = purchase_list([("burger", 10)], ings, recs)
carne_l = pl["lines"]["carne"]
check("1600 g de necessidade num pacote de 5 kg = comprar 1 pacote",
      carne_l["packs"] == 1, f"obtido {carne_l['packs']}")
check("sobram 3400 g na despensa", close(carne_l["leftover"], 3400))
check("o custo real e o pacote inteiro (12,50), nao o consumo (4,00)",
      close(carne_l["cost"], 12.50) and close(carne_l["theoretical"], 4.00))

# 100 paes numa embalagem de 24 -> 5 embalagens.
pl100 = purchase_list([("burger", 100)], ings, recs)
check("100 paes em embalagens de 24 = 5 embalagens (120 paes)",
      pl100["lines"]["pao"]["packs"] == 5
      and close(pl100["lines"]["pao"]["purchased"], 120))

# Multiplo exato nao pode comprar um pacote a mais por erro de virgula.
pl48 = purchase_list([("burger", 48)], ings, recs)
check("48 paes = exatamente 2 embalagens, sem pacote extra por arredondamento",
      pl48["lines"]["pao"]["packs"] == 2, f"obtido {pl48['lines']['pao']['packs']}")

# Estoque desconta da falta.
ings["carne"].stock_base = 1000.0
pl_stock = purchase_list([("burger", 10)], ings, recs)
check("o estoque desconta da falta: 1600 - 1000 = 600 g",
      close(pl_stock["lines"]["carne"]["missing"], 600))
check("o desembolso com estoque e menor ou igual ao sem estoque",
      pl_stock["total"] <= pl["total"] + 1e-9)

ings["carne"].stock_base = 99999.0
pl_full = purchase_list([("burger", 10)], ings, recs)
check("estoque que cobre tudo nao compra nada desse insumo",
      pl_full["lines"]["carne"]["packs"] == 0
      and close(pl_full["lines"]["carne"]["cost"], 0))
check("estoque acima da necessidade nao gera falta negativa",
      pl_full["lines"]["carne"]["missing"] >= 0)

ings["carne"].stock_base = 0.0

# A compra nunca custa menos do que se consome.
check("a compra nunca custa menos do que o consumo",
      pl["total"] >= pl["theoretical"] - 1e-9)
check("a sobra em euros e a diferenca entre os dois",
      close(pl["leftover_cost"], pl["total"] - pl["theoretical"]))

# O fator de correcao entra antes da decisao de compra.
pl_fc = purchase_list([("bife", 10)], ings, recs)
check("FC aplicado antes de decidir a compra: 2500 g = 3 pacotes de 1 kg",
      pl_fc["lines"]["alcatra"]["packs"] == 3,
      f"obtido {pl_fc['lines']['alcatra']['packs']}")

print()
print("=" * 72)
print("Valores do cenario de exemplo")
print("=" * 72)
print(f"  Custo de alimento/porcao ....... {food:8.4f}")
print(f"  Embalagem principal ............ {pack:8.4f}")
print(f"  Custo primo (balcao) ........... {food + pack:8.4f}")
print()
print(f"  Balcao      preco {r_counter['price']:6.2f}  "
      f"CMV {r_counter['cmv']:6.1%}  lucro {r_counter['profit']:6.2f}")
print(f"  Uber Eats   preco {r_uber['price']:6.2f}  "
      f"CMV {r_uber['cmv']:6.1%}  lucro {r_uber['profit']:6.2f}")
print(f"  Entrega p.  preco {r_own['price']:6.2f}  "
      f"CMV {r_own['cmv']:6.1%}  lucro {r_own['profit']:6.2f}")
print(f"  Break-even  preco {be:6.2f}")

print()
print("=" * 72)
print(f"RESULTADO: {len(PASS)} verificacoes passaram, {len(FAIL)} falharam")
print("=" * 72)
if FAIL:
    for name in FAIL:
        print(f"  FALHOU: {name}")
    sys.exit(1)
