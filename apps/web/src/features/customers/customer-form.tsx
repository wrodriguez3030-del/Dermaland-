"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldAlert, UserCheck, X } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  Textarea,
  HelpText,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import {
  billingTypeEcf,
  billingTypeOptions,
  skinTypeOptions,
} from "@/features/customers/billing";
import {
  formatDominicanPhone,
  formatPassport,
  normalizeDocumentByType,
  softValidateDocument,
  softValidatePhone,
  type DocumentType,
} from "@/lib/utils/formatters";
import {
  describeMatch,
  duplicateMessage,
  findPotentialDuplicateClients,
  type DuplicateDetectionResult,
} from "@/features/customers/utils/duplicate-detection";
import {
  listAllCustomers,
  saveCustomer,
  useCustomers,
} from "@/features/customers/customer-store";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import type { Customer, CustomerSkinType, DefaultBillingType } from "@/types";

const docPlaceholder: Record<DocumentType, string> = {
  cedula: "000-0000000-0",
  rnc: "000-00000-0",
  passport: "AB123456",
};

type SourceType = Customer["source"];

interface FormState {
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  billingType: DefaultBillingType;
  birthDate: string;
  phone: string;
  whatsapp: string;
  email: string;
  source: SourceType;
  address: string;
  city: string;
  province: string;
  skinType: CustomerSkinType;
  notes: string;
  consentPrivacy: boolean;
  consentMarketing: boolean;
  consentShareHistory: boolean;
}

const emptyState: FormState = {
  firstName: "",
  lastName: "",
  documentType: "cedula",
  documentNumber: "",
  billingType: "consumo",
  birthDate: "",
  phone: "",
  whatsapp: "",
  email: "",
  source: "manual",
  address: "",
  city: "",
  province: "",
  skinType: "not_specified",
  notes: "",
  consentPrivacy: true,
  consentMarketing: false,
  consentShareHistory: false,
};

function stateFromCustomer(c: Customer): FormState {
  const consentSet = new Set(c.consents.map((cn) => cn.templateId));
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    documentType: (c.documentType ?? "cedula") as DocumentType,
    documentNumber: c.documentNumber ?? "",
    billingType: c.defaultBillingType,
    birthDate: c.birthDate ?? "",
    phone: c.phone ?? "",
    whatsapp: c.whatsapp ?? "",
    email: c.email ?? "",
    source: c.source,
    address: c.address ?? "",
    city: c.city ?? "",
    province: c.province ?? "",
    skinType: c.skinType,
    notes: c.notes ?? "",
    consentPrivacy: consentSet.has("privacy"),
    consentMarketing: consentSet.has("marketing"),
    consentShareHistory: consentSet.has("share_history"),
  };
}

export interface CustomerFormProps {
  /** "create" → llama createCustomer; "edit" → llama updateCustomer. */
  mode: "create" | "edit";
  /** Cliente existente cuando mode === "edit". */
  initial?: Customer;
}

/**
 * Formulario unificado para crear y editar clientes.
 *
 * - En modo `create`: parte de `emptyState` y persiste con `createCustomer`.
 * - En modo `edit`: parte de los datos del cliente y persiste con
 *   `updateCustomer`. Usa `excludeClientId` para que no se detecte como
 *   duplicado de sí mismo.
 *
 * Tras guardar redirige a `/clientes/{id}` y muestra un toast de éxito.
 */
export function CustomerForm({ mode, initial }: CustomerFormProps) {
  const router = useRouter();
  const customers = useCustomers(); // reactivo

  const baseState = React.useMemo(
    () => (initial ? stateFromCustomer(initial) : emptyState),
    [initial],
  );

  const [firstName, setFirstName] = React.useState(baseState.firstName);
  const [lastName, setLastName] = React.useState(baseState.lastName);
  const [documentType, setDocumentType] = React.useState<DocumentType>(
    baseState.documentType,
  );
  const [documentNumber, setDocumentNumber] = React.useState(
    baseState.documentNumber,
  );
  const [billingType, setBillingType] = React.useState<DefaultBillingType>(
    baseState.billingType,
  );
  const [birthDate, setBirthDate] = React.useState(baseState.birthDate);
  const [phone, setPhone] = React.useState(baseState.phone);
  const [whatsapp, setWhatsapp] = React.useState(baseState.whatsapp);
  const [email, setEmail] = React.useState(baseState.email);
  const [source, setSource] = React.useState<SourceType>(baseState.source);
  const [address, setAddress] = React.useState(baseState.address);
  const [city, setCity] = React.useState(baseState.city);
  const [province, setProvince] = React.useState(baseState.province);
  const [skinType, setSkinType] = React.useState<CustomerSkinType>(
    baseState.skinType,
  );
  const [notes, setNotes] = React.useState(baseState.notes);
  const [consentPrivacy, setConsentPrivacy] = React.useState(
    baseState.consentPrivacy,
  );
  const [consentMarketing, setConsentMarketing] = React.useState(
    baseState.consentMarketing,
  );
  const [consentShareHistory, setConsentShareHistory] = React.useState(
    baseState.consentShareHistory,
  );

  const [showDupModal, setShowDupModal] = React.useState(false);
  const [savedToast, setSavedToast] = React.useState<string | null>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [missingFields, setMissingFields] = React.useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setFirstName(baseState.firstName);
    setLastName(baseState.lastName);
    setDocumentType(baseState.documentType);
    setDocumentNumber(baseState.documentNumber);
    setBillingType(baseState.billingType);
    setBirthDate(baseState.birthDate);
    setPhone(baseState.phone);
    setWhatsapp(baseState.whatsapp);
    setEmail(baseState.email);
    setSource(baseState.source);
    setAddress(baseState.address);
    setCity(baseState.city);
    setProvince(baseState.province);
    setSkinType(baseState.skinType);
    setNotes(baseState.notes);
    setConsentPrivacy(baseState.consentPrivacy);
    setConsentMarketing(baseState.consentMarketing);
    setConsentShareHistory(baseState.consentShareHistory);
    setMissingFields(new Set());
    setErrorBanner(null);
  }, [baseState]);

  const handleDocumentTypeChange = (next: DocumentType) => {
    setDocumentType(next);
    setDocumentNumber((prev) => normalizeDocumentByType(prev, next));
  };

  const handleDocumentChange = (raw: string) => {
    setDocumentNumber(normalizeDocumentByType(raw, documentType));
  };

  const handlePhoneChange = (raw: string) =>
    setPhone(formatDominicanPhone(raw));
  const handleWaChange = (raw: string) =>
    setWhatsapp(formatDominicanPhone(raw));

  // Detección en vivo (incluye clientes locales recién creados/editados).
  const candidate = {
    firstName,
    lastName,
    phone,
    whatsapp,
    email,
    documentNumber,
    birthDate,
    businessId: initial?.businessId ?? mockBusiness.id,
  };
  const duplicate: DuplicateDetectionResult = React.useMemo(
    () =>
      findPotentialDuplicateClients(candidate, customers, {
        excludeClientId: mode === "edit" ? initial?.id : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      firstName,
      lastName,
      phone,
      whatsapp,
      email,
      documentNumber,
      birthDate,
      customers,
      mode,
      initial?.id,
    ],
  );

  const docError = softValidateDocument(documentNumber, documentType);
  const phoneError = softValidatePhone(phone);
  const waError = softValidatePhone(whatsapp);

  const liveHints = useFieldHints(
    { documentNumber, phone, whatsapp, email },
    customers,
    mode === "edit" ? initial?.id : undefined,
  );

  const billingNeedsRnc =
    billingType === "credito_fiscal" &&
    (!documentNumber || documentType !== "rnc");

  const buildConsents = () =>
    [
      consentPrivacy && {
        templateId: "privacy",
        grantedAt: new Date().toISOString(),
      },
      consentMarketing && {
        templateId: "marketing",
        grantedAt: new Date().toISOString(),
      },
      consentShareHistory && {
        templateId: "share_history",
        grantedAt: new Date().toISOString(),
      },
    ].filter(
      (x): x is { templateId: string; grantedAt: string } => Boolean(x),
    );

  const performSave = async (force: boolean) => {
    setSubmitting(true);
    setErrorBanner(null);

    const payload = {
      firstName,
      lastName,
      documentType,
      documentNumber,
      defaultBillingType: billingType,
      birthDate,
      phone,
      whatsapp,
      email,
      address,
      city,
      province,
      source,
      skinType,
      notes,
      tags: initial?.tags ?? [],
      consents: buildConsents(),
      businessId: initial?.businessId ?? mockBusiness.id,
    };

    const result = await saveCustomer(
      mode === "edit" && initial ? "edit" : "create",
      payload,
      mode === "edit" && initial ? initial.id : undefined,
      { force },
    );

    setSubmitting(false);

    if (result.ok) {
      const successMsg =
        mode === "edit"
          ? `Cliente actualizado correctamente · ${result.customer.customerNumber}`
          : `Cliente guardado correctamente · ${result.customer.customerNumber}`;
      setSavedToast(successMsg);
      const id = result.customer.id;
      setTimeout(() => router.push(`/clientes/${id}`), 600);
      return;
    }

    if (result.missingFields && result.missingFields.length > 0) {
      setMissingFields(new Set(result.missingFields));
      setErrorBanner(result.error);
      return;
    }
    if (result.duplicate) {
      setShowDupModal(true);
      return;
    }
    setErrorBanner(
      result.error ||
        "No se pudo guardar el cliente. Revise los datos e intente nuevamente.",
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performSave(false);
  };

  const handleSaveAnyway = () => {
    setShowDupModal(false);
    void performSave(true);
  };

  const isMissing = (field: string) => missingFields.has(field);

  const submitLabel =
    mode === "edit"
      ? submitting
        ? "Guardando…"
        : "Guardar cambios"
      : submitting
        ? "Guardando…"
        : "Guardar cliente";
  const cancelHref = mode === "edit" && initial ? `/clientes/${initial.id}` : "/clientes";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-6 flex items-center justify-end gap-2">
        {mode === "edit" ? (
          <Link href={cancelHref}>
            <Button type="button" variant="outline" size="sm">
              Cancelar
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={submitting}
          >
            Limpiar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={submitting}>
          {submitLabel}
        </Button>
      </div>

      {errorBanner && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div className="text-sm">{errorBanner}</div>
        </div>
      )}

      {duplicate.isDuplicate && duplicate.topConfidence && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-2xl border p-4 ${
            duplicate.topConfidence === "high"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {duplicate.topConfidence === "high" ? (
            <ShieldAlert className="mt-0.5 h-5 w-5" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {duplicateMessage(duplicate.topConfidence)}
            </h3>
            <ul className="mt-2 space-y-1 text-xs">
              {duplicate.matches.slice(0, 3).map((m) => (
                <li key={m.customer.id} className="flex items-center gap-2">
                  <Badge
                    tone={m.confidence === "high" ? "danger" : "warning"}
                    outlined
                  >
                    {m.confidence}
                  </Badge>
                  <span className="font-medium">
                    {m.customer.firstName} {m.customer.lastName}
                  </span>
                  <span className="opacity-70">·</span>
                  <span>{describeMatch(m)}</span>
                  <Link
                    href={`/clientes/${m.customer.id}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-current px-2 py-0.5 text-[10px] hover:bg-white/50"
                  >
                    <UserCheck className="h-3 w-3" />
                    Ver cliente existente
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="p-6">
          <FormSection title="Identidad" description="Nombre y documento.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombres *</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="María Fernanda"
                  className={
                    isMissing("firstName") ? "border-rose-400" : undefined
                  }
                />
                {isMissing("firstName") && (
                  <HelpText className="text-rose-700">
                    Nombres es requerido.
                  </HelpText>
                )}
              </div>
              <div>
                <Label>Apellidos *</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Cabral"
                  className={
                    isMissing("lastName") ? "border-rose-400" : undefined
                  }
                />
                {isMissing("lastName") && (
                  <HelpText className="text-rose-700">
                    Apellidos es requerido.
                  </HelpText>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Tipo de documento</Label>
                <Select
                  value={documentType}
                  onChange={(e) =>
                    handleDocumentTypeChange(e.target.value as DocumentType)
                  }
                >
                  <option value="cedula">Cédula</option>
                  <option value="rnc">RNC</option>
                  <option value="passport">Pasaporte</option>
                </Select>
              </div>
              <div>
                <Label>Número</Label>
                <Input
                  value={documentNumber}
                  onChange={(e) =>
                    documentType === "passport"
                      ? setDocumentNumber(formatPassport(e.target.value))
                      : handleDocumentChange(e.target.value)
                  }
                  placeholder={docPlaceholder[documentType]}
                  inputMode={documentType === "passport" ? "text" : "numeric"}
                  autoComplete="off"
                />
                {docError && (
                  <HelpText className="text-amber-700">{docError}</HelpText>
                )}
                {liveHints.documentNumber && (
                  <HelpText className="text-rose-700">
                    {liveHints.documentNumber}
                  </HelpText>
                )}
              </div>
              <div>
                <Label>Tipo de facturación</Label>
                <Select
                  value={billingType}
                  onChange={(e) =>
                    setBillingType(e.target.value as DefaultBillingType)
                  }
                >
                  {billingTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <HelpText>
                  {billingTypeEcf(billingType)}
                  {billingNeedsRnc && (
                    <span className="ml-1 text-amber-700">
                      · Para crédito fiscal se recomienda RNC válido.
                    </span>
                  )}
                </HelpText>
              </div>
            </div>
            <div>
              <Label>Fecha de nacimiento</Label>
              <Input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </FormSection>

          <FormSection title="Contacto" description="Teléfono, email, dirección.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono *</Label>
                <Input
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="809-555-0000"
                  inputMode="tel"
                  autoComplete="off"
                  className={
                    isMissing("phoneOrWhatsapp") ? "border-rose-400" : undefined
                  }
                />
                {phoneError && (
                  <HelpText className="text-amber-700">{phoneError}</HelpText>
                )}
                {liveHints.phone && (
                  <HelpText className="text-rose-700">{liveHints.phone}</HelpText>
                )}
              </div>
              <div>
                <Label>WhatsApp *</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => handleWaChange(e.target.value)}
                  placeholder="809-555-0000"
                  inputMode="tel"
                  autoComplete="off"
                  className={
                    isMissing("phoneOrWhatsapp") ? "border-rose-400" : undefined
                  }
                />
                {waError && (
                  <HelpText className="text-amber-700">{waError}</HelpText>
                )}
                {liveHints.whatsapp && (
                  <HelpText className="text-rose-700">
                    {liveHints.whatsapp}
                  </HelpText>
                )}
              </div>
              {isMissing("phoneOrWhatsapp") && (
                <div className="-mt-2 sm:col-span-2">
                  <HelpText className="text-rose-700">
                    Debes ingresar al menos teléfono o WhatsApp.
                  </HelpText>
                </div>
              )}
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoComplete="off"
                />
                {liveHints.email && (
                  <HelpText className="text-rose-700">{liveHints.email}</HelpText>
                )}
              </div>
              <div>
                <Label>Fuente</Label>
                <Select
                  value={source}
                  onChange={(e) => setSource(e.target.value as SourceType)}
                >
                  <option value="manual">Manual</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="web">Web</option>
                  <option value="import">Importación</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Dirección</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle… No. … sector"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Santiago"
                />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Santiago"
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Segmentación"
            description="Tipo de piel y notas internas. El tipo de piel alimenta el módulo de recomendaciones."
          >
            <div>
              <Label>Tipo de piel</Label>
              <Select
                value={skinType}
                onChange={(e) =>
                  setSkinType(e.target.value as CustomerSkinType)
                }
              >
                {skinTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <HelpText>
                Campo estructurado — alimenta el módulo de Recomendaciones
                dermatológicas.
              </HelpText>
            </div>
            <div>
              <Label>Notas internas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cliente con sensibilidad a perfumes…"
              />
            </div>
          </FormSection>

          <FormSection
            title="Consentimientos"
            description="Política de privacidad y marketing."
          >
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consentPrivacy}
                  onChange={(e) => setConsentPrivacy(e.target.checked)}
                />
                <span className="text-sm">Política de privacidad y datos</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consentMarketing}
                  onChange={(e) => setConsentMarketing(e.target.checked)}
                />
                <span className="text-sm">Marketing por WhatsApp / email</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consentShareHistory}
                  onChange={(e) => setConsentShareHistory(e.target.checked)}
                />
                <span className="text-sm">
                  Compartir historial con dermatóloga aliada
                </span>
              </label>
            </div>
          </FormSection>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        {mode === "edit" ? (
          <Link href={cancelHref}>
            <Button type="button" variant="outline" size="sm">
              Cancelar
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={submitting}
          >
            Limpiar
          </Button>
        )}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitLabel}
        </Button>
      </div>

      {showDupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDupModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2 className="text-base font-semibold">
                  {duplicateMessage(duplicate.topConfidence)}
                </h2>
                <p className="mt-1 text-xs opacity-60">
                  Encontramos {duplicate.matches.length}{" "}
                  {duplicate.matches.length === 1
                    ? "coincidencia"
                    : "coincidencias"}{" "}
                  en este negocio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDupModal(false)}
                className="opacity-50 hover:opacity-100"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {duplicate.matches.map((m) => (
                <li
                  key={m.customer.id}
                  className="rounded-lg border border-black/5 bg-[color:var(--brand-bg)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {m.customer.firstName} {m.customer.lastName}{" "}
                        <span className="opacity-60 font-mono text-xs">
                          {m.customer.customerNumber}
                        </span>
                      </div>
                      <div className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] opacity-70">
                        {m.customer.phone && <span>📞 {m.customer.phone}</span>}
                        {m.customer.email && <span>✉ {m.customer.email}</span>}
                        {m.customer.documentNumber && (
                          <span>🆔 {m.customer.documentNumber}</span>
                        )}
                        {m.customer.birthDate && (
                          <span>🎂 {m.customer.birthDate}</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs">
                        <Badge
                          tone={m.confidence === "high" ? "danger" : "warning"}
                        >
                          {m.confidence}
                        </Badge>{" "}
                        {describeMatch(m)}
                      </p>
                    </div>
                    <Link
                      href={`/clientes/${m.customer.id}`}
                      className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:border-[color:var(--brand-primary)]/40"
                    >
                      Ver cliente
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDupModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  duplicate.topConfidence === "low" ? "primary" : "danger"
                }
                onClick={handleSaveAnyway}
              >
                {duplicate.topConfidence === "low"
                  ? "Guardar de todos modos"
                  : "Guardar de todos modos (admin)"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg">
          ✓ {savedToast}
        </div>
      )}
    </form>
  );
}

/**
 * Hint inline por campo único — excluye el cliente actual cuando se está
 * editando para evitar falso positivo "ya existe un cliente con este X".
 */
function useFieldHints(
  values: {
    documentNumber: string;
    phone: string;
    whatsapp: string;
    email: string;
  },
  pool: Customer[] = listAllCustomers(),
  excludeClientId?: string,
) {
  return React.useMemo(() => {
    const checkField = (
      key: "documentNumber" | "phone" | "whatsapp" | "email",
    ): string | null => {
      const value = values[key];
      if (!value || value.length < 3) return null;
      const r = findPotentialDuplicateClients(
        {
          [key]: value,
          businessId: mockBusiness.id,
        } as Parameters<typeof findPotentialDuplicateClients>[0],
        pool,
        { excludeClientId },
      );
      const match = r.matches[0];
      if (!match || match.confidence !== "high") return null;
      const fieldHit = match.reasons[0];
      const labelMap: Record<typeof key, string> = {
        documentNumber: "documento",
        phone: "teléfono",
        whatsapp: "WhatsApp",
        email: "email",
      };
      if (fieldHit && fieldHit.toLowerCase().includes(labelMap[key])) {
        return `Ya existe un cliente con este ${labelMap[key]}.`;
      }
      return null;
    };

    return {
      documentNumber: checkField("documentNumber"),
      phone: checkField("phone"),
      whatsapp: checkField("whatsapp"),
      email: checkField("email"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values.documentNumber,
    values.phone,
    values.whatsapp,
    values.email,
    pool,
    excludeClientId,
  ]);
}
