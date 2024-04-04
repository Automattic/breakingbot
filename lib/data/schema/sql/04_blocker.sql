DROP TABLE IF EXISTS blockers;

CREATE TABLE blockers (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL,
  whomst VARCHAR(255) NOT NULL,
  reason VARCHAR(2048),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  unblocked_at TIMESTAMP WITHOUT TIME ZONE,
  CONSTRAINT fk_blockers_incident_id FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_blockers_incident_id_whomst_reason ON blockers (incident_id, whomst, reason);
