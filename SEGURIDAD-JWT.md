# Seguridad de la aplicacion

Este documento explica como funciona actualmente la autenticacion y autorizacion de la aplicacion TODO.

## 1. Autenticacion y autorizacion

Son conceptos relacionados, pero diferentes:

- **Autenticacion**: responde a la pregunta "quien eres?". En este proyecto se comprueba el email y la contrasenia.
- **Autorizacion**: responde a la pregunta "que puedes hacer?". En este proyecto se comprueba que exista un access token valido y que la tarea pertenezca al usuario autenticado.
- **RBAC**: es una autorizacion basada en roles, por ejemplo `admin`, `editor` o `usuario`. Todavia no esta implementado.

## 2. Archivos importantes

### `auth.js`

Contiene la logica reutilizable de seguridad:

- Creacion y verificacion de JWT.
- Hash y verificacion de contrasenias con `scrypt`.
- Creacion, hash y rotacion de refresh tokens.
- Lectura y limpieza de cookies.
- Middleware `requireAuth`.
- Busqueda de usuarios y comprobacion del propietario de una tarea.

### `server.js`

Contiene las rutas HTTP y las operaciones de negocio:

- Recibe la peticion.
- Usa funciones de `auth.js`.
- Consulta Oracle.
- Decide el codigo HTTP y la respuesta JSON.

La separacion permite estudiar la seguridad sin mezclar toda la logica dentro de cada endpoint.

### `04-auth-jwt-refresh.sql`

Crea las tablas que soportan la seguridad:

- `usuarios`: identidad, email, hash de contrasenia y estado activo.
- `refresh_tokens`: sesiones de refresh, expiracion, revocacion y metadatos.

## 3. Registro

El cliente envia:

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "nombre": "Nelson",
  "email": "nelson@example.com",
  "password": "password123"
}
```

El servidor:

1. Valida que los campos existan.
2. Exige al menos 8 caracteres para la contrasenia.
3. Busca si el email ya existe.
4. Genera un salt aleatorio.
5. Usa `scrypt` para generar `password_hash`.
6. Guarda el hash, nunca la contrasenia original.

7. Crea un token de confirmacion y envia un enlace por correo.

La cuenta queda sin verificar hasta que el usuario utiliza el enlace recibido.

La respuesta no contiene la contrasenia.

## 4. Login

El cliente envia el email y la contrasenia a:

```http
POST /api/auth/login
```

El servidor busca el usuario y compara la contrasenia recibida con el hash almacenado usando `scrypt`.

Si son validas, genera dos credenciales:

### Access token

- Es un JWT firmado con `JWT_ACCESS_SECRET`.
- Dura 15 minutos por defecto.
- El cliente lo envia en el header:

```http
Authorization: Bearer ACCESS_TOKEN
```

- Se guarda temporalmente en `sessionStorage` en el frontend.

### Refresh token

- Dura 7 dias por defecto.
- Se envia como cookie `HttpOnly`.
- El navegador no permite que JavaScript lea esta cookie.
- La base guarda solamente su hash, no el token original.

## 5. Que contiene el JWT

El access token tiene un payload parecido a este:

```json
{
  "sub": "1",
  "email": "nelson@example.com",
  "name": "Nelson",
  "tokenType": "access",
  "iat": 1787265334,
  "exp": 1787266234
}
```

Los campos principales son:

- `sub`: identificador del usuario.
- `iat`: momento de emision.
- `exp`: momento de expiracion.
- `tokenType`: evita usar un refresh token como access token.

Un JWT esta codificado, no cifrado. Por eso nunca debe contener contrasenias ni secretos.

## 6. Middleware `requireAuth`

Las rutas protegidas usan:

```js
app.get("/api/auth/me", requireAuth, handler);
```

El middleware:

1. Lee `Authorization`.
2. Comprueba que use el esquema `Bearer`.
3. Verifica la firma con `JWT_ACCESS_SECRET`.
4. Comprueba que el token no haya expirado.
5. Comprueba que sea de tipo `access`.
6. Coloca el usuario en `req.user`.

Si falla cualquier paso, responde `401 Unauthorized` y la ruta no se ejecuta.

## 7. Autorizacion de tareas

La lista de tareas siempre usa el usuario del token:

```js
p_usuario_id => req.user.id
```

El cliente no puede elegir otro `usuarioId` para consultar tareas.

Para consultar, modificar o eliminar una tarea individual se ejecuta `ensureTodoOwner`. Esta funcion comprueba que:

```text
todos.usuario_id === req.user.id
```

Si no coincide, responde `404 Tarea no encontrada`. Devolver `404` evita revelar si existe una tarea perteneciente a otra persona.

## 8. Refresh token

Cuando el access token expira:

```http
POST /api/auth/refresh
```

El navegador envia la cookie `refreshToken`. El servidor:

1. Verifica la firma y expiracion del refresh token.
2. Calcula su hash.
3. Busca ese hash en `refresh_tokens`.
4. Comprueba que no este revocado y que el usuario siga activo.
5. Revoca el refresh token usado.
6. Crea un refresh token nuevo.
7. Devuelve un access token nuevo.

Este proceso se llama **rotacion**. Si alguien intenta reutilizar el refresh token anterior, recibe `401`.

## 9. Logout

```http
POST /api/auth/logout
```

El servidor revoca el refresh token actual y limpia la cookie.

El access token existente puede continuar funcionando hasta su expiracion. Esto es normal: un JWT firmado es autonomo y no se consulta en la base de datos en cada request.

## 10. Recuperacion de contrasenia

La contrasenia original no se puede recuperar porque solo se guarda su hash. Para recuperar la cuenta se usa un token temporal de un solo uso.

### Solicitar enlace

```http
POST /api/auth/forgot-password
```

```json
{
  "email": "usuario@example.com"
}
```

El servidor genera un token aleatorio, guarda su hash en `password_reset_tokens` y envia un enlace por SMTP. La respuesta es generica aunque el correo no exista, para no revelar que cuentas estan registradas.

### Establecer nueva contrasenia

```http
POST /api/auth/reset-password
```

```json
{
  "token": "token-del-enlace",
  "password": "NuevaPassword123"
}
```

El token expira en 15 minutos y solo puede utilizarse una vez. Al cambiar la contrasenia se revocan tambien los refresh tokens del usuario para cerrar sus sesiones anteriores.

El envio utiliza Nodemailer y las variables SMTP de `.env`. La app password nunca se guarda en el repositorio ni se devuelve al cliente.

## 11. Confirmacion de correo al crear cuenta

Las cuentas nuevas se crean con `email_verificado_at` vacio. El registro genera un token temporal, guarda solo su hash en `email_verification_tokens` y envia un enlace valido durante 24 horas.

El usuario confirma el enlace mediante:

```http
GET /api/auth/verify-email?token=TOKEN
```

Hasta que el enlace sea validado, el login responde `403` y no crea access ni refresh tokens. Si el enlace expira, se puede solicitar otro mediante:

```http
POST /api/auth/resend-verification
```

Los usuarios existentes se marcaron como verificados durante la migracion para no bloquear cuentas creadas antes de activar esta regla.

## 12. Nice to have: parametrizar emails de seguridad

Como mejora futura, convendria hacer parametrizable el uso de correos de seguridad mediante variables de configuracion separadas:

- Una variable para activar o desactivar la confirmacion de email al crear cuentas.
- Otra variable para activar o desactivar el envio de emails de recuperacion de contrasenia.

Esto permitiria usar distintos comportamientos en desarrollo, pruebas y produccion sin modificar el codigo. Por ejemplo, desarrollo podria crear usuarios sin exigir confirmacion, mientras produccion podria exigirla siempre.

La configuracion debera validarse al iniciar la aplicacion y documentarse junto con las variables SMTP.

## 13. Endpoints y proteccion actual

| Endpoint | Proteccion actual |
|---|---|
| `GET /api/health` | Publico |
| `GET /api/db/profile` | Publico |
| `PUT /api/db/profile` | Requiere access token |
| `POST /api/auth/register` | Publico |
| `GET /api/auth/verify-email` | Token de verificacion |
| `POST /api/auth/resend-verification` | Publico |
| `POST /api/auth/login` | Publico |
| `POST /api/auth/refresh` | Refresh token |
| `POST /api/auth/logout` | Refresh token opcional |
| `GET /api/auth/me` | Access token |
| `/api/todos` | Access token y propietario |

## 14. Lo que todavia no existe: RBAC

Actualmente el sistema sabe quien es el usuario, pero no tiene roles ni permisos almacenados.

En una futura implementacion RBAC podriamos:

1. Agregar `rol` o `role_id` a `usuarios`.
2. Crear un middleware como `requireRole("admin")`.
3. Proteger operaciones administrativas, como cambiar el perfil de base.
4. Separar permisos de tareas de los permisos de administracion.

Ejemplo conceptual:

```js
app.put(
  "/api/db/profile",
  requireAuth,
  requireRole("admin"),
  cambiarPerfil
);
```

## 15. Secretos y buenas practicas

- Los secretos JWT deben vivir en `.env`, nunca en Git.
- En produccion se deben usar secretos largos y aleatorios.
- El access token debe tener una duracion corta.
- El refresh token debe rotarse y poder revocarse.
- Las contrasenias nunca se guardan en texto plano.
- La cookie de refresh debe ser `HttpOnly`, `SameSite` y `Secure` en HTTPS.
- Los endpoints administrativos deben tener autorizacion por rol, no solo autenticacion.

## 16. Flujo completo

```text
Registro
  -> hash de contrasenia
  -> usuario en Oracle
  -> correo de confirmacion

Confirmacion de correo
  -> token valido
  -> email_verificado_at

Login
  -> verifica hash
  -> access token JWT
  -> refresh token HttpOnly

Request protegida
  -> Bearer token
  -> requireAuth
  -> req.user
  -> autorizacion por propietario

Access token expirado
  -> refresh token
  -> rotacion
  -> nuevo access token

Logout
  -> revoca refresh token
  -> limpia cookie
```

## 17. Funcionalidad pendiente: Recordarme

El checkbox `Recordarme` del formulario de login es actualmente solo visual. Todavia no modifica el comportamiento de la sesion.

La implementacion pendiente debera decidir entre:

- Sesion temporal cuando no se marque.
- Sesion persistente cuando se marque.

Tambien debera definir como coordinar esa decision con la duracion de la cookie `refreshToken` y el almacenamiento del access token en el navegador.

## 18. Funcionalidad pendiente: aplicacion de monitoreo

Se necesita una aplicacion backend separada para monitorear este backend. Se implementara posteriormente.

El sistema de monitoreo debera permitir observar, como minimo:

- Disponibilidad y latencia de la API.
- Estado de las conexiones con Oracle local y cloud.
- Errores HTTP y excepciones del servidor.
- Intentos fallidos de login y eventos de refresh/logout.
- Uso de recursos y salud del proceso Node.js.
- Historial de alertas y eventos importantes.

Esta aplicacion debera tener su propia autenticacion y no depender de las rutas protegidas de la aplicacion TODO.

## 19. Funcionalidad pendiente: pagina administrativa de usuarios

Se necesita una pagina administrativa para controlar la creacion y el estado de los usuarios, asi como las operaciones relacionadas con contrasenias y correos de verificacion.

Esta funcionalidad dependera de implementar RBAC. Solo usuarios con un rol administrativo deberan acceder a ella.

La pagina debera permitir, como minimo:

- Consultar usuarios, estado de cuenta y fecha de verificacion de correo.
- Crear usuarios manualmente cuando sea necesario.
- Activar, desactivar o bloquear cuentas.
- Consultar si un usuario tiene el correo confirmado.
- Reenviar correos de verificacion.
- Invalidar tokens de verificacion o recuperacion.
- Forzar el cierre de sesiones revocando refresh tokens.
- Solicitar un restablecimiento de contrasenia sin conocer la contrasenia actual.
- Consultar eventos relevantes de seguridad y errores de envio.

La pagina nunca debera mostrar contrasenias, hashes, refresh tokens ni tokens de verificacion. Las acciones administrativas importantes deberan quedar registradas en una auditoria con usuario, fecha, accion y resultado.

## 20. Arquitectura futura: separar frontend y backend

Actualmente el proyecto contiene el frontend en `public/` y el backend en `server.js` dentro del mismo proyecto Node.js. Como mejora futura se podrian separar en dos proyectos:

- **Frontend**: interfaz, formularios, almacenamiento del access token y llamadas HTTP a la API.
- **Backend**: API, reglas de negocio, autenticacion, autorizacion y acceso a Oracle.

Al separarlos habria que configurar CORS, la URL publica de la API, la politica de cookies entre dominios, `SameSite`, `Secure` y el manejo del refresh token. `auth.js` continuaria perteneciendo al backend.

## 21. Que es un middleware

Un middleware no es otro proyecto. Es una funcion dentro del backend que se ejecuta durante el recorrido de una peticion, antes de llegar al endpoint final.

Ejemplo actual:

```js
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
```

Aqui `requireAuth` es un middleware. Comprueba el header `Authorization`, valida el JWT y coloca el usuario en `req.user`. Si el token es invalido responde `401`; si es valido llama a `next()` y permite continuar hacia el endpoint.

El flujo es:

```text
Peticion HTTP
  -> middleware
  -> validacion JWT
  -> endpoint
  -> respuesta
```

Un backend puede tener muchos middlewares para autenticacion, autorizacion, logs, CORS, validacion de datos y manejo de errores.

## 22. Funcionalidad pendiente: usar HTTPS

Actualmente el entorno local utiliza `http://localhost:3000`. Antes de publicar la aplicacion se debera utilizar HTTPS para cifrar credenciales, JWT, tokens de recuperacion y todo el trafico entre navegador y backend.

Al activar HTTPS se debera:

- Configurar un certificado TLS valido.
- Cambiar `APP_BASE_URL` a una URL `https://`.
- Mantener la cookie `refreshToken` con el atributo `Secure`.
- Configurar cualquier proxy inverso para redirigir HTTP hacia HTTPS.
- Revisar CORS, dominios permitidos y URLs de correo.
- Verificar que los enlaces de confirmacion y recuperacion utilicen HTTPS.

## 23. Funcionalidad pendiente: baja y eliminacion de usuarios

Se debe definir una politica administrativa para eliminar o desactivar usuarios.

La opcion recomendada es el borrado logico mediante `usuarios.activo = 0`, porque conserva el historial, las tareas y la auditoria sin permitir nuevos accesos.

Si se implementa borrado fisico, se debera decidir que ocurre con las tareas del usuario:

- Eliminarlas junto con el usuario.
- Conservarlas y dejar `usuario_id` en `NULL`.
- Transferirlas a otro usuario autorizado.

Los refresh tokens, tokens de recuperacion y tokens de verificacion deben eliminarse o invalidarse al borrar la cuenta. Actualmente las tablas de tokens usan `ON DELETE CASCADE`.

Tambien se debera considerar la revocacion inmediata de access tokens JWT existentes. Como los JWT son autonomos, un token ya emitido podria seguir funcionando hasta expirar si `requireAuth` no comprueba que el usuario permanezca activo.
