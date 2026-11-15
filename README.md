# OneTab Móvil

PWA para gestionar desde el móvil las pestañas que guardas con la extensión **OneTab Drive**, leyendo y escribiendo el mismo archivo de tu Dropbox. Sin servidores: la app habla solo con Dropbox y todo el código corre en tu navegador.

## Qué hace

- **Listas**: buscar (título, dirección, `#etiqueta`), filtrar por carpeta, destacadas o equipo, ordenar; abrir, copiar o compartir pestañas y listas enteras.
- **Organizar**: destacar, renombrar, notas, etiquetas, mover a carpeta, mover una pestaña a otra lista, quitar pestañas, bloquear, papelera (restaurar, borrar, vaciar), crear/renombrar/borrar carpetas.
- **Entre equipos**: este móvil aparece en «Enviar a otro equipo» de la extensión; lo recibido sale en **Recibidas** (con contador en el icono). Desde el móvil puedes **enviar** enlaces o listas a cualquier ordenador.
- **Compartir desde Android**: instalada, aparece en el menú *Compartir* de cualquier app; el enlace se guarda en tus listas o se manda a un ordenador.
- **Sesiones**: ver las sesiones guardadas, abrir sus pestañas, convertirlas en listas o borrarlas.
- **Cifrado**: si activaste el cifrado en la extensión, pide la misma contraseña (AES-GCM 256 + PBKDF2, idéntico formato). Puedes recordarla en el dispositivo o pedirla cada vez.
- **Sin conexión**: muestra la última copia y guarda los cambios en cola; se suben al volver la conexión.
- **Exportar** en formato OneTab (`dirección | título`).

## Cómo convive con la extensión

Cada cambio se aplica sobre la versión más reciente del archivo y se sube con «solo si sigue en esta revisión»; si otro equipo subió algo entretanto, se vuelve a aplicar sobre lo nuevo. La extensión fusiona después igual que con cualquier otro equipo (por grupo, con lápidas para los borrados). `lib/ops.js`, `lib/util.js` y `lib/pack.js` son copias exactas de la extensión, y `lib/crypto.js` es su parte pura: si cambia el formato en la extensión, hay que copiarlos de nuevo.

## Puesta en marcha

1. **Dropbox** → [consola de apps](https://www.dropbox.com/developers/apps) → la app que ya usa la extensión (misma *App key* que en `config.js`) → pestaña *Settings* → *OAuth 2* → *Redirect URIs*: añade la dirección de GitHub Pages, p. ej. `https://rmalump.github.io/onetab-movil/` (con la barra final). Comprueba que *Allow public clients (Implicit Grant & PKCE)* está en *Allow*.
2. **GitHub Pages**: *Settings* → *Pages* → *Deploy from a branch* → la rama del código / `(root)`.
3. Abre la dirección en el móvil, inicia sesión en Dropbox, escribe la contraseña de cifrado si la tienes y, en el menú del navegador, **Instalar app** / **Añadir a pantalla de inicio**.

## Privacidad

El token de Dropbox y, si lo eliges, la clave derivada de tu contraseña (nunca la contraseña) se guardan solo en el almacenamiento de este navegador. La política de seguridad de la página solo permite conectar con `api.dropboxapi.com` y `content.dropboxapi.com`.
