-- Runs when the remote-backed connection resets.
CREATE TABLE IF NOT EXISTS example_setup_marker (ran_at TIMESTAMP);
INSERT INTO example_setup_marker VALUES (CURRENT_TIMESTAMP);
