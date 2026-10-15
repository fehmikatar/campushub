-- CampusHub User Service - initial schema (MySQL 8.4).
--
-- One table holds every user (UML Utilisateur). The UML subclasses Etudiant / Enseignant /
-- Administrateur are the role plus the one attribute that role owns: matricule / specialite /
-- service. The CHECK constraints below make the database itself refuse an attribute on the wrong
-- role, so the rule holds even for SQL written by hand.
--
-- Conventions:
--   * ids are UUIDs stored as CHAR(36) (hibernate.type.preferred_uuid_jdbc_type: CHAR), so they
--     stay readable in a MySQL client. Other CampusHub services reference users by this id.
--   * timestamps are DATETIME(6) in UTC (the JDBC URL pins the session time zone to UTC).
--   * enum values are compared with a binary collation, so 'etudiant' is rejected like 'XYZ':
--     the table's default collation (utf8mb4_0900_ai_ci) is case-insensitive.
CREATE TABLE users (
    id                  CHAR(36)     NOT NULL,
    email               VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    nom                 VARCHAR(100) NOT NULL,
    prenom              VARCHAR(100) NOT NULL,
    role                VARCHAR(20)  NOT NULL,
    status              VARCHAR(20)  NOT NULL,
    matricule           VARCHAR(20)  NULL,
    specialite          VARCHAR(100) NULL,
    service             VARCHAR(100) NULL,
    tokens_valid_after  DATETIME(6)  NULL,
    created_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_matricule UNIQUE (matricule),
    CONSTRAINT ck_users_role
        CHECK (role COLLATE utf8mb4_bin IN ('ETUDIANT', 'ENSEIGNANT', 'ADMIN')),
    CONSTRAINT ck_users_status
        CHECK (status COLLATE utf8mb4_bin IN ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED')),
    -- Each role-specific attribute belongs to its role only.
    CONSTRAINT ck_users_matricule_only_for_etudiant  CHECK (matricule IS NULL OR role = 'ETUDIANT'),
    CONSTRAINT ck_users_specialite_only_for_enseignant CHECK (specialite IS NULL OR role = 'ENSEIGNANT'),
    CONSTRAINT ck_users_service_only_for_admin       CHECK (service IS NULL OR role = 'ADMIN'),
    -- Only students can be awaiting approval, and an approved student always has a matricule.
    CONSTRAINT ck_users_pending_only_for_etudiant    CHECK (status <> 'PENDING_APPROVAL' OR role = 'ETUDIANT'),
    CONSTRAINT ck_users_approved_etudiant_has_matricule
        CHECK (role <> 'ETUDIANT' OR status = 'PENDING_APPROVAL' OR matricule IS NOT NULL)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_created_at ON users (created_at);
