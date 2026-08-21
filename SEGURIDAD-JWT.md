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

## 10. Endpoints y proteccion actual

| Endpoint | Proteccion actual |
|---|---|
| `GET /api/health` | Publico |
| `GET /api/db/profile` | Publico |
| `PUT /api/db/profile` | Requiere access token |
| `POST /api/auth/register` | Publico |
| `POST /api/auth/login` | Publico |
| `POST /api/auth/refresh` | Refresh token |
| `POST /api/auth/logout` | Refresh token opcional |
| `GET /api/auth/me` | Access token |
| `/api/todos` | Access token y propietario |

## 11. Lo que todavia no existe: RBAC

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

## 12. Secretos y buenas practicas

- Los secretos JWT deben vivir en `.env`, nunca en Git.
- En produccion se deben usar secretos largos y aleatorios.
- El access token debe tener una duracion corta.
- El refresh token debe rotarse y poder revocarse.
- Las contrasenias nunca se guardan en texto plano.
- La cookie de refresh debe ser `HttpOnly`, `SameSite` y `Secure` en HTTPS.
- Los endpoints administrativos deben tener autorizacion por rol, no solo autenticacion.

## 13. Flujo completo

```text
Registro
  -> hash de contrasenia
  -> usuario en Oracle

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
