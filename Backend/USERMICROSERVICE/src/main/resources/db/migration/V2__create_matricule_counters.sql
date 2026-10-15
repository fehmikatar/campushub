-- One counter row per calendar year for student matricules (ETU<year><number>, e.g. ETU20260001).
-- MatriculeGenerator increments a row with a single
--   INSERT ... ON DUPLICATE KEY UPDATE last_number = last_number + 1
-- which locks the row until the approving transaction commits, so two concurrent approvals can
-- never receive the same number.
CREATE TABLE matricule_counters (
    academic_year  INT NOT NULL,
    last_number    INT NOT NULL,
    PRIMARY KEY (academic_year),
    CONSTRAINT ck_matricule_counters_positive CHECK (last_number > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;
