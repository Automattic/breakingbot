DROP TABLE IF EXISTS usercache;

--
-- Table structure for table `usercache`
--
CREATE TABLE usercache (
  chat_user_id VARCHAR(2048) PRIMARY KEY,
  tracker_user_id VARCHAR(2048),
  reporter_user_id VARCHAR(2048),
  name VARCHAR(255),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
