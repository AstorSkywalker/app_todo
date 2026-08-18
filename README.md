# App TODO Oracle

Aplicacion local con Node.js, HTML, CSS y JavaScript para administrar la tabla `TODOS` mediante el paquete PL/SQL `pkg_todos_crud`.

## Requisitos

- Node.js 20 o superior
- Oracle Client instalado
- Oracle Free en la VM escuchando en `localhost:1521` con service name `freepdb1`
- Usuario DBA local `nnelson`

## Crear usuario y objetos

Ejecuta estos scripts en orden. El primero se conecta con tu usuario DBA `nnelson` y crea/desbloquea el esquema `app_todo`; los demas se ejecutan dentro de `app_todo`.

```powershell
sqlplus nnelson/TU_PASSWORD_DBA@//localhost:1521/freepdb1 @00-crea-usuario-app-todo.sql
sqlplus app_todo/TU_PASSWORD_APP@//localhost:1521/freepdb1 @01-crea-tablas.sql
sqlplus app_todo/TU_PASSWORD_APP@//localhost:1521/freepdb1 @02-paquete-todos-crud.sql
```

El script `00-crea-usuario-app-todo.sql` pide la password de `app_todo` al ejecutarse.

## Configuracion local

La app carga la configuracion desde `.env` al iniciar. Ese archivo es para desarrollo local y no debe subirse al repositorio.

Para esta maquina quedo asi:

```env
PORT=3000
ORACLE_DB_PROFILE=local
ORACLE_LOCAL_USER=app_todo
ORACLE_LOCAL_PASSWORD=TU_PASSWORD_APP
ORACLE_LOCAL_CONNECT_STRING=//localhost:1521/freepdb1
ORACLE_USE_THICK=true
```

Tambien puedes copiar `.env.example` como base. Los valores de `.env` se cargan al iniciar y tienen prioridad para que la conexion local quede en un solo lugar.

`ORACLE_DB_PROFILE` puede ser `local` o `cloud`, y tambien puedes cambiar la conexion desde el selector de la interfaz.

## Variables de .env

- `PORT`: puerto HTTP donde arranca la app. Por defecto se usa `3000`.
- `ORACLE_DB_PROFILE`: perfil activo al iniciar la app. Valores validos: `local` o `cloud`.
- `ORACLE_USE_THICK`: activa Oracle Thick mode. Usa `true` para trabajar con Oracle ADB mediante wallet/TNS. Usa `false` si quieres intentar Thin mode.
- `ORACLE_LOCAL_USER`: usuario Oracle del perfil local.
- `ORACLE_LOCAL_PASSWORD`: password del usuario Oracle local.
- `ORACLE_LOCAL_CONNECT_STRING`: cadena de conexion del perfil local, por ejemplo `//localhost:1521/freepdb1`.
- `ORACLE_CLIENT_LIB_DIR`: ruta de Oracle Client o Instant Client. Se usa cuando `ORACLE_USE_THICK=true`.
- `ORACLE_CLIENT_CONFIG_DIR`: ruta donde viven `tnsnames.ora` y `sqlnet.ora`. Se usa cuando `ORACLE_USE_THICK=true`.
- `ORACLE_CLOUD_USER`: usuario Oracle del perfil cloud.
- `ORACLE_CLOUD_PASSWORD`: password del usuario Oracle cloud.
- `ORACLE_CLOUD_CONNECT_STRING`: alias TNS o connect string del perfil cloud, por ejemplo `oracle23ai_low`.

Notas utiles:

- Si `ORACLE_DB_PROFILE=local`, la app trabaja contra Oracle local al iniciar.
- Si `ORACLE_DB_PROFILE=cloud`, la app intenta conectarse al perfil Oracle ADB al iniciar.
- El selector de conexion de la interfaz puede cambiar entre `local` y `cloud` sin reiniciar la app.
- En este proyecto, `ORACLE_USE_THICK=true` es la configuracion recomendada porque el perfil cloud usa wallet/TNS.

## Configuracion en produccion

En produccion se usa el mismo modelo de configuracion, pero normalmente no se despliega un archivo `.env`. Las variables se definen en el entorno del servidor, contenedor o plataforma donde corra Node.js.

Ejemplo:

```env
NODE_ENV=production
PORT=3000
ORACLE_DB_PROFILE=local
ORACLE_LOCAL_USER=app_todo
ORACLE_LOCAL_PASSWORD=un_password_seguro
ORACLE_LOCAL_CONNECT_STRING=//host-produccion:1521/service_name
ORACLE_USE_THICK=true
ORACLE_CLIENT_LIB_DIR=C:\oracle_21c_client\bin
ORACLE_CLIENT_CONFIG_DIR=D:\Nelson\dev\app_todo\config\adb
```

Recomendaciones para produccion:

- No guardar passwords reales en Git.
- Configurar secretos desde el sistema operativo, Docker, Kubernetes, CI/CD o la plataforma cloud.
- Usar un password distinto al de desarrollo.
- Apuntar `ORACLE_LOCAL_CONNECT_STRING` al host y service name reales de produccion.
- Para Oracle ADB con wallet/TNS, usar `ORACLE_USE_THICK=true`.

## Instalar y ejecutar

```powershell
npm install
npm start
```

Abre:

```text
http://localhost:3000
```

## Desarrollo vs produccion

El proyecto tiene estos scripts en `package.json`:

```json
"start": "node server.js",
"dev": "node --watch server.js"
```

Para ejecutar normal:

```powershell
npm start
```

Para desarrollo:

```powershell
npm run dev
```

`npm run dev` usa `node --watch server.js`, que reinicia Node automaticamente cuando cambias `server.js`. Es util mientras estas programando.

En produccion normalmente se usa:

```powershell
npm start
```

La diferencia es que en produccion las variables de entorno se configuran en el servidor, contenedor o plataforma, y no se deja una consola abierta manualmente. Lo usual es correr la app con un process manager o servicio, por ejemplo PM2, Docker, systemd, Windows Service o IIS como reverse proxy.

Ejemplo con PM2:

```powershell
pm2 start server.js --name app-todo
pm2 status
pm2 logs app-todo
```

## Detener el servidor

Si ejecutaste `npm start` o `npm run dev` en una terminal, detenlo con:

```text
Ctrl + C
```

Si el servidor quedo en segundo plano o no sabes donde esta, busca el proceso que escucha en el puerto 3000:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Toma el valor de `OwningProcess` y detenlo:

```powershell
Stop-Process -Id NUMERO_DEL_PROCESO -Force
```

Tambien puedes hacerlo en una sola linea:

```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess -Force
```

## API

La API expone endpoints bajo `/api/todos` y utiliza el paquete `pkg_todos_crud`.

Endpoints principales:

- `GET /api/health`
- `GET /api/db/profile`
- `PUT /api/db/profile`
- `GET /api/todos`
- `GET /api/todos/:id`
- `POST /api/todos`
- `PUT /api/todos/:id`
- `PATCH /api/todos/:id/estado`
- `DELETE /api/todos/:id`
