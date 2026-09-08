// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EnlacesAuthenticator } from "./enlaces-authenticator";
import { APPS_AUTENTICACION } from "./apps-autenticacion";

/**
 * El dueño pidió que un administrador nuevo pueda BAJAR la app desde la propia
 * pantalla del QR. Un enlace roto o que se abra encima de la sesión a medio
 * enrolar rompe justo eso.
 */
afterEach(cleanup);

describe("enlaces para descargar la app de autenticación", () => {
  it("🔴 ofrece iPhone y Android para cada app, hacia fuera y seguro", () => {
    render(<EnlacesAuthenticator />);
    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(APPS_AUTENTICACION.length * 2);
    for (const a of enlaces) {
      expect(a).toHaveAttribute("target", "_blank");
      // Sin `noopener`, la pestaña nueva puede tocar la que queda detrás.
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    }
    expect(screen.getAllByText("iPhone")).toHaveLength(APPS_AUTENTICACION.length);
    expect(screen.getAllByText("Android")).toHaveLength(APPS_AUTENTICACION.length);
  });

  it("nombra cada app", () => {
    render(<EnlacesAuthenticator />);
    for (const app of APPS_AUTENTICACION) {
      expect(screen.getByText(app.nombre)).toBeInTheDocument();
    }
  });

  it("🔴 la pantalla de seguridad habla de tú, no de vos", () => {
    // El resto del sistema tutea. «Escaneá / ingresá / desactivás / ¿No podés?»
    // era el único rincón en voseo, y encima es el primero que ve un usuario
    // nuevo cuando le obligan a activar el segundo factor.
    // `process.cwd()` es `apps/web` bajo vitest; en jsdom `import.meta.url` no
    // es una URL de fichero y `fileURLToPath` revienta.
    const pagina = resolve(process.cwd(), "src/app/(app)/perfil/seguridad/page.tsx");
    const texto = readFileSync(pagina, "utf8");
    // 🔴 La primera versión buscaba solo terminaciones en «á» y dejaba pasar
    // «podés», que era justo una de las que había. Una prueba que no muerde es
    // peor que ninguna: hace creer que el archivo está limpio. Se cambió por
    // una lista de las formas de voseo que aparecen en textos de interfaz, y
    // se comprobó a mano que cada una de ellas pone la prueba en rojo.
    const FORMAS_DE_VOSEO = [
      "escaneá", "ingresá", "activá", "activalo", "activala", "desactivá",
      "desactivás", "revisá", "intentá", "necesitás", "podés", "tenés",
      "querés", "ponés", "hacés", "sabés", "elegí", "escribí", "seguí",
      "mirá", "andá", "acá", "vos",
    ];
    // 🔴 Nada de `\b`: la frontera de palabra de JavaScript se basa en
    // `[A-Za-z0-9_]`, así que «á» NO cuenta como letra y `escaneá\b` no casaba
    // con «escaneá » (dos no-letras seguidas no hacen frontera). Con eso la
    // prueba cazaba «podés» —termina en «s»— y dejaba pasar «escaneá», que era
    // el caso principal. Se comprobó con las dos mutaciones.
    const LETRA = "a-záéíóúüñ";
    const patron = new RegExp(
      `(?<![${LETRA}])(${FORMAS_DE_VOSEO.join("|")})(?![${LETRA}])`,
      "gi",
    );
    const voseo = texto.match(patron);
    expect(voseo ?? [], `quedó voseo: ${(voseo ?? []).join(", ")}`).toEqual([]);
  });
});
