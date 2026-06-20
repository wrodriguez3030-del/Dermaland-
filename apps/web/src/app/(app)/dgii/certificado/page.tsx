import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui";
import { ExternalLink } from "lucide-react";
import { isCertificateUploadEnabled } from "@/lib/env";
import { loadActiveCertificateAction } from "@/features/dgii/certificate-actions";
import { CertificadoReal } from "@/features/dgii/components/certificado-real";
import { CertificadoSimulado } from "@/features/dgii/components/certificado-simulado";

/**
 * /dgii/certificado — pantalla del certificado digital DGII.
 *
 * Modos:
 *  - **Modo real (Fase F)**: cuando `DATA_SOURCE=supabase` y existe
 *    `DGII_CERT_ENCRYPTION_KEY`. El form sube un `.p12` real a un API
 *    server-only; el blob y la password se cifran con AES-256-GCM
 *    antes de tocar Postgres.
 *  - **Modo simulado (mock/demo)**: cuando faltan las env vars o
 *    `DATA_SOURCE=mock`. La UI permite transicionar estados en
 *    `certificate-status-store` (localStorage) sin tocar archivos.
 *
 * Server component que decide el modo y delega al subcomponente
 * adecuado.
 */
export default async function CertificadoPage() {
  const enabled = isCertificateUploadEnabled();
  const active = enabled ? await loadActiveCertificateAction() : null;

  return (
    <>
      <PageHeader
        title="Certificado digital"
        description={
          enabled
            ? "Subida real del certificado DGII (Fase F) en Preview Supabase. El archivo y la contraseña se cifran con AES-256-GCM antes de persistirse."
            : "Modo MOCK / DEMO. El archivo no se procesa; solo se simula el estado del certificado para que el wizard avance."
        }
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Certificado" },
        ]}
        actions={
          <Link href="/dgii/habilitacion">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" />
              Volver al wizard
            </Button>
          </Link>
        }
      />

      {enabled ? (
        <CertificadoReal initialCertificate={active} />
      ) : (
        <CertificadoSimulado />
      )}
    </>
  );
}
