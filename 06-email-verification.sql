SET DEFINE OFF
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

ALTER TABLE usuarios ADD email_verificado_at TIMESTAMP NULL;

UPDATE usuarios
SET email_verificado_at = COALESCE(fecha_creacion, SYSTIMESTAMP)
WHERE email_verificado_at IS NULL;

COMMIT;

CREATE TABLE email_verification_tokens (
    id RAW(16) DEFAULT SYS_GUID(),
    usuario_id NUMBER NOT NULL,
    token_hash VARCHAR2(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    user_agent VARCHAR2(400) NULL,
    ip_address VARCHAR2(64) NULL,
    CONSTRAINT pk_email_verification_tokens PRIMARY KEY (id),
    CONSTRAINT fk_email_verification_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ux_email_verification_token_hash
    ON email_verification_tokens (token_hash);

CREATE INDEX idx_email_verification_usuario
    ON email_verification_tokens (usuario_id);

CREATE INDEX idx_email_verification_expires
    ON email_verification_tokens (expires_at);

COMMENT ON TABLE email_verification_tokens IS 'Tokens de un solo uso para confirmar correos';
COMMENT ON COLUMN email_verification_tokens.token_hash IS 'SHA-256 del token enviado por correo';
COMMENT ON COLUMN email_verification_tokens.used_at IS 'Fecha en que el token fue utilizado o invalidado';
