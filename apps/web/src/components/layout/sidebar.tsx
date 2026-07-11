"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  Boxes,
  ScanBarcode,
  ShoppingCart,
  Receipt,
  Wallet,
  CalendarClock,
  Truck,
  BarChart3,
  Shield,
  MessageSquare,
  Bot,
  Code2,
  FileText,
  Settings,
  ChevronDown,
  Pill,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { mockBusiness } from "@/lib/mock-data/tenancy";

/** Logo configurado de la empresa; si no hay, cae al logo oficial. */
const brandLogo = mockBusiness.logoUrl ?? "/brand/dermaland-logo.svg";

interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const groups: NavGroup[] = [
  {
    label: "General",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Clientes",
    icon: Users,
    items: [
      { label: "Clientes", href: "/clientes" },
      { label: "Recomendaciones", href: "/recomendaciones" },
      { label: "Rutinas", href: "/recomendaciones/rutinas" },
      { label: "Tipos de piel", href: "/recomendaciones/tipos-piel" },
      { label: "Condiciones", href: "/recomendaciones/condiciones" },
    ],
  },
  {
    label: "Ventas",
    icon: ShoppingCart,
    items: [
      // POS / Nueva venta se accede desde el botón verde en Ventas/Facturas
      // (la ruta /pos sigue existiendo y funciona por URL directa).
      { label: "Ventas", href: "/ventas" },
      { label: "Proformas", href: "/proformas" },
      { label: "Pagos", href: "/pagos" },
      { label: "Incentivos", href: "/ventas/incentivos" },
      { label: "Devoluciones", href: "/devoluciones" },
      { label: "Notas de crédito", href: "/notas-credito" },
      { label: "Caja", href: "/caja" },
    ],
  },
  {
    label: "Compras",
    icon: Truck,
    items: [
      { label: "Facturas de proveedores", href: "/compras/facturas-proveedores" },
      { label: "Pagos / gastos", href: "/compras/pagos-gastos" },
      { label: "Gastos menores", href: "/compras/gastos-menores" },
      { label: "Pagos recurrentes", href: "/compras/pagos-recurrentes" },
    ],
  },
  {
    label: "Productos",
    icon: Pill,
    items: [
      { label: "Productos", href: "/productos" },
      { label: "Categorías", href: "/productos/categorias" },
      { label: "Marcas", href: "/productos/marcas" },
      { label: "Laboratorios", href: "/productos/laboratorios" },
    ],
  },
  {
    label: "Inventario",
    icon: Boxes,
    items: [
      { label: "Stock actual", href: "/inventario" },
      { label: "Stock por lote", href: "/inventario/por-lote" },
      { label: "Movimientos", href: "/inventario/movimientos" },
      { label: "Transferencias", href: "/inventario/transferencias" },
      { label: "Vencimientos", href: "/inventario/vencimientos" },
      { label: "Bajo stock", href: "/inventario/bajo-stock" },
      { label: "Bloqueados", href: "/inventario/bloqueados" },
      { label: "Cuarentena", href: "/inventario/cuarentena" },
      { label: "Recall", href: "/inventario/recall" },
    ],
  },
  {
    label: "Inventario físico",
    icon: ScanBarcode,
    items: [
      { label: "Conteos", href: "/conteo-fisico" },
      { label: "Nuevo inventario", href: "/conteo-fisico/nuevo" },
    ],
  },
  {
    label: "Reportes",
    icon: BarChart3,
    items: [
      { label: "Dashboard reportes", href: "/reportes" },
      { label: "Ventas", href: "/reportes/ventas" },
      { label: "Inventario", href: "/reportes/inventario" },
      { label: "Caja", href: "/reportes/caja" },
      { label: "Clientes", href: "/reportes/clientes" },
      { label: "Conteos", href: "/reportes/conteos" },
      { label: "Productos", href: "/reportes/productos" },
      { label: "Comisión ventas", href: "/reportes/comision-ventas" },
    ],
  },
  {
    label: "Comunicación",
    icon: MessageSquare,
    items: [
      { label: "WhatsApp", href: "/whatsapp" },
      { label: "Conversaciones", href: "/whatsapp/conversaciones" },
      { label: "Plantillas", href: "/whatsapp/plantillas" },
    ],
  },
  {
    label: "IA",
    icon: Bot,
    items: [
      { label: "Agentes IA", href: "/ia" },
      { label: "Proveedores de IA", href: "/ia/proveedores" },
      { label: "Conversaciones", href: "/ia/conversaciones" },
      { label: "Logs y costos", href: "/ia/logs" },
    ],
  },
  {
    label: "Integraciones",
    icon: Code2,
    items: [
      { label: "API V3", href: "/api-v3" },
      { label: "API keys", href: "/api-v3/keys" },
      { label: "Webhooks", href: "/api-v3/webhooks" },
    ],
  },
  {
    label: "DGII / Facturación",
    icon: FileText,
    items: [
      { label: "Configuración de facturación", href: "/dgii/facturacion/configuracion" },
      { label: "Numeraciones / Secuencias", href: "/dgii/secuencias" },
      { label: "Reglas automáticas de e-CF", href: "/dgii/facturacion/reglas" },
      { label: "Comprobantes emitidos", href: "/dgii/facturas" },
      { label: "Ambiente e-CF", href: "/dgii/configuracion" },
      { label: "Certificado digital", href: "/dgii/certificado" },
      { label: "Logs DGII / Historial", href: "/dgii/logs" },
      { label: "Envíos a DGII", href: "/dgii/envios" },
      { label: "Activar factura electrónica", href: "/dgii/activar" },
      { label: "Habilitación", href: "/dgii/habilitacion" },
    ],
  },
  {
    label: "Administración",
    icon: Settings,
    items: [
      { label: "Empresa", href: "/admin/empresa" },
      { label: "Sucursales", href: "/admin/sucursales" },
      { label: "Usuarios", href: "/admin/usuarios" },
      { label: "Roles", href: "/admin/roles" },
      { label: "Permisos", href: "/admin/permisos" },
      { label: "Auditoría", href: "/admin/auditoria" },
      { label: "Configuración", href: "/admin/configuracion" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  className,
  showSuperAdmin = true,
}: {
  className?: string;
  showSuperAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <aside
      className={cn(
        "flex h-screen w-64 flex-col border-r border-black/5 bg-white",
        className,
      )}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 py-5 border-b border-black/5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandLogo}
          alt={mockBusiness.commercialName}
          className="h-9 w-9 shrink-0 object-contain"
        />
        <div className="text-base font-semibold leading-tight">
          {mockBusiness.commercialName}
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <SidebarGroup
            key={group.label}
            group={group}
            pathname={pathname}
          />
        ))}

        {showSuperAdmin && (
          <div className="mt-4 border-t border-black/5 pt-4">
            <Link
              href="/super-admin"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                pathname.startsWith("/super-admin")
                  ? "bg-violet-100 text-violet-900"
                  : "text-violet-700 hover:bg-violet-50",
              )}
            >
              <Shield className="h-4 w-4" />
              Súper Admin
            </Link>
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarGroup({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const groupActive = group.items.some((i) => isActive(pathname, i.href));
  const [open, setOpen] = React.useState(groupActive);

  React.useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  const Icon = group.icon;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
          groupActive
            ? "text-[color:var(--brand-fg)]"
            : "text-black/60 hover:text-[color:var(--brand-fg)]",
        )}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-9">
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-xs transition",
                    active
                      ? "bg-[color:var(--brand-primary)]/12 font-medium text-[color:var(--brand-accent)] shadow-[inset_2px_0_0_var(--brand-primary)]"
                      : "text-black/60 hover:bg-black/[0.03] hover:text-[color:var(--brand-fg)]",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
