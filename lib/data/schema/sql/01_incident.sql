DROP TABLE IF EXISTS incidents;

--
-- Table structure for table `incidents`
--
CREATE TABLE incidents (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  summary TEXT,
  chat_room_uid VARCHAR(2048) UNIQUE,
  tracker_uid VARCHAR(2048) UNIQUE,
  priority SMALLINT NOT NULL,
  point VARCHAR(255),
  comms VARCHAR(255),
  triage VARCHAR(255),
  eng_lead VARCHAR(255),
  assigned VARCHAR(255),
  genesis_at TIMESTAMP WITHOUT TIME ZONE,
  detected_at TIMESTAMP WITHOUT TIME ZONE,
  acknowledged_at TIMESTAMP WITHOUT TIME ZONE,
  mitigated_at TIMESTAMP WITHOUT TIME ZONE,
  resolved_at TIMESTAMP WITHOUT TIME ZONE,
  rfr_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  archived_at TIMESTAMP WITHOUT TIME ZONE,
  canceled_at TIMESTAMP WITHOUT TIME ZONE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

-- If you need to start above a certain value, uncomment this
--
-- ALTER SEQUENCE incidents_id_seq RESTART WITH 200;
--
