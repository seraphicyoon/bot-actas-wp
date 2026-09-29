# Naevis: trámites y tienda de stock

Node.js 20.19 o posterior. Instalar dependencias con `npm install`; iniciar con `npm start`. Un solo proceso por base de datos/sesión de WhatsApp.

## Configuración por cliente

1. El superadministrador autoriza el grupo. Para grupos ya autorizados, el propietario que también sea administrador puede activar su modo.
2. En el grupo de ventas: `.actienda mi-tienda`. El alias debe ser único. `.actram mi-tienda` regresa a los trámites existentes. No se permite cambiar a trámites mientras haya entregas en revisión.
3. Crear un grupo **privado de administración**, añadir al bot y al dueño. El dueño debe ser administrador de ese grupo.
4. Dentro del privado: `/vincular mi-tienda`.
5. Crear un producto: `/producto regalo 50 Tarjeta de regalo`.
6. Mandar el contenido de **una unidad completa** y responder a ese mensaje con `/addstock regalo`. Cada mensaje es una unidad. Se admiten texto, imagen y documento (16 MB máximo); se descargan y guardan localmente, no dependen de que WhatsApp conserve el archivo. Para archivos, descripción máxima de 500 caracteres; para texto, 8000. No se admiten contenidos de una sola visualización.

El inventario y los saldos pertenecen a un grupo de ventas; las tiendas no comparten datos. En la primera activación se importan los saldos JSON existentes del grupo. Al cambiar entre tienda y trámites se transfieren los saldos y pagos del grupo. El stock queda conservado cuando se cambia de modo.

## Comandos

| Comando | Dónde / quién | Función |
|---|---|---|
| `.stock` | Ventas / clientes | Catálogo, precio y cantidad |
| `.comprar regalo` | Ventas / clientes | Compra una unidad y la recibe por privado |
| `.saldo` | Ventas / clientes | Saldo de ese grupo |
| `/s 100` | Ventas / dueño o administrador | Suma saldo respondiendo al cliente |
| `-s 100` | Ventas / dueño o administrador | Resta saldo sin permitir saldo negativo |
| `/setpago datos` | Dueño o administrador de ventas | Configura datos de pago |
| `.pago` | Clientes | Muestra datos de pago |
| `/producto código precio nombre` | Privado / dueño | Crea o actualiza un producto |
| `/addstock código` | Privado / dueño | Guarda el mensaje citado como unidad |
| `/inventario` | Privado / dueño | Existencias disponibles |
| `/verstock código` | Privado / dueño | IDs y vista de hasta 20 unidades |
| `/retirar ID` | Privado / dueño | Retira una unidad disponible |
| `/precio código precio` | Privado / dueño | Cambia precio |
| `/pedidos` | Privado / dueño | Últimos 20 pedidos y estados |
| `/resolver ID entregado` | Privado / dueño | Confirma una entrega en revisión tras comprobar el privado |
| `/resolver ID cancelar` | Privado / dueño | Devuelve saldo y stock de un pedido en revisión; usar solo tras comprobar que no se entregó |
| `/reavisar` | Privado / dueño | Reintenta las copias pendientes de entrega |
| `.ayudatienda` | Tienda | Ayuda del modo tienda |

Los superadministradores pueden administrar todas las tiendas. Un administrador de otra tienda no tiene acceso al stock de la tuya. Los comandos `/s`, `-s`, `.saldo` y `/setpago` también son alias para los grupos de trámites autorizados.

## Entregas y persistencia

SQLite en `datos_tiendas/tiendas.sqlite`, junto al bot (o en `RAILWAY_VOLUME_MOUNT_PATH` si está configurado). Incluye el archivo de cada unidad, movimientos e historial de pedidos. No borrar esta carpeta ni la sesión al actualizar. Mantener también los archivos SQLite `-wal` y `-shm` mientras el proceso esté activo; no copiar solo el archivo principal para respaldar una base abierta.

La compra reserva stock y debita saldo en una transacción. Los mensajes repetidos no generan compras ni ajustes duplicados. El cliente recibe el contenido completo por privado y el grupo privado recibe una copia con cliente, producto, importe, fecha, ID de pedido y de mensaje.

Si el envío privado devuelve un error, su resultado puede ser incierto: el pedido queda `review`, con la unidad y el importe reservados. El dueño comprueba el privado y usa `/resolver`. Tras un reinicio, los pedidos que estaban enviándose también pasan a revisión. No se reenvían ni se revenden automáticamente. Un fallo de la copia administrativa nunca devuelve stock o dinero de una entrega enviada; `/reavisar` reintenta el aviso, también se reintenta al conectar WhatsApp. Un aviso puede repetirse si el proceso se interrumpe justo después de enviarlo: usa el ID del pedido para reconocerlo.

`sent` significa que el envío fue aceptado por el cliente de WhatsApp, no una confirmación de lectura. El dueño puede estar desconectado; el proceso del bot y el VPS deben seguir funcionando. Las recargas se registran manualmente, no verifican pagos bancarios automáticamente.

## Actualizar el VPS conservando los datos locales

Desde `/root/bot-actas-wp`, una vez publicados los cambios:

```bash
git fetch origin main
git restore --source=origin/main -- index.js store-db.js shop-handler.js rental-handler.js moderation-handler.js README.md .gitignore
npm install better-sqlite3@12.4.1 --save
node --check index.js
```

Esto conserva `config.json`, `saldos.json` y la sesión existentes; añade SQLite al `package.json` local. Reiniciar el proceso existente después de que la instalación termine correctamente, usando su consola original (Ctrl+C), y luego `pm2 start /root/bot-actas-wp/index.js --name naevis --cwd /root/bot-actas-wp`. Nunca iniciar otra instancia mientras la anterior siga ejecutándose. `pm2 save` y `pm2 startup` permiten configurar la recuperación tras reiniciar el VPS; ejecutar la instrucción que muestre `pm2 startup`.

## Pruebas

`npm test` cubre saldos, aislamiento, duplicados, reserva, reinicios, entrega privada, archivos, permisos y fallos de avisos con una conexión WhatsApp simulada. No inicia el bot ni manda mensajes reales.

## Renta mediante keys (owner del bot)

Solo los números de `SÚPER_ADMINS_NATOS` pueden administrar rentas, desde el privado con el bot. Los superadministradores delegados y vendedores no pueden generar keys. `/addvendedor` ya no activa rentas ni concede permisos globales.

- `/genkey 1 dia`, `/genkey 12 horas`, `/genkey 7 dias`: genera una key de un uso. Duración entre 1 minuto y 366 días; el tiempo comienza al canjearla.
- El arrendatario debe ser administrador del grupo de ventas y enviar `/activar KEY`. La key queda vinculada a ese cliente y grupo. Después usa `.actienda alias` o `.actram alias`.
- `/suspender alias`: suspende inmediatamente ese grupo y su privado de stock aunque la owner haya sido expulsada. También admite el ID del grupo.
- `/rentas`: muestra clientes, vencimientos y estados (fechas UTC).
- `/revocarkey KEY`: invalida una key que todavía no se ha usado.

Una nueva key renueva al mismo propietario: suma tiempo a una renta activa, o comienza desde ahora si estaba suspendida/vencida. Al vencer se bloquean las funciones de venta, administración y trámites de ese grupo. El stock, los saldos y el historial se conservan. Las tiendas propiedad de la owner del bot están exentas; los demás grupos existentes también necesitan activar una key al instalar esta versión.

El bloqueo se verifica antes de cada mensaje. Los avisos automáticos se revisan cada 15 segundos mientras el bot esté conectado y al reconectar; si el VPS está apagado se notificará al regresar. Se envía al grupo de ventas y al privado vinculado: `🛑 TIENDA SUSPENDIDA\nEl tiempo de renta asignado por la owner ha finalizado.` Una suspensión manual indica que la owner suspendió el servicio. Si se perdió la conexión al enviar un aviso, este puede repetirse al reintentarlo.

## Ayudantes y moderación

En el grupo de ventas, el dueño responde al mensaje de un miembro con `.ayudante`. Ese miembro solo obtiene permisos para sumar saldo con `/s cantidad` respondiendo al cliente y expulsar miembros normales con `.kick`. No necesita ser administrador de WhatsApp. No puede restar saldo, administrar stock/pagos, nombrar ayudantes ni silenciar. `.quitarayudante` respondiendo al miembro revoca el rol; `.ayudantes` lista los ayudantes. Los permisos pertenecen exclusivamente a ese grupo, se guardan en SQLite y requieren que la renta esté activa.

El dueño y los administradores normales pueden usar `.kick`, `.mute 10m`, `.mute 2h`, `.mute 1d` y `.unmute`, siempre respondiendo al miembro. `.mute` admite entre 1 minuto y 30 días (por defecto 10 minutos). El bot debe ser administrador para expulsar y eliminar mensajes. El silencio elimina cada nuevo mensaje mientras el bot está conectado; no impide físicamente enviar mensajes y no borra los mensajes enviados cuando el bot estuvo desconectado. Los vencimientos se conservan tras reiniciar. Se protegen el dueño, la owner del bot y los administradores del grupo.
