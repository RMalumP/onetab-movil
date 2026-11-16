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

### Novedades de la 1.3
- **Vimy** (Más → Vimy): solo en teléfonos y tabletas y solo con la cuenta de Dropbox autorizada. El código va cifrado en `vimy/vimy.enc` (AES-GCM-256) y la llave está en la carpeta de la app de esa cuenta de Dropbox (`/vimy/llave.json`): sin esa cuenta no se puede leer. La primera vez pide la clave de Vimy una sola vez para dejar la llave en Dropbox. Sigue buscando en segundo plano en modo ahorro (máximo 2 peticiones a la vez con la app oculta; desactivable para que se pause al salir). Si Android congela o cierra la app, al abrirla continúa donde iba. Al volver tras más de 1 minuto fuera comprueba otra vez la cuenta; si ya no vale, se detiene. Lo que guarda en el móvil va cifrado. Se genera desde el repositorio privado de Vimy (`movil/build.mjs`).

### Novedades de la 1.2
- **Archivos**: bandeja compartida con el ordenador (necesita OneTab Drive 4.10, herramienta «Archivos del móvil»). «Enviar al ordenador» sube fotos, vídeos o cualquier archivo con barra de progreso; «Texto» manda un texto o enlace. Lo que llega del ordenador sale marcado como «Nuevo» (con contador en la pestaña); la flecha lo guarda con un toque y al tocar la fila se ve (imágenes, vídeo, audio, texto) con Guardar, Compartir, Copiar y Borrar.
- **Compartir → OneTab** desde la galería o cualquier app: los archivos se envían directamente a la bandeja. Los enlaces siguen yendo a «Añadir enlaces», y un texto sin enlace abre «Enviar un texto al ordenador».
- **En directo** solo mientras la pestaña Archivos está abierta y a la vista (una petición en espera a Dropbox); fuera de ella no escucha nada.
- Con el cifrado activado, los archivos se suben cifrados con la misma contraseña (formato de las capturas). La carpeta es `Intercambio` dentro de la de la app en Dropbox.
- Tras publicar la 1.2, Android actualiza el menú Compartir de la app instalada al cabo de un rato (o reinstálala para tenerlo ya).

### Novedades de la 1.1
- **Abrir y quitar**: desliza una pestaña a la izquierda para abrirla y sacarla de la lista (o solo quitarla, según Ajustes).
- **Deshacer** tras quitar, mover, juntar, dividir, ordenar, mandar a la papelera, limpiar duplicados o importar.
- **Selección múltiple** (botón ☑): juntar listas, mover pestañas a otra lista o a una nueva, carpeta, destacar, recordar, enviar a otro equipo, abrir, copiar y borrar en bloque.
- **Recordatorios**: «Recordar…» (1 hora, esta tarde, mañana, el lunes o fecha a elegir), filtro «Con recordatorio» y sección **Para hoy**. El aviso lo sigue dando la extensión.
- **Capturas**: galería de las capturas que la extensión sincroniza con Dropbox (descifradas si hace falta); verlas, compartirlas, guardarlas o borrarlas.
- **Duplicados**: lista de pestañas repetidas y limpieza con un toque (búsqueda `is:duplicada`).
- **Ordenar** una lista por título o por sitio y **dividirla por sitio**.
- **Copias de seguridad**: ver las copias diarias de la extensión y restaurar una en todos los equipos.
- **Sitios excluidos**: editar desde el móvil los sitios que la extensión no guarda.
- **Importar** texto pegado o archivos TXT (OneTab), CSV, JSON o marcadores HTML.

## Cómo convive con la extensión

Cada cambio se aplica sobre la versión más reciente del archivo y se sube con «solo si sigue en esta revisión»; si otro equipo subió algo entretanto, se vuelve a aplicar sobre lo nuevo. La extensión fusiona después igual que con cualquier otro equipo (por grupo, con lápidas para los borrados). `lib/ops.js`, `lib/util.js`, `lib/pack.js` y `lib/xfer.js` son copias exactas de la extensión, y `lib/crypto.js` es su parte pura: si cambia el formato en la extensión, hay que copiarlos de nuevo.

## Puesta en marcha

1. **Dropbox** → [consola de apps](https://www.dropbox.com/developers/apps) → la app que ya usa la extensión (misma *App key* que en `config.js`) → pestaña *Settings* → *OAuth 2* → *Redirect URIs*: añade la dirección de GitHub Pages, p. ej. `https://rmalump.github.io/onetab-movil/` (con la barra final). Comprueba que *Allow public clients (Implicit Grant & PKCE)* está en *Allow*.
2. **GitHub Pages**: *Settings* → *Pages* → *Deploy from a branch* → la rama del código / `(root)`.
3. Abre la dirección en el móvil, inicia sesión en Dropbox, escribe la contraseña de cifrado si la tienes y, en el menú del navegador, **Instalar app** / **Añadir a pantalla de inicio**.

## Privacidad

El token de Dropbox y, si lo eliges, la clave derivada de tu contraseña (nunca la contraseña) se guardan solo en el almacenamiento de este navegador. La política de seguridad de la página solo permite conectar con `api.dropboxapi.com`, `content.dropboxapi.com` y `notify.dropboxapi.com` (avisos de cambios en la bandeja).
