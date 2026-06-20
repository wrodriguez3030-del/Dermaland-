"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  Pencil,
  Trash2,
  MoreVertical,
  Ban,
  Power,
  Printer,
  Send,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Acciones por fila para tablas y cards de listados.
 *
 * Variante por defecto: dropdown compacto con tres puntos. Más limpio en
 * listados densos. Para listados cortos o expandidos, pasar `variant="inline"`.
 *
 * Convenciones:
 *  - "Ver" navega a `viewHref` (Server Component-friendly).
 *  - "Editar" navega a `editHref` o llama `onEdit`.
 *  - "Eliminar" pide confirmación con `ConfirmDialog`.
 *  - Para entidades auditables, usar `customActions` con label="Anular" y
 *    pasar `onDelete={undefined}` para ocultar el botón rojo.
 */

export interface CustomAction {
  label: string;
  icon?: LucideIcon;
  /** Acción imperativa. Opcional cuando se usa `href`. */
  onClick?: () => void | Promise<void>;
  destructive?: boolean;
  /** Para confirmación de acciones tipo "anular". */
  confirm?: { title?: string; message?: React.ReactNode };
  /** Acción visible pero no disponible para este registro/estado. */
  disabled?: boolean;
  /** Tooltip explicando por qué está deshabilitada. */
  disabledReason?: string;
  /** Si se provee, la acción navega a este destino (en vez de `onClick`). */
  href?: string;
  /** Para `href`: abrir en pestaña nueva / enlace externo (wa.me, etc.). */
  external?: boolean;
}

export interface RowActionsProps {
  /** Variante visual */
  variant?: "menu" | "inline";
  /** "Ver" — link de detalle */
  viewHref?: string;
  onView?: () => void;
  /** "Editar" — link a /editar o callback */
  editHref?: string;
  onEdit?: () => void;
  /** "Eliminar" — pide confirmación. Si `undefined`, oculta el botón. */
  onDelete?: () => void | Promise<void>;
  /** Mostrado en confirmación: "¿Eliminar a {entityName}?" */
  entityName?: string;
  /** Alias de `entityName`. */
  itemLabel?: string;
  /** Texto override del botón eliminar (ej. "Anular", "Cancelar") */
  deleteLabel?: string;
  /** Si es `false`, elimina sin diálogo de confirmación (por defecto pide). */
  confirmDelete?: boolean;
  // ── Acciones estándar de conveniencia (icon-only) ──
  onActivate?: () => void | Promise<void>;
  onDeactivate?: () => void | Promise<void>;
  onPrint?: () => void;
  onSend?: () => void;
  onDuplicate?: () => void | Promise<void>;
  /** Acciones extra (anular, liberar cuarentena, etc.) */
  customActions?: CustomAction[];
  /** Permisos */
  canView?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canActivate?: boolean;
  canDeactivate?: boolean;
  canPrint?: boolean;
  canSend?: boolean;
  canDuplicate?: boolean;
  /** Para alinear en celdas de tabla */
  align?: "start" | "end";
  className?: string;
}

export function RowActions({
  variant = "inline",
  viewHref,
  onView,
  editHref,
  onEdit,
  onDelete,
  entityName,
  itemLabel,
  deleteLabel = "Eliminar",
  confirmDelete = true,
  onActivate,
  onDeactivate,
  onPrint,
  onSend,
  onDuplicate,
  customActions = [],
  canView = true,
  canEdit = true,
  canDelete = true,
  canActivate = true,
  canDeactivate = true,
  canPrint = true,
  canSend = true,
  canDuplicate = true,
  align = "end",
  className,
}: RowActionsProps) {
  const entity = itemLabel ?? entityName;
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmCustom, setConfirmCustom] = React.useState<
    CustomAction | null
  >(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const showView = canView && (viewHref || onView);
  const showEdit = canEdit && (editHref || onEdit);
  const showDelete = canDelete && onDelete;
  const showActivate = canActivate && !!onActivate;
  const showDeactivate = canDeactivate && !!onDeactivate;
  const showPrint = canPrint && !!onPrint;
  const showSend = canSend && !!onSend;
  const showDuplicate = canDuplicate && !!onDuplicate;

  const handleDelete = async () => {
    if (!onDelete) return;
    await onDelete();
    setConfirmOpen(false);
    setOpen(false);
  };

  const handleCustom = async (a: CustomAction) => {
    if (a.confirm) {
      setConfirmCustom(a);
      setOpen(false);
      return;
    }
    await a.onClick?.();
    setOpen(false);
  };

  const runConfirmCustom = async () => {
    if (!confirmCustom) return;
    await confirmCustom.onClick?.();
    setConfirmCustom(null);
  };

  // ─── Inline variant ──
  if (variant === "inline") {
    // Botones SÓLO ícono (sin texto) para una columna de acciones compacta.
    // Se conservan `title` (tooltip) y `aria-label` (accesibilidad).
    const baseBtn =
      "inline-flex h-8 w-8 items-center justify-center rounded-md border transition";
    const ghostBtn =
      "border-black/10 text-[color:var(--brand-fg)] bg-white hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5";
    const dangerBtn =
      "border-rose-200 text-rose-700 bg-white hover:bg-rose-50";
    const ico = "h-4 w-4";

    return (
      <>
        <div
          className={cn(
            "flex flex-nowrap items-center gap-1",
            align === "end" ? "justify-end" : "justify-start",
            className,
          )}
        >
          {showView &&
            (viewHref ? (
              <Link
                href={viewHref}
                className={cn(baseBtn, ghostBtn)}
                aria-label="Ver"
                title="Ver"
              >
                <Eye className={ico} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onView}
                className={cn(baseBtn, ghostBtn)}
                aria-label="Ver"
                title="Ver"
              >
                <Eye className={ico} />
              </button>
            ))}
          {showEdit &&
            (editHref ? (
              <Link
                href={editHref}
                className={cn(baseBtn, ghostBtn)}
                aria-label="Editar"
                title="Editar"
              >
                <Pencil className={ico} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className={cn(baseBtn, ghostBtn)}
                aria-label="Editar"
                title="Editar"
              >
                <Pencil className={ico} />
              </button>
            ))}
          {showDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className={cn(baseBtn, ghostBtn)}
              aria-label="Duplicar"
              title="Duplicar"
            >
              <Copy className={ico} />
            </button>
          )}
          {showPrint && (
            <button
              type="button"
              onClick={onPrint}
              className={cn(baseBtn, ghostBtn)}
              aria-label="Imprimir"
              title="Imprimir"
            >
              <Printer className={ico} />
            </button>
          )}
          {showSend && (
            <button
              type="button"
              onClick={onSend}
              className={cn(baseBtn, ghostBtn)}
              aria-label="Enviar"
              title="Enviar"
            >
              <Send className={ico} />
            </button>
          )}
          {showActivate && (
            <button
              type="button"
              onClick={onActivate}
              className={cn(baseBtn, ghostBtn)}
              aria-label="Activar"
              title="Activar"
            >
              <Power className={ico} />
            </button>
          )}
          {showDeactivate && (
            <button
              type="button"
              onClick={onDeactivate}
              className={cn(baseBtn, ghostBtn)}
              aria-label="Inactivar"
              title="Inactivar"
            >
              <Power className={ico} />
            </button>
          )}
          {customActions.map((a) => {
            const Icon = a.icon ?? Ban;
            if (a.disabled) {
              return (
                <button
                  key={a.label}
                  type="button"
                  disabled
                  aria-label={a.label}
                  title={a.disabledReason ?? a.label}
                  className={cn(baseBtn, ghostBtn, "cursor-not-allowed opacity-40")}
                >
                  <Icon className={ico} />
                </button>
              );
            }
            if (a.href) {
              return a.external ? (
                <a
                  key={a.label}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(baseBtn, a.destructive ? dangerBtn : ghostBtn)}
                  aria-label={a.label}
                  title={a.label}
                >
                  <Icon className={ico} />
                </a>
              ) : (
                <Link
                  key={a.label}
                  href={a.href}
                  className={cn(baseBtn, a.destructive ? dangerBtn : ghostBtn)}
                  aria-label={a.label}
                  title={a.label}
                >
                  <Icon className={ico} />
                </Link>
              );
            }
            return (
              <button
                key={a.label}
                type="button"
                onClick={() => handleCustom(a)}
                className={cn(baseBtn, a.destructive ? dangerBtn : ghostBtn)}
                aria-label={a.label}
                title={a.label}
              >
                <Icon className={ico} />
              </button>
            );
          })}
          {showDelete && (
            <button
              type="button"
              onClick={() => (confirmDelete ? setConfirmOpen(true) : handleDelete())}
              className={cn(baseBtn, dangerBtn)}
              aria-label={deleteLabel}
              title={deleteLabel}
            >
              <Trash2 className={ico} />
            </button>
          )}
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title={`Confirmar ${deleteLabel.toLowerCase()}`}
          message={
            entity
              ? `¿Está seguro de que desea ${deleteLabel.toLowerCase()} a ${entity}?`
              : "¿Está seguro de que desea continuar?"
          }
          confirmLabel={deleteLabel}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
        <ConfirmDialog
          open={!!confirmCustom}
          title={confirmCustom?.confirm?.title ?? "Confirmar acción"}
          message={
            confirmCustom?.confirm?.message ??
            `¿Está seguro de que desea continuar con "${confirmCustom?.label}"?`
          }
          confirmLabel={confirmCustom?.label ?? "Confirmar"}
          destructive={!!confirmCustom?.destructive}
          onConfirm={runConfirmCustom}
          onCancel={() => setConfirmCustom(null)}
        />
      </>
    );
  }

  // ─── Menu (dropdown) variant ──
  return (
    <>
      <div
        ref={ref}
        className={cn(
          "relative inline-block",
          align === "end" ? "text-right" : "text-left",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"
          aria-label="Acciones"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <div
            role="menu"
            className={cn(
              "absolute z-30 mt-1 w-44 rounded-lg border border-black/5 bg-white py-1 shadow-lg",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {showView && (viewHref ? (
              <Link
                href={viewHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/[0.04]"
              >
                <Eye className="h-3.5 w-3.5 opacity-60" />
                Ver
              </Link>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onView?.();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.04]"
              >
                <Eye className="h-3.5 w-3.5 opacity-60" />
                Ver
              </button>
            ))}
            {showEdit && (editHref ? (
              <Link
                href={editHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/[0.04]"
              >
                <Pencil className="h-3.5 w-3.5 opacity-60" />
                Editar
              </Link>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onEdit?.();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.04]"
              >
                <Pencil className="h-3.5 w-3.5 opacity-60" />
                Editar
              </button>
            ))}
            {customActions.map((a) => {
              const Icon = a.icon ?? Ban;
              return (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => handleCustom(a)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.04]",
                    a.destructive && "text-rose-700",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 opacity-60" />
                  {a.label}
                </button>
              );
            })}
            {showDelete && (showView || showEdit || customActions.length > 0) && (
              <div className="my-1 h-px bg-black/5" />
            )}
            {showDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setConfirmOpen(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteLabel}
              </button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Confirmar ${deleteLabel.toLowerCase()}`}
        message={
          entityName
            ? `¿Está seguro de que desea ${deleteLabel.toLowerCase()} a ${entityName}? Esta acción no se puede deshacer.`
            : "¿Está seguro de que desea continuar? Esta acción no se puede deshacer."
        }
        confirmLabel={deleteLabel}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={!!confirmCustom}
        title={confirmCustom?.confirm?.title ?? "Confirmar acción"}
        message={
          confirmCustom?.confirm?.message ??
          `¿Está seguro de que desea continuar con "${confirmCustom?.label}"?`
        }
        confirmLabel={confirmCustom?.label ?? "Confirmar"}
        destructive={!!confirmCustom?.destructive}
        onConfirm={runConfirmCustom}
        onCancel={() => setConfirmCustom(null)}
      />
    </>
  );
}
