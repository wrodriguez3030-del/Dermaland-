// Descarga un blob/bytes/texto en el navegador (click sintético + objectURL).
// Solo cliente: usa document/URL. No tiene efectos fuera del navegador.

export function downloadBlob(
  filename: string,
  data: BlobPart,
  mime: string,
): void {
  if (typeof document === "undefined") return;
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
