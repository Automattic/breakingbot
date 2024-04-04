DROP TABLE IF EXISTS affected;

CREATE TABLE affected (
  incident_id BIGINT NOT NULL,
  what VARCHAR(2048) NOT NULL,
  CONSTRAINT fk_affected_incident_id FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_affected_incident_id_what ON affected (incident_id, what);
