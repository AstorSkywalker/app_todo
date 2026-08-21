SET DEFINE OFF
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

CREATE TABLE password_reset_tokens (
    id RAW(16) DEFAULT SYS_GUID(),
    usuario_id NUMBER NOT NULL,
    token_hash VARCHAR2(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    user_agent VARCHAR2(400) NULL,
    ip_address VARCHAR2(64) NULL,
    CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id),
    CONSTRAINT fk_password_reset_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ux_password_reset_token_hash
    ON password_reset_tokens (token_hash);

CREATE INDEX idx_password_reset_usuario
    ON password_reset_tokens (usuario_id);

CREATE INDEX idx_password_reset_expires
    ON password_reset_tokens (expires_at);

COMMENT ON TABLE password_reset_tokens IS 'Tokens de un solo uso para restablecer contrasenias';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'SHA-256 del token enviado por correo';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Fecha en que el token fue utilizado o invalidado';
