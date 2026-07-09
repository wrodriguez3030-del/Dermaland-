"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import {
  Coins,
  TrendingUp,
  ShoppingCart,
  Users,
  Star,
  ShoppingBag,
  Receipt,
  Wallet,
  Package,
  Boxes,
  CalendarClock,
  AlertTriangle,
  ClipboardList,
  FileText,
  ShieldCheck,
  Building2,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
import { mockProformas } from "@/lib/mock-data/sales";
import { formatCurrency } from "@/lib/utils/format";

interface ReportItem {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status?: "available" | "soon";
}
interface ReportCategory {
  key: string;
  label: string;
  items: ReportItem[];
}

const CATEGORIES: ReportCategory[] = [
  {
    key: "ventas",
    label: "Ventas",
    items: [
      { title: "Resumen de ventas", description: "Ventas, ITBIS e items por período.", href: "/reportes/ventas", icon: ShoppingBag },
      { title: "Comisión ventas", description: "Comisiones por vendedor, método y sucursal.", href: "/reportes/comision-ventas", icon: HandCoins },
      { title: "Pagos recibidos", description: "Pagos por método y cajero.", href: "/pagos", icon: Wallet },
      { title: "Proformas", description: "Proformas emitidas y su estado.", href: "/proformas", icon: Receipt },
    ],
  },
  {
    key: "inventario",
    label: "Inventario",
    items: [
      { title: "Valor de inventario", description: "Existencias y valor por costo.", href: "/reportes/inventario", icon: Boxes },
      { title: "Vencimientos", description: "Lotes vencidos y próximos a vencer.", href: "/inventario/vencimientos", icon: CalendarClock },
      { title: "Bajo stock", description: "Productos en o bajo el mínimo.", href: "/inventario/bajo-stock", icon: AlertTriangle },
      { title: "Movimientos", description: "Entradas, salidas y ajustes.", href: "/inventario/movimientos", icon: ClipboardList },
    ],
  },
  {
    key: "productos",
    label: "Productos",
    items: [
      { title: "Desempeño de productos", description: "Más vendidos y rotación.", href: "/reportes/productos", icon: Package },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    items: [
      { title: "Reporte de clientes", description: "Clientes y comportamiento de compra.", href: "/reportes/clientes", icon: Users },
    ],
  },
  {
    key: "caja",
    label: "Caja",
    items: [
      { title: "Cierres de caja", description: "Aperturas, cierres y diferencias.", href: "/reportes/caja", icon: Coins },
      { title: "Inventario físico", description: "Resultados de inventarios físicos.", href: "/reportes/conteos", icon: ClipboardList },
    ],
  },
  {
    key: "dgii",
    label: "DGII",
    items: [
      { title: "DGII / e-CF", description: "Estado de comprobantes y habilitación.", href: "/dgii", icon: FileText },
      { title: "Reportes 606/607", description: "Compras y ventas para DGII.", href: "/dgii", icon: ShieldCheck, status: "soon" },
    ],
  },
  {
    key: "admin",
    label: "Administrativos",
    items: [
      { title: "Empresa", description: "Datos y configuración del negocio.", href: "/admin/empresa", icon: Building2 },
      { title: "Sucursales", description: "Desempeño por sucursal.", href: "/admin/sucursales", icon: Building2 },
    ],
  },
  {
    key: "auditoria",
    label: "Auditoría",
    items: [
      { title: "Bitácora de auditoría", description: "Acciones registradas en el sistema.", href: "/admin/auditoria", icon: ShieldCheck },
    ],
  },
];

const FAV_KEY = "dermaland.report-favorites";

function useFavorites() {
  const [favs, setFavs] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      setFavs(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFavs([]);
    }
  }, []);
  const toggle = (href: string) =>
    setFavs((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href];
      try {
        window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { favs, toggle };
}

export default function ReportesHub() {
  const { favs, toggle } = useFavorites();

  const totalSales = mockProformas.reduce((s, p) => s + p.total, 0);
  const itbis = mockProformas.reduce((s, p) => s + p.itbis, 0);
  const items = mockProformas.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  const allItems = CATEGORIES.flatMap((c) => c.items);
  const favItems = allItems.filter((i) => favs.includes(i.href));

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Consulta el desempeño de tu negocio y obtén información para tomar mejores decisiones."
        breadcrumbs={[{ label: "Reportes" }]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventas" value={formatCurrency(totalSales)} icon={Coins} tone="primary" />
        <StatCard label="ITBIS recaudado" value={formatCurrency(itbis)} icon={TrendingUp} />
        <StatCard label="Items vendidos" value={items} icon={ShoppingCart} />
        <StatCard label="Transacciones" value={mockProformas.length} icon={Receipt} />
      </div>

      {favItems.length > 0 && (
        <ReportSection
          label="Favoritos"
          items={favItems}
          favs={favs}
          onToggle={toggle}
        />
      )}

      {CATEGORIES.map((cat) => (
        <ReportSection
          key={cat.key}
          label={cat.label}
          items={cat.items}
          favs={favs}
          onToggle={toggle}
        />
      ))}
    </>
  );
}

function ReportSection({
  label,
  items,
  favs,
  onToggle,
}: {
  label: string;
  items: ReportItem[];
  favs: string[];
  onToggle: (href: string) => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-50">
        {label}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <ReportCard
            key={`${label}-${it.href}-${it.title}`}
            item={it}
            fav={favs.includes(it.href)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function ReportCard({
  item,
  fav,
  onToggle,
}: {
  item: ReportItem;
  fav: boolean;
  onToggle: (href: string) => void;
}) {
  const Icon = item.icon;
  const soon = item.status === "soon";

  const body = (
    <Card
      className={`h-full transition ${
        soon
          ? "opacity-70"
          : "hover:border-[color:var(--brand-primary)]/40 hover:shadow-sm"
      }`}
    >
      <CardContent className="flex h-full items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium leading-tight">{item.title}</h3>
            <button
              type="button"
              aria-label={fav ? "Quitar de favoritos" : "Marcar favorito"}
              title={fav ? "Quitar de favoritos" : "Marcar favorito"}
              onClick={(e) => {
                e.preventDefault();
                onToggle(item.href);
              }}
              className="shrink-0 rounded p-1 hover:bg-black/5"
            >
              <Star
                className={`h-4 w-4 ${
                  fav ? "fill-amber-400 text-amber-400" : "text-black/30"
                }`}
              />
            </button>
          </div>
          <p className="mt-0.5 text-xs opacity-70">{item.description}</p>
          <div className="mt-2">
            {soon ? (
              <Badge tone="neutral">Próximamente</Badge>
            ) : (
              <Badge tone="success">Disponible</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (soon) return body;
  return (
    <Link href={item.href} className="block">
      {body}
    </Link>
  );
}
