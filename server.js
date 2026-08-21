const express = require("express");
const oracledb = require("oracledb");
const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));

const {
  authConfig,
  createAccessToken,
  createRefreshSession,
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
  verifyPassword
} = require("./auth");

const app = express();
const port = Number(process.env.PORT || 3000);

if (process.env.ORACLE_USE_THICK !== "false") {
  try {
    oracledb.initOracleClient({
      libDir: process.env.ORACLE_CLIENT_LIB_DIR || "C:\\oracle_21c_client\\bin",
      configDir: process.env.ORACLE_CLIENT_CONFIG_DIR || path.join(__dirname, "config", "adb")
    });
  } catch (error) {
    if (!String(error.message).includes("has already been initialized")) {
      throw error;
    }
  }
}

oracledb.fetchAsString = [oracledb.CLOB];

const poolOptions = {
  poolMin: 1,
  poolMax: 5,
  poolIncrement: 1
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      process.env[key] = value;
    }
  }
}

const dbProfiles = {
  local: {
    label: "Oracle Free local",
    user: process.env.ORACLE_LOCAL_USER || process.env.ORACLE_USER || "app_todo",
    password: process.env.ORACLE_LOCAL_PASSWORD || process.env.ORACLE_PASSWORD,
    connectString:
      process.env.ORACLE_LOCAL_CONNECT_STRING ||
      process.env.ORACLE_CONNECT_STRING ||
      "//localhost:1521/freepdb1"
  },
  cloud: {
    label: "Oracle ADB",
    user: process.env.ORACLE_CLOUD_USER || "app_todo",
    password: process.env.ORACLE_CLOUD_PASSWORD,
    connectString: process.env.ORACLE_CLOUD_CONNECT_STRING || "oracle23ai_low"
  }
};

let activeProfile = process.env.ORACLE_DB_PROFILE || "local";
const pools = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function toTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Fecha invalida.");
    error.status = 400;
    throw error;
  }
  return date;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    const error = new Error("Numero invalido.");
    error.status = 400;
    throw error;
  }
  return numberValue;
}

async function withConnection(callback) {
  let connection;
  try {
    const pool = await getPool(activeProfile);
    connection = await pool.getConnection();
    return await callback(connection);
  } finally {
    if (connection) await connection.close();
  }
}

function publicProfile(profileName) {
  const profile = dbProfiles[profileName];
  return {
    name: profileName,
    label: profile.label,
    user: profile.user,
    connectString: profile.connectString,
    active: profileName === activeProfile
  };
}

async function getPool(profileName) {
  const profile = dbProfiles[profileName];

  if (!profile) {
    const error = new Error("Perfil de base de datos invalido.");
    error.status = 400;
    throw error;
  }

  if (!profile.password) {
    const error = new Error(`Falta la contrasenia para el perfil ${profileName}.`);
    error.status = 500;
    throw error;
  }

  if (!pools.has(profileName)) {
    const { label, ...connectionConfig } = profile;
    pools.set(
      profileName,
      await oracledb.createPool({
        ...poolOptions,
        ...connectionConfig
      })
    );
  }

  return pools.get(profileName);
}

async function rowsFromCursor(resultSet) {
  try {
    const rows = [];
    while (true) {
      const batch = await resultSet.getRows(100);
      if (batch.length === 0) break;
      rows.push(...batch);
    }
    return rows;
  } finally {
    await resultSet.close();
  }
}

function todoFromRow(row) {
  return {
    id: row.ID,
    titulo: row.TITULO,
    descripcion: row.DESCRIPCION,
    estado: row.ESTADO,
    prioridad: row.PRIORIDAD,
    fechaCreacion: row.FECHA_CREACION,
    fechaActualizacion: row.FECHA_ACTUALIZACION,
    fechaVencimiento: row.FECHA_VENCIMIENTO,
    fechaCompletada: row.FECHA_COMPLETADA,
    usuarioId: row.USUARIO_ID
  };
}

app.get("/api/health", async (req, res, next) => {
  try {
    const result = await withConnection((connection) =>
      connection.execute("SELECT SYSTIMESTAMP AS fecha FROM dual", [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      })
    );
    res.json({
      ok: true,
      profile: publicProfile(activeProfile),
      databaseTime: result.rows[0].FECHA
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/db/profile", (req, res) => {
  res.json({
    active: activeProfile,
    profiles: Object.keys(dbProfiles).map(publicProfile)
  });
});

app.put("/api/db/profile", requireAuth, async (req, res, next) => {
  try {
    const requestedProfile = req.body.profile;

    if (!dbProfiles[requestedProfile]) {
      return res.status(400).json({ error: "Perfil de base de datos invalido." });
    }

    await getPool(requestedProfile);
    activeProfile = requestedProfile;

    res.json({
      active: activeProfile,
      profiles: Object.keys(dbProfiles).map(publicProfile)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Nombre, email y contrasenia son obligatorios." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "La contrasenia debe tener al menos 8 caracteres." });
    }

    const user = await withConnection(async (connection) => {
      const existingUser = await findUserByEmail(connection, email);
      if (existingUser) {
        const error = new Error("Ya existe un usuario con ese email.");
        error.status = 409;
        throw error;
      }

      const passwordHash = await hashPassword(password);
      const result = await connection.execute(
        `INSERT INTO usuarios (nombre, email, password_hash)
         VALUES (:nombre, :email, :password_hash)
         RETURNING id INTO :id`,
        {
          nombre,
          email,
          password_hash: passwordHash,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      await connection.commit();

      return {
        id: result.outBinds.id[0],
        nombre,
        email
      };
    });

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contrasenia son obligatorios." });
    }

    const session = await withConnection(async (connection) => {
      const row = await findUserByEmail(connection, email);
      const validPassword = row ? await verifyPassword(password, row.PASSWORD_HASH) : false;

      if (!row || row.ACTIVO !== 1 || !validPassword) {
        const error = new Error("Credenciales invalidas.");
        error.status = 401;
        throw error;
      }

      const user = createUserFromRow(row);
      const refresh = await createRefreshSession(connection, user, req);
      await connection.commit();

      return {
        user,
        refresh,
        accessToken: createAccessToken(user)
      };
    });

    res.setHeader("Set-Cookie", refreshCookie(session.refresh.token, session.refresh.expiresAt));
    res.json({
      user: session.user,
      accessToken: session.accessToken,
      expiresInSeconds: authConfig.accessExpiresInSeconds
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/refresh", async (req, res, next) => {
  try {
    const refreshToken = readCookie(req, "refreshToken") || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token requerido." });
    }

    const session = await withConnection(async (connection) => {
      const rotatedSession = await rotateRefreshSession(connection, refreshToken, req);
      if (!rotatedSession) {
        const error = new Error("Refresh token invalido o expirado.");
        error.status = 401;
        throw error;
      }

      await connection.commit();
      return {
        ...rotatedSession,
        accessToken: createAccessToken(rotatedSession.user)
      };
    });

    res.setHeader("Set-Cookie", refreshCookie(session.refresh.token, session.refresh.expiresAt));
    res.json({
      user: session.user,
      accessToken: session.accessToken,
      expiresInSeconds: authConfig.accessExpiresInSeconds
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const refreshToken = readCookie(req, "refreshToken") || req.body?.refreshToken;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await withConnection(async (connection) => {
        await connection.execute(
          `UPDATE refresh_tokens
           SET revoked_at = COALESCE(revoked_at, SYSTIMESTAMP)
           WHERE token_hash = :token_hash`,
          { token_hash: tokenHash }
        );
        await connection.commit();
      });
    }

    res.setHeader("Set-Cookie", clearRefreshCookie());
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/todos", requireAuth, async (req, res, next) => {
  try {
    const rows = await withConnection(async (connection) => {
      const result = await connection.execute(
        `BEGIN
           pkg_todos_crud.listar_todos(
             p_estado => :estado,
             p_prioridad => :prioridad,
             p_usuario_id => :usuario_id,
             p_solo_vencidas => :solo_vencidas,
             p_resultado => :resultado
           );
         END;`,
        {
          estado: req.query.estado || null,
          prioridad: req.query.prioridad || null,
          usuario_id: req.user.id,
          solo_vencidas: req.query.soloVencidas === "1" ? 1 : 0,
          resultado: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return rowsFromCursor(result.outBinds.resultado);
    });

    res.json(rows.map(todoFromRow));
  } catch (error) {
    next(error);
  }
});

app.get("/api/todos/:id", requireAuth, async (req, res, next) => {
  try {
    const rows = await withConnection(async (connection) => {
      await ensureTodoOwner(connection, Number(req.params.id), req.user.id);
      const result = await connection.execute(
        `BEGIN
           pkg_todos_crud.obtener_todo(
             p_id => :id,
             p_resultado => :resultado
           );
         END;`,
        {
          id: Number(req.params.id),
          resultado: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return rowsFromCursor(result.outBinds.resultado);
    });

    if (rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada." });
    res.json(todoFromRow(rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/todos", requireAuth, async (req, res, next) => {
  try {
    const body = req.body;
    const result = await withConnection(async (connection) => {
      const response = await connection.execute(
        `BEGIN
           pkg_todos_crud.crear_todo(
             p_titulo => :titulo,
             p_descripcion => :descripcion,
             p_prioridad => :prioridad,
             p_fecha_vencimiento => :fecha_vencimiento,
             p_usuario_id => :usuario_id,
             p_id => :id
           );
         END;`,
        {
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          prioridad: body.prioridad || "media",
          fecha_vencimiento: toTimestamp(body.fechaVencimiento),
          usuario_id: req.user.id,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      await connection.commit();
      return response;
    });

    res.status(201).json({ id: result.outBinds.id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/todos/:id", requireAuth, async (req, res, next) => {
  try {
    const body = req.body;
    await withConnection(async (connection) => {
      await ensureTodoOwner(connection, Number(req.params.id), req.user.id);
      await connection.execute(
        `BEGIN
           pkg_todos_crud.actualizar_todo(
             p_id => :id,
             p_titulo => :titulo,
             p_descripcion => :descripcion,
             p_estado => :estado,
             p_prioridad => :prioridad,
             p_fecha_vencimiento => :fecha_vencimiento,
             p_usuario_id => :usuario_id
           );
         END;`,
        {
          id: Number(req.params.id),
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          estado: body.estado || "pendiente",
          prioridad: body.prioridad || "media",
          fecha_vencimiento: toTimestamp(body.fechaVencimiento),
          usuario_id: req.user.id
        }
      );
      await connection.commit();
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/todos/:id/estado", requireAuth, async (req, res, next) => {
  try {
    await withConnection(async (connection) => {
      await ensureTodoOwner(connection, Number(req.params.id), req.user.id);
      await connection.execute(
        `BEGIN
           pkg_todos_crud.cambiar_estado(
             p_id => :id,
             p_estado => :estado
           );
         END;`,
        {
          id: Number(req.params.id),
          estado: req.body.estado
        }
      );
      await connection.commit();
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/todos/:id", requireAuth, async (req, res, next) => {
  try {
    await withConnection(async (connection) => {
      await ensureTodoOwner(connection, Number(req.params.id), req.user.id);
      await connection.execute(
        `BEGIN
           pkg_todos_crud.eliminar_todo(p_id => :id);
         END;`,
        { id: Number(req.params.id) }
      );
      await connection.commit();
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  const status = error.status || (error.errorNum === 20001 ? 404 : 500);
  const message = error.message || "Error inesperado.";
  res.status(status).json({ error: message });
});

async function start() {
  await getPool(activeProfile);
  app.listen(port, () => {
    console.log(`TODO app disponible en http://localhost:${port}`);
    console.log(`Perfil de base activo: ${activeProfile}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar la aplicacion:", error);
  process.exit(1);
});
