# Guía de contribución — DermaLand

Esta guía explica **cómo hacer y documentar cada cambio** para que todo el equipo
sepa qué cambió, cuándo y por qué. **Es obligatoria para todos los colaboradores.**

- **Repositorio (Gitea Cibao Cloud):** `http://infra:3000/ARB/dermaland`
- **Requisito de red:** estar conectado a Tailscale en el tailnet `cibaocloud@`
  (que `infra` responda). Sin eso no se puede `push`/`pull` a Gitea.
- **Rama principal:** `main`. El trabajo grande va en ramas `feature/...`.
- **Monorepo:** la app vive en `apps/web` (Next.js). La versión raíz está en el
  `package.json` de la raíz del repo.

---

## 1. Flujo de cada cambio (OBLIGATORIO, en orden)

```bash
# 1. Parte siempre de main actualizado
git checkout main
git pull gitea main

# 2. Crea una rama por el cambio (un cambio = una rama)
git checkout -b feat/nombre-corto        # o fix/..., docs/..., refactor/...

# 3. Haz el cambio en el código y pruébalo localmente
#    Dev: cd /c/dev/dermaland && pnpm --filter @dermaland/web dev  ->  http://localhost:3031

# 4. Sube la versión en package.json (raíz) segun SemVer (ver seccion 2)

# 5. Documenta el cambio en CHANGELOG.md (ver seccion 3)

# 6. Commit con mensaje convencional (ver seccion 4)
git add -A
git commit -m "feat: agrega X"

# 7. Sube tu rama a Gitea
git push gitea feat/nombre-corto

# 8. Abre un Pull Request en Gitea hacia main para que el equipo revise
#    http://infra:3000/ARB/dermaland -> Pull Requests -> New
```

> Si trabajas solo y con autorización para ir directo a `main`, igual debes
> **bumpear versión + entrada en CHANGELOG** antes del push. La documentación
> no es opcional.

---

## 2. Versionado — SemVer (`MAJOR.MINOR.PATCH`)

Edita el campo `"version"` en el `package.json` de la **raíz**:

| Cambias… | Cuándo | Ejemplo |
|---|---|---|
| **PATCH** (`0.1.0 → 0.1.1`) | Arreglas un bug, sin romper nada | `fix:` |
| **MINOR** (`0.1.0 → 0.2.0`) | Agregas funcionalidad compatible | `feat:` |
| **MAJOR** (`0.1.0 → 1.0.0`) | Cambio incompatible / rompe API o datos | `feat!:` |

> Mientras estemos en `0.x`, un cambio que rompe puede ir en **MINOR**.

Opcional pero recomendado: crea un tag por versión publicada:

```bash
git tag -a v0.2.0 -m "v0.2.0 — descripción breve"
git push gitea v0.2.0
```

---

## 3. Documentar en `CHANGELOG.md`

Usamos [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada cambio
va bajo una de estas categorías:

- **Added** — funcionalidad nueva.
- **Changed** — cambios en funcionalidad existente.
- **Deprecated** — algo que se va a quitar pronto.
- **Removed** — algo eliminado.
- **Fixed** — corrección de bugs.
- **Security** — temas de seguridad.

**Cómo:** mientras desarrollas, escribe bajo `## [Unreleased]`. Cuando publiques,
mueve esas líneas a una sección de versión nueva con fecha:

```markdown
## [0.2.0] - 2026-06-15
### Added
- Emisión de e-CF de prueba (testecf) en módulo DGII.
### Fixed
- Cálculo de ITBIS en factura.
```

Escribe pensando en el colaborador que lo leerá: **qué cambió y por qué**, no el detalle técnico del diff.

> **DGII / facturación fiscal:** no avanzar a Fase G ni a producción fiscal sin
> autorización explícita. Documenta igual cualquier avance en ramas `feature/dgii-*`.

---

## 4. Mensajes de commit — Conventional Commits

`tipo(scope opcional): descripción en presente`

| Tipo | Uso |
|---|---|
| `feat:` | nueva funcionalidad |
| `fix:` | corrección de bug |
| `docs:` | solo documentación |
| `refactor:` | reestructura sin cambiar comportamiento |
| `chore:` | tareas de mantenimiento (deps, config) |
| `test:` | tests |

Ejemplo: `feat(dgii): genera XML de e-CF tipo 31`

---

## 5. Checklist antes de hacer push

- [ ] El cambio funciona localmente (`:3031` responde).
- [ ] Subí la versión en `package.json` raíz (SemVer).
- [ ] Agregué la entrada en `CHANGELOG.md`.
- [ ] Mensaje de commit convencional.
- [ ] `git push gitea <rama>` hecho.
- [ ] PR abierto en Gitea (o, si es directo a main, avisé al equipo).

---

## 6. Comandos de referencia rápida

```bash
git remote -v                      # confirma que existe el remoto 'gitea'
git pull gitea main                # traer lo último
git push gitea <rama>              # subir tu rama
git push gitea --tags              # subir tags de versión
```

¿Dudas? Revisa `CHANGELOG.md` para ver ejemplos reales de entradas ya escritas.
