import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MobileScanner } from "@/features/inventory-counts/mobile-scanner";
import { OfflineStatusPill } from "@/components/layout/offline-status-pill";
import { getInventoryCountById } from "@/lib/mock-data/inventory-counts";
import { getBranchById, getWarehouseById } from "@/lib/mock-data/tenancy";

export default async function ConteoMovilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const count = getInventoryCountById(id);
  if (!count) notFound();
  const branch = getBranchById(count.branchId);
  const warehouse = getWarehouseById(count.warehouseId);

  return (
    <div className="-mx-6 -my-6 lg:-mx-8 lg:-my-8">
      <div className="bg-gradient-to-b from-[color:var(--brand-bg)] via-white to-[color:var(--brand-bg)] px-3 pt-4 pb-10 min-h-screen">
        <Link
          href={`/conteo-fisico/${id}`}
          className="mx-auto mb-3 flex max-w-md items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> Salir del modo móvil
        </Link>
        <MobileScanner
          countNumber={count.countNumber}
          branchName={branch?.name ?? ""}
          warehouseName={warehouse?.name ?? ""}
        />
        <OfflineStatusPill />
      </div>
    </div>
  );
}
