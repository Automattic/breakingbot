DROP TABLE IF EXISTS log;

CREATE TABLE log (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL,
  type VARCHAR(255)  NOT NULL,
  text TEXT NOT NULL,
  context_url VARCHAR(2048),
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  CONSTRAINT fk_log_incident_id FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
);

CREATE INDEX idx_log_incident_id ON log (incident_id);
