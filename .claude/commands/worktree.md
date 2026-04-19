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

### 4. Guardar el ticket como TICKET.md

Una vez que el script termine con éxito, escribí el contenido completo del ticket en:

```
[WORKTREE_PATH]/TICKET.md
```

Donde `[WORKTREE_PATH]` es la ruta que imprimió el script (línea que dice `Ruta:`).

### 5. Reportar al usuario

Confirmá con un resumen claro:
- Worktree path
- Nombre de la rama creada
- Ubicación del TICKET.md
- Próximos pasos: abrir terminal → `cd functions` → `npm run go` → Test → Set polling
