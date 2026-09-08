import "server-only";

/**
 * `Server-Timing`: cuánto tardó CADA parte de una respuesta, medido en el
 * servidor y visible en la pestaña Red del navegador.
 *
 * 🔴 Por qué existe. El panel tardaba «un par de segundos» y las tres primeras
 * explicaciones que se dieron —el tamaño del JSON, un índice que faltaba, las
 * consultas del histórico— resultaron ser falsas: el JSON viaja comprimido, el
 * índice lo dejó MÁS lento, y las cinco consultas juntas cuestan ~300 ms.
 * Desde el navegador no se puede saber qué parte del segundo es red, cuál es
 * arranque de la función, cuál es la comprobación de sesión y cuál la base.
 * Esto lo dice, y así la siguiente optimización no vuelve a ser una corazonada.
 *
 * No lleva ningún dato del negocio: solo nombres de etapa y milisegundos. Se
 * puede dejar puesto en producción.
 */
export class Cronometro {
  private readonly inicio = performance.now();
  private readonly etapas: Array<[string, number]> = [];
  private marca = performance.now();

  /** Cierra una etapa y la nombra. El reloj sigue para la siguiente. */
  fin(etapa: string): void {
    const ahora = performance.now();
    this.etapas.push([etapa, ahora - this.marca]);
    this.marca = ahora;
  }

  /**
   * Mide una promesa sin tener que llamar a `fin` a mano.
   *
   * 🔴 NO mueve la marca de `fin`. Estas medidas son para trabajos que corren
   * EN PARALELO: si cada una reiniciara el reloj, el `fin("base")` de después
   * mediría desde que acabó la última en terminar —casi cero— y el tramo que de
   * verdad interesa desaparecería de la cabecera.
   */
  async medir<T>(etapa: string, trabajo: Promise<T>): Promise<T> {
    const antes = performance.now();
    try {
      return await trabajo;
    } finally {
      this.etapas.push([etapa, performance.now() - antes]);
    }
  }

  /**
   * La cabecera lista para poner en la respuesta. El total va SIEMPRE, aunque
   * no se haya nombrado ninguna etapa: sin él no se distingue «la función tardó»
   * de «tardó la red».
   */
  cabecera(): string {
    const partes = this.etapas.map(
      ([nombre, ms]) => `${nombre.replace(/[^a-zA-Z0-9_-]/g, "_")};dur=${ms.toFixed(1)}`,
    );
    partes.push(`total;dur=${(performance.now() - this.inicio).toFixed(1)}`);
    return partes.join(", ");
  }

  /** Las cabeceras de una respuesta, con el `Server-Timing` ya puesto. */
  cabeceras(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, "Server-Timing": this.cabecera() };
  }
}
