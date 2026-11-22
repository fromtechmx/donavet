# Dona Vet&Care · Recepción (versión mínima sobre Supabase)

Página estática (HTML + JavaScript, sin servidor propio). Se publica con GitHub Pages y habla directo con Supabase.

## Qué hace hoy
- Inicio de sesión con correo y contraseña (Supabase Auth). Solo entra personal con perfil activo en la tabla `perfiles`.
- Búsqueda de clientes por nombre del dueño, nombre de la mascota, teléfono o ID.
- Ficha del cliente con sus mascotas (hembra en rosa, macho en azul, orden alfabético), historial y notas de AVImark.
- Abrir consulta y capturar ingreso, examen y diagnóstico, con control de ediciones simultáneas.

## Qué NO hace todavía
Cobro (cargos, abonos, cierre), receta, Tienda, agenda de estética, fotos, fusión de clientes, alta de clientes y mascotas, anular consultas, formato de impresión.

## Archivos
- `index.html`, `app.js`, `estilos.css`: la aplicación.
- `config.js`: **URL y llave pública** del proyecto de Supabase. Es lo único que cambia al pasar a otra cuenta.

## Seguridad
- La llave `sb_publishable_…` está hecha para ir en el navegador. Los datos los protegen las reglas RLS de la base y las funciones `rpc`, no el secreto de la llave.
- **Nunca** pongas en este repositorio la llave `service_role`, contraseñas de base de datos ni tokens.
- Si el repositorio es público, cualquiera puede ver el código y la URL del proyecto; sin usuario y contraseña de personal no ve ningún dato.

## Publicar en GitHub Pages
Settings → Pages → Source: *Deploy from a branch* → Branch `main`, carpeta `/ (root)` → Save. La dirección queda en `https://<organización>.github.io/<repositorio>/`.

## Pasar a las cuentas del cliente
1. GitHub: transferir el repositorio (Settings → Danger zone → Transfer) o agregar al cliente como Owner de la organización.
2. Supabase: crear el proyecto en la cuenta del cliente, aplicar las migraciones de `claude/DonaVet_Supabase/migraciones/` en orden y cambiar `config.js`.
