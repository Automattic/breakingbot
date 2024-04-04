DROP TABLE IF EXISTS components;

CREATE TABLE components (
  incident_id BIGINT NOT NULL,
  which VARCHAR(2048) NOT NULL,
  CONSTRAINT fk_components_incident_id FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_components_incident_id_which ON components (incident_id, which);