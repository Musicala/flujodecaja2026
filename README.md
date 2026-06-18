# Flujo de Caja Musicala · Versión visual por módulos

Esta versión reorganiza la app en módulos:

- Inicio visual: gráficas y comparaciones generales primero.
- Flujo de Caja: resumen general + movimientos con búsqueda, edición y borrado.
- RIP: datos generales + tabla editable desde el proyecto `rip-musicala`.
- Extractos: datos extraídos de PDFs/texto + tabla editable.
- Subir bancos: Bancolombia, Davivienda, Bold y Nequi hacia `flujo_caja_transacciones`.
- Subir extractos: PDF/TXT hacia `flujo_caja_extractos`.
- Calendario: control de días cargados.
- Reglas: reglas Firestore actualizadas.

## Colecciones Firestore usadas

Proyecto principal `flujo-de-caja-musicala`:

- `flujo_caja_transacciones`
- `flujo_caja_importaciones`
- `flujo_caja_extractos`

Proyecto RIP `rip-musicala`:

- Por defecto lee `clientesB2C`, pero se puede cambiar desde la interfaz.

## Importante

- Las categorías `Transferencia Musicala` no cuentan como ingreso real.
- Bold → Bancolombia / Davivienda / Nequi se trata como traslado interno.
- Los extractos PDF se guardan separados del flujo para comparar antes de decidir si entran o no al flujo oficial.
