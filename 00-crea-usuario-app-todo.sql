SET DEFINE ON
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE

ACCEPT app_todo_password CHAR PROMPT 'Password para app_todo: '

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM all_users
    WHERE username = 'APP_TODO';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE USER app_todo IDENTIFIED BY "' || REPLACE('&app_todo_password', '"', '""') || '" DEFAULT TABLESPACE users TEMPORARY TABLESPACE temp QUOTA UNLIMITED ON users';
    ELSE
        EXECUTE IMMEDIATE 'ALTER USER app_todo IDENTIFIED BY "' || REPLACE('&app_todo_password', '"', '""') || '" ACCOUNT UNLOCK';
        EXECUTE IMMEDIATE 'ALTER USER app_todo QUOTA UNLIMITED ON users';
    END IF;
END;
/

GRANT CREATE SESSION TO app_todo;
GRANT CREATE TABLE TO app_todo;
GRANT CREATE TRIGGER TO app_todo;
GRANT CREATE PROCEDURE TO app_todo;
GRANT CREATE SEQUENCE TO app_todo;
