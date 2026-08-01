# /worktree — Crear nuevo worktree para desarrollo paralelo

Automatiza la creación de un worktree de git listo para trabajar:
crea la rama, instala dependencias, copia el seed del emulador y abre VSCode.

## Input

El ticket completo del trabajo a realizar está en `$ARGUMENTS`.

Si `$ARGUMENTS` está vacío, pedile al usuario que pegue el contenido completo del ticket.

## Pasos a ejecutar

### 1. Extraer slug del ticket

Buscá el campo `**Nombre:**` en el contenido del ticket y usá su valor como slug.

Ejemplo:
```
**Nombre:** fix-decimal-parsing-bug
```
→ slug = `fix-decimal-parsing-bug`

Si no existe ese campo, generá el slug desde el primer heading (`## Título`) o la primera línea
significativa del ticket. Normalizá a kebab-case (lowercase, espacios → guiones, sin caracteres especiales).

### 2. Preguntar tipo de rama

Preguntale al usuario qué tipo de rama corresponde al ticket:
- `feature` — nueva funcionalidad
- `fix` — corrección de bug
- `improv` — mejora incremental
- `techDebt` — deuda técnica

### 3. Ejecutar el script de automatización

Usá la herramienta Bash para correr:

```bash
bash scripts/new-worktree.sh "<slug>" <tipo>
```

Donde `<slug>` es el extraído en el paso 1 y `<tipo>` es el elegido en el paso 2.

### 4. Guardar el ticket como TICKET.md (esquema de 6 secciones)

Una vez que el script termine con éxito, **no vuelques el ticket tal cual** — mapealo
al esquema canónico de 6 secciones (convención completa: `~/.claude/shared/ticket-md.md`)
y escribilo en:

```
[WORKTREE_PATH]/TICKET.md
```

Donde `[WORKTREE_PATH]` es la ruta que imprimió el script (línea que dice `Ruta:`).

**Resolver el idioma primero**, en este orden (nunca hardcodeado):
1. `~/.claude/settings.json` → `commitMessageGuidelines.style.language` → match exacto
   del nombre del worktree (`[WORKTREE_NAME]`, la línea `Worktree:` que imprimió el
   script) en `projects`.
2. Si no hay match exacto, el primer glob que matchee en `projectPatterns` (en orden).
3. Si ninguno matchea, `default`.

Esto decide si los headings van en español (`## Contexto`, `## Pendientes`, `## Hecho`,
`## Diferido`) o en inglés (`## Context`, `## Pending`, `## Done`, `## Deferred`) —
`## Criterios de aceptación`/`## Acceptance Criteria` sigue la misma resolución;
`## Checkpoints` se escribe igual en ambos idiomas.

**Mapeo del contenido del ticket a las 6 secciones:**

| Contenido del ticket | Sección destino |
|---|---|
| Historia de usuario / cuerpo descriptivo del problema | `## Contexto` / `## Context` |
| Criterios de aceptación | `## Criterios de aceptación` / `## Acceptance Criteria` (verbatim) |
| Ítems accionables (aspectos técnicos, sugerencias UX, tareas explícitas) | `## Pendientes` / `## Pending`, cada uno como `- [ ]` |
| — | `## Hecho` / `## Done` — vacía |
| — | `## Diferido` / `## Deferred` — vacía |
| — | `## Checkpoints` — `- [ ] technician-check` y `- [ ] pr-audit`, ambas sin fecha |

Empezá el archivo con el marcador de esquema en la línea 1:
`<!-- ticket-schema: v1 lang=es -->` o `<!-- ticket-schema: v1 lang=en -->` según el
idioma resuelto arriba.

### 5. Reportar al usuario

Confirmá con un resumen claro:
- Worktree path
- Nombre de la rama creada
- Ubicación del TICKET.md
- Próximos pasos: abrir terminal → `cd functions` → `npm run go` → Test → Set polling
