SET DEFINE OFF
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

DECLARE
    PROCEDURE add_column_if_missing (
        p_column_name IN VARCHAR2,
        p_definition IN VARCHAR2
    ) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM user_tab_columns
        WHERE table_name = 'TODOS'
          AND column_name = UPPER(p_column_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE todos ADD (' || p_definition || ')';
        END IF;
    END add_column_if_missing;
BEGIN
    add_column_if_missing('estado', 'estado VARCHAR2(20) DEFAULT ''pendiente'' NOT NULL');
    add_column_if_missing('prioridad', 'prioridad VARCHAR2(20) DEFAULT ''media'' NOT NULL');
    add_column_if_missing('fecha_actualizacion', 'fecha_actualizacion TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL');
    add_column_if_missing('fecha_vencimiento', 'fecha_vencimiento TIMESTAMP NULL');
    add_column_if_missing('fecha_completada', 'fecha_completada TIMESTAMP NULL');
    add_column_if_missing('usuario_id', 'usuario_id NUMBER NULL');
END;
/

UPDATE todos
SET estado = CASE
        WHEN UPPER(TRIM(completado)) IN ('S', 'Y', '1') THEN 'completada'
        ELSE 'pendiente'
    END
WHERE estado IS NULL
   OR estado NOT IN ('pendiente', 'en_progreso', 'completada', 'cancelada');

UPDATE todos
SET fecha_vencimiento = CAST(fecha_limite AS TIMESTAMP)
WHERE fecha_vencimiento IS NULL
  AND fecha_limite IS NOT NULL;

UPDATE todos
SET fecha_completada = COALESCE(fecha_completado, SYSTIMESTAMP)
WHERE estado = 'completada'
  AND fecha_completada IS NULL;

UPDATE todos
SET fecha_actualizacion = COALESCE(fecha_modificacion, fecha_creacion, SYSTIMESTAMP)
WHERE fecha_actualizacion IS NULL;

COMMIT;

DECLARE
    PROCEDURE add_constraint_if_missing (
        p_constraint_name IN VARCHAR2,
        p_definition IN VARCHAR2
    ) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM user_constraints
        WHERE table_name = 'TODOS'
          AND constraint_name = UPPER(p_constraint_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE todos ADD CONSTRAINT ' || p_constraint_name || ' ' || p_definition;
        END IF;
    END add_constraint_if_missing;
BEGIN
    add_constraint_if_missing(
        'ck_todos_estado',
        'CHECK (estado IN (''pendiente'', ''en_progreso'', ''completada'', ''cancelada''))'
    );
    add_constraint_if_missing(
        'ck_todos_prioridad',
        'CHECK (prioridad IN (''baja'', ''media'', ''alta''))'
    );
    add_constraint_if_missing(
        'ck_todos_titulo_no_vacio',
        'CHECK (TRIM(titulo) IS NOT NULL)'
    );
    add_constraint_if_missing(
        'ck_todos_fechas',
        'CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_creacion)'
    );
    add_constraint_if_missing(
        'ck_todos_fecha_completada',
        'CHECK ((estado = ''completada'' AND fecha_completada IS NOT NULL) OR (estado <> ''completada'' AND fecha_completada IS NULL))'
    );
END;
/

DECLARE
    PROCEDURE create_index_if_missing (
        p_index_name IN VARCHAR2,
        p_definition IN VARCHAR2
    ) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM user_indexes
        WHERE index_name = UPPER(p_index_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'CREATE INDEX ' || p_index_name || ' ON todos ' || p_definition;
        END IF;
    END create_index_if_missing;
BEGIN
    create_index_if_missing('idx_todos_estado', '(estado)');
    create_index_if_missing('idx_todos_prioridad', '(prioridad)');
    create_index_if_missing('idx_todos_usuario_id', '(usuario_id)');
    create_index_if_missing('idx_todos_fecha_vencimiento', '(fecha_vencimiento)');
    create_index_if_missing('idx_todos_estado_prioridad', '(estado, prioridad)');
END;
/

CREATE OR REPLACE TRIGGER trg_todos_fechas
BEFORE INSERT OR UPDATE ON todos
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        :NEW.fecha_creacion := COALESCE(:NEW.fecha_creacion, SYSTIMESTAMP);
        :NEW.fecha_actualizacion := COALESCE(:NEW.fecha_actualizacion, :NEW.fecha_creacion);
    ELSE
        :NEW.fecha_actualizacion := SYSTIMESTAMP;
    END IF;

    IF :NEW.estado = 'completada' AND (INSERTING OR :OLD.estado <> 'completada') THEN
        :NEW.fecha_completada := SYSTIMESTAMP;
    ELSIF :NEW.estado <> 'completada' THEN
        :NEW.fecha_completada := NULL;
    END IF;
END;
/

SHOW ERRORS TRIGGER trg_todos_fechas
