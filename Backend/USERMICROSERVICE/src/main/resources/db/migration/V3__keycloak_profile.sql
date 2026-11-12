-- Keycloak est la source d'identité : la table ne garde que le profil.
-- id = sub du token Keycloak. Plus de mot de passe, de statut ni de matricule.
DROP TABLE IF EXISTS matricule_counters;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id          CHAR(36)     NOT NULL,
    email       VARCHAR(255) NULL,
    nom         VARCHAR(100) NOT NULL,
    prenom      VARCHAR(100) NOT NULL,
    role        VARCHAR(20)  NOT NULL,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT ck_users_role
        CHECK (role COLLATE utf8mb4_bin IN ('ETUDIANT', 'ENSEIGNANT', 'ADMIN'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

CREATE INDEX idx_users_role ON users (role);