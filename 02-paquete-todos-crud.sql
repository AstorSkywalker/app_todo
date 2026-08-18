SET DEFINE OFF
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

CREATE OR REPLACE PACKAGE pkg_todos_crud AS
    PROCEDURE crear_todo (
        p_titulo IN todos.titulo%TYPE,
        p_descripcion IN todos.descripcion%TYPE DEFAULT NULL,
        p_prioridad IN todos.prioridad%TYPE DEFAULT 'media',
        p_fecha_vencimiento IN todos.fecha_vencimiento%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL,
        p_id OUT todos.id%TYPE
    );

    PROCEDURE obtener_todo (
        p_id IN todos.id%TYPE,
        p_resultado OUT SYS_REFCURSOR
    );

    PROCEDURE listar_todos (
        p_estado IN todos.estado%TYPE DEFAULT NULL,
        p_prioridad IN todos.prioridad%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL,
        p_solo_vencidas IN NUMBER DEFAULT 0,
        p_resultado OUT SYS_REFCURSOR
    );

    PROCEDURE actualizar_todo (
        p_id IN todos.id%TYPE,
        p_titulo IN todos.titulo%TYPE,
        p_descripcion IN todos.descripcion%TYPE DEFAULT NULL,
        p_estado IN todos.estado%TYPE DEFAULT 'pendiente',
        p_prioridad IN todos.prioridad%TYPE DEFAULT 'media',
        p_fecha_vencimiento IN todos.fecha_vencimiento%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL
    );

    PROCEDURE cambiar_estado (
        p_id IN todos.id%TYPE,
        p_estado IN todos.estado%TYPE
    );

    PROCEDURE eliminar_todo (
        p_id IN todos.id%TYPE
    );
END pkg_todos_crud;
/

CREATE OR REPLACE PACKAGE BODY pkg_todos_crud AS
    PROCEDURE validar_todo_existe (
        p_id IN todos.id%TYPE
    ) IS
        v_existe NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO v_existe
        FROM todos
        WHERE id = p_id;

        IF v_existe = 0 THEN
            RAISE_APPLICATION_ERROR(-20001, 'La tarea indicada no existe.');
        END IF;
    END validar_todo_existe;

    PROCEDURE crear_todo (
        p_titulo IN todos.titulo%TYPE,
        p_descripcion IN todos.descripcion%TYPE DEFAULT NULL,
        p_prioridad IN todos.prioridad%TYPE DEFAULT 'media',
        p_fecha_vencimiento IN todos.fecha_vencimiento%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL,
        p_id OUT todos.id%TYPE
    ) IS
    BEGIN
        INSERT INTO todos (
            titulo,
            descripcion,
            prioridad,
            fecha_vencimiento,
            usuario_id
        ) VALUES (
            p_titulo,
            p_descripcion,
            p_prioridad,
            p_fecha_vencimiento,
            p_usuario_id
        )
        RETURNING id INTO p_id;
    END crear_todo;

    PROCEDURE obtener_todo (
        p_id IN todos.id%TYPE,
        p_resultado OUT SYS_REFCURSOR
    ) IS
    BEGIN
        OPEN p_resultado FOR
            SELECT id,
                   titulo,
                   descripcion,
                   estado,
                   prioridad,
                   fecha_creacion,
                   fecha_actualizacion,
                   fecha_vencimiento,
                   fecha_completada,
                   usuario_id
            FROM todos
            WHERE id = p_id;
    END obtener_todo;

    PROCEDURE listar_todos (
        p_estado IN todos.estado%TYPE DEFAULT NULL,
        p_prioridad IN todos.prioridad%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL,
        p_solo_vencidas IN NUMBER DEFAULT 0,
        p_resultado OUT SYS_REFCURSOR
    ) IS
    BEGIN
        OPEN p_resultado FOR
            SELECT id,
                   titulo,
                   descripcion,
                   estado,
                   prioridad,
                   fecha_creacion,
                   fecha_actualizacion,
                   fecha_vencimiento,
                   fecha_completada,
                   usuario_id
            FROM todos
            WHERE (p_estado IS NULL OR estado = p_estado)
              AND (p_prioridad IS NULL OR prioridad = p_prioridad)
              AND (p_usuario_id IS NULL OR usuario_id = p_usuario_id)
              AND (
                    NVL(p_solo_vencidas, 0) = 0
                    OR (
                        fecha_vencimiento < SYSTIMESTAMP
                        AND estado NOT IN ('completada', 'cancelada')
                    )
                  )
            ORDER BY
                CASE prioridad
                    WHEN 'alta' THEN 1
                    WHEN 'media' THEN 2
                    WHEN 'baja' THEN 3
                    ELSE 4
                END,
                fecha_vencimiento NULLS LAST,
                fecha_creacion DESC;
    END listar_todos;

    PROCEDURE actualizar_todo (
        p_id IN todos.id%TYPE,
        p_titulo IN todos.titulo%TYPE,
        p_descripcion IN todos.descripcion%TYPE DEFAULT NULL,
        p_estado IN todos.estado%TYPE DEFAULT 'pendiente',
        p_prioridad IN todos.prioridad%TYPE DEFAULT 'media',
        p_fecha_vencimiento IN todos.fecha_vencimiento%TYPE DEFAULT NULL,
        p_usuario_id IN todos.usuario_id%TYPE DEFAULT NULL
    ) IS
    BEGIN
        UPDATE todos
        SET titulo = p_titulo,
            descripcion = p_descripcion,
            estado = p_estado,
            prioridad = p_prioridad,
            fecha_vencimiento = p_fecha_vencimiento,
            usuario_id = p_usuario_id
        WHERE id = p_id;

        IF SQL%ROWCOUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20001, 'La tarea indicada no existe.');
        END IF;
    END actualizar_todo;

    PROCEDURE cambiar_estado (
        p_id IN todos.id%TYPE,
        p_estado IN todos.estado%TYPE
    ) IS
    BEGIN
        UPDATE todos
        SET estado = p_estado
        WHERE id = p_id;

        IF SQL%ROWCOUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20001, 'La tarea indicada no existe.');
        END IF;
    END cambiar_estado;

    PROCEDURE eliminar_todo (
        p_id IN todos.id%TYPE
    ) IS
    BEGIN
        validar_todo_existe(p_id);

        DELETE FROM todos
        WHERE id = p_id;
    END eliminar_todo;
END pkg_todos_crud;
/

SHOW ERRORS PACKAGE pkg_todos_crud
SHOW ERRORS PACKAGE BODY pkg_todos_crud
