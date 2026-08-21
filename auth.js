const crypto = require("crypto");
const oracledb = require("oracledb");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);

const authConfig = {
  accessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
  accessExpiresInSeconds: Number(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS || 900),
  refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 7)
};

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64");
}

function signJwt(payload, secret, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;
  const signature = crypto.createHmac("sha256", secret).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}

function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedBody, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedBody}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(unsignedToken).digest("base64url");

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
    const payload = JSON.parse(base64UrlDecode(encodedBody).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

function createAccessToken(user) {
  return signJwt(
    {
      sub: String(user.id),
      email: user.email,
      name: user.nombre,
      tokenType: "access"
    },
    authConfig.accessSecret,
    authConfig.accessExpiresInSeconds
  );
}

function createRefreshToken(user) {
  const tokenId = crypto.randomUUID();
  const expiresInSeconds = authConfig.refreshExpiresInDays * 24 * 60 * 60;
  const token = signJwt(
    {
      sub: String(user.id),
      jti: tokenId,
      tokenType: "refresh"
    },
    authConfig.refreshSecret,
    expiresInSeconds
  );

  return {
    token,
    tokenHash: hashRefreshToken(token),
    tokenId,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
  };
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, key] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const derivedKey = await scryptAsync(password, salt, 64);
  const storedKey = Buffer.from(key, "base64url");

  return (
    storedKey.length === derivedKey.length &&
    crypto.timingSafeEqual(storedKey, derivedKey)
  );
}

function createUserFromRow(row) {
  return {
    id: row.ID,
    nombre: row.NOMBRE,
    email: row.EMAIL
  };
}

function readCookie(req, name) {
  const rawCookie = req.headers.cookie || "";
  const cookies = rawCookie.split(";").map((part) => part.trim());
  const match = cookies.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function refreshCookie(token, expiresAt) {
  const parts = [
    `refreshToken=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/auth",
    `Expires=${expiresAt.toUTCString()}`
  ];

  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function clearRefreshCookie() {
  return [
    "refreshToken=",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/auth",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ].join("; ");
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token de acceso requerido." });
  }

  const payload = verifyJwt(token, authConfig.accessSecret);
  if (!payload || payload.tokenType !== "access") {
    return res.status(401).json({ error: "Token de acceso invalido o expirado." });
  }

  req.user = {
    id: Number(payload.sub),
    email: payload.email,
    nombre: payload.name
  };
  next();
}

async function findUserByEmail(connection, email) {
  const result = await connection.execute(
    `SELECT id, nombre, email, password_hash, activo
     FROM usuarios
     WHERE LOWER(email) = LOWER(:email)`,
    { email },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows[0] || null;
}

async function createRefreshSession(connection, user, req) {
  const refresh = createRefreshToken(user);
  await connection.execute(
    `INSERT INTO refresh_tokens (
       usuario_id,
       token_hash,
       expires_at,
       user_agent,
       ip_address
     ) VALUES (
       :usuario_id,
       :token_hash,
       :expires_at,
       :user_agent,
       :ip_address
     )`,
    {
      usuario_id: user.id,
      token_hash: refresh.tokenHash,
      expires_at: refresh.expiresAt,
      user_agent: (req.headers["user-agent"] || "").slice(0, 400) || null,
      ip_address: req.ip || null
    }
  );
  return refresh;
}

async function rotateRefreshSession(connection, refreshToken, req) {
  const payload = verifyJwt(refreshToken, authConfig.refreshSecret);
  if (!payload || payload.tokenType !== "refresh") return null;

  const tokenHash = hashRefreshToken(refreshToken);
  const result = await connection.execute(
    `SELECT rt.id, rt.usuario_id, u.nombre, u.email
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.usuario_id
     WHERE rt.token_hash = :token_hash
       AND rt.revoked_at IS NULL
       AND rt.expires_at > SYSTIMESTAMP
       AND u.activo = 1`,
    { token_hash: tokenHash },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const row = result.rows[0];
  if (!row || String(row.USUARIO_ID) !== String(payload.sub)) return null;

  await connection.execute(
    `UPDATE refresh_tokens
     SET revoked_at = SYSTIMESTAMP
     WHERE token_hash = :token_hash`,
    { token_hash: tokenHash }
  );

  const user = {
    id: row.USUARIO_ID,
    nombre: row.NOMBRE,
    email: row.EMAIL
  };
  const refresh = await createRefreshSession(connection, user, req);

  return { user, refresh };
}

async function ensureTodoOwner(connection, todoId, userId) {
  const result = await connection.execute(
    `SELECT usuario_id
     FROM todos
     WHERE id = :id`,
    { id: todoId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const row = result.rows[0];
  if (!row || Number(row.USUARIO_ID) !== Number(userId)) {
    const error = new Error("Tarea no encontrada.");
    error.status = 404;
    throw error;
  }
}

module.exports = {
  authConfig,
  createAccessToken,
  createRefreshSession,
  createRefreshToken,
  createUserFromRow,
  clearRefreshCookie,
  ensureTodoOwner,
  findUserByEmail,
  hashPassword,
  hashRefreshToken,
  readCookie,
  refreshCookie,
  requireAuth,
  rotateRefreshSession,
  verifyJwt,
  verifyPassword
};
