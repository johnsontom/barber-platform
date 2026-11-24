CREATE DATABASE IF NOT EXISTS barber_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE barber_platform;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_version INT UNSIGNED NOT NULL DEFAULT 0,
  role ENUM('customer', 'barber', 'admin') NOT NULL DEFAULT 'customer',
  approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
  email_verification_required TINYINT UNSIGNED NOT NULL DEFAULT 1,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  issued_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  UNIQUE KEY uq_password_reset_hash (token_hash),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  issued_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  UNIQUE KEY uq_email_verification_hash (token_hash),
  CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_categories (
  slug VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  staff_singular VARCHAR(60) NOT NULL,
  staff_plural VARCHAR(60) NOT NULL,
  description VARCHAR(500) NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_category_enabled CHECK (enabled IN (0, 1))
);

INSERT IGNORE INTO service_categories (slug, name, staff_singular, staff_plural, description, enabled, sort_order) VALUES
  ('barbers', 'Barbers', 'Barber', 'Barbers', 'Find local barbers, compare cuts and grooming services, and book your next appointment.', 1, 10),
  ('nails', 'Nail salons', 'Nail technician', 'Nail technicians', 'Discover nail salons, compare manicures, pedicures and nail treatments, and book your visit.', 0, 20),
  ('massage', 'Massage salons', 'Massage therapist', 'Massage therapists', 'Find massage salons, compare treatments and therapists, and reserve time to relax.', 0, 30);


CREATE TABLE IF NOT EXISTS salons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT UNSIGNED NULL,
  category_slug VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'barbers',
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  home_service_settings JSON NULL,
  cover_image VARCHAR(500) NULL,
  status ENUM('active', 'suspended', 'banned', 'deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_salons_category_status (category_slug, status),
  CONSTRAINT fk_salons_category FOREIGN KEY (category_slug) REFERENCES service_categories(slug),
  CONSTRAINT fk_salons_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS salon_barbers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_id INT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  speciality VARCHAR(120) NOT NULL,
  email VARCHAR(190) NULL,
  bio TEXT,
  profile_image VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_salon_barbers_salon_id (salon_id),
  CONSTRAINT fk_salon_barbers_salon
    FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price DECIMAL(8, 2) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_services_salon
    FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS salon_barber_services (
  salon_id INT UNSIGNED NOT NULL,
  barber_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (barber_id, service_id),
  KEY idx_barber_services_salon_service (salon_id, service_id),
  CONSTRAINT fk_barber_services_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  CONSTRAINT fk_barber_services_barber FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT fk_barber_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS barber_weekly_availability (
  barber_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  is_working TINYINT UNSIGNED NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  PRIMARY KEY (barber_id, weekday),
  CONSTRAINT fk_weekly_availability_barber FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT chk_weekly_availability_day CHECK (weekday <= 6),
  CONSTRAINT chk_weekly_availability_shift CHECK (
    (is_working = 0 AND start_time IS NULL AND end_time IS NULL) OR
    (is_working = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL
      AND start_time >= '00:00:00' AND end_time < '24:00:00' AND start_time < end_time)
  )
);

CREATE TABLE IF NOT EXISTS barber_availability_dates (
  barber_id INT UNSIGNED NOT NULL,
  availability_date DATE NOT NULL,
  is_working TINYINT UNSIGNED NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  PRIMARY KEY (barber_id, availability_date),
  CONSTRAINT fk_date_availability_barber FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT chk_date_availability_shift CHECK (
    (is_working = 0 AND start_time IS NULL AND end_time IS NULL) OR
    (is_working = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL
      AND start_time >= '00:00:00' AND end_time < '24:00:00' AND start_time < end_time)
  )
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  salon_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  barber_id INT UNSIGNED NULL,
  appointment_at DATETIME NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  barber_email_sent_at DATETIME NULL,
  barber_email_recipient VARCHAR(190) NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointments_customer_time (customer_id, appointment_at),
  KEY idx_appointments_salon_time (salon_id, appointment_at),
  KEY idx_appointments_barber_time (barber_id, appointment_at),
  CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_appointments_salon FOREIGN KEY (salon_id) REFERENCES salons(id),
  CONSTRAINT fk_appointments_service FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_appointments_barber
    FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversations_salon_customer (salon_id, customer_id),
  KEY idx_conversations_customer_updated (customer_id, updated_at),
  KEY idx_conversations_salon_updated (salon_id, updated_at),
  CONSTRAINT fk_conversations_salon
    FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_customer
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  KEY idx_messages_conversation_created (conversation_id, created_at, id),
  KEY idx_messages_sender (sender_id),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS salon_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_salon_images_salon_id (salon_id),
  CONSTRAINT fk_salon_images_salon
    FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  salon_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_reviews_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
);

CREATE TABLE IF NOT EXISTS barber_reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  barber_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_barber_reviews_barber (barber_id),
  KEY idx_barber_reviews_customer (customer_id),
  CONSTRAINT chk_barber_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_barber_reviews_barber
    FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT fk_barber_reviews_customer
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- demo data
INSERT INTO salons (name, address, city, description)
SELECT 'Northside Studio', '12 Example Road', 'London', 'A modern studio for precision fades and clean finishes.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'Northside Studio');

INSERT INTO salons (name, address, city, description)
SELECT 'The Gentlemen''s Room', '28 Sample Street', 'London', 'Classic cuts with a contemporary touch.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'The Gentlemen''s Room');

INSERT INTO salons (name, address, city, description)
SELECT 'Form & Fade', '5 Demo Lane', 'London', 'Detail-led grooming for your everyday style.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'Form & Fade');

INSERT INTO salon_barbers (salon_id, full_name, speciality, bio)
SELECT s.id, sample.full_name, sample.speciality, sample.bio
FROM salons s
CROSS JOIN (
  SELECT
    'Maya Chen' AS full_name,
    'Skin fades and textured crops' AS speciality,
    'Maya is known for sharp fades and easy-to-style textured finishes.' AS bio
  UNION ALL
  SELECT
    'Ellis Ward',
    'Classic cuts and beard shaping',
    'Ellis brings a calm, classic finish to every cut and beard shape.'
  UNION ALL
  SELECT
    'Noah Brooks',
    'Fades, line-ups and beard design',
    'Noah focuses on clean lines, detailed fades and beard design.'
) AS sample
WHERE s.name IN ('Northside Studio', 'The Gentlemen''s Room', 'Form & Fade')
  AND NOT EXISTS (
    SELECT 1
    FROM salon_barbers existing
    WHERE existing.salon_id = s.id
      AND existing.full_name = sample.full_name
  );

INSERT INTO services (salon_id, name, description, price, duration_minutes)
SELECT s.id, sample.name, sample.description, sample.price, sample.duration_minutes
FROM salons s
CROSS JOIN (
  SELECT
    'Fade haircut' AS name,
    'A clean fade haircut.' AS description,
    22.00 AS price,
    40 AS duration_minutes
  UNION ALL
  SELECT 'Beard trim', 'A tidy beard trim and shape.', 12.00, 20
  UNION ALL
  SELECT 'Classic haircut', 'A classic haircut and finish.', 18.00, 30
) AS sample
WHERE s.name IN ('Northside Studio', 'The Gentlemen''s Room', 'Form & Fade')
  AND NOT EXISTS (
    SELECT 1
    FROM services existing
    WHERE existing.salon_id = s.id
      AND existing.name = sample.name
  );

-- Immutable booking quotes and travel reservations
-- Additive migration for MySQL 8. No existing appointments are changed.
CREATE TABLE IF NOT EXISTS appointment_quotes (
  appointment_id INT UNSIGNED NOT NULL PRIMARY KEY,
  booking_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  booking_type ENUM('salon', 'home') NOT NULL,
  service_address VARCHAR(500) NULL,
  service_price DECIMAL(10, 2) NOT NULL,
  service_duration_minutes SMALLINT UNSIGNED NOT NULL,
  outbound_distance_meters INT UNSIGNED NOT NULL DEFAULT 0,
  outbound_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  return_distance_meters INT UNSIGNED NOT NULL DEFAULT 0,
  return_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  round_trip_distance_meters INT UNSIGNED NOT NULL DEFAULT 0,
  travel_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quoted_total DECIMAL(10, 2) NOT NULL,
  estimated_departure_at DATETIME NOT NULL,
  estimated_completion_at DATETIME NOT NULL,
  estimated_return_at DATETIME NOT NULL,
  reserved_start DATETIME NOT NULL,
  reserved_end DATETIME NOT NULL,
  quoted_at DATETIME NOT NULL,
  quote_version VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_booking_token (booking_token_hash),
  KEY idx_quote_reserved_block (reserved_start, reserved_end),
  CONSTRAINT fk_quote_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  CONSTRAINT chk_quote_total CHECK (service_price >= 0 AND travel_fee >= 0 AND quoted_total = service_price + travel_fee),
  CONSTRAINT chk_quote_distance CHECK (round_trip_distance_meters = outbound_distance_meters + return_distance_meters),
  CONSTRAINT chk_quote_schedule CHECK (service_duration_minutes > 0 AND reserved_start <= estimated_departure_at
    AND estimated_departure_at < estimated_completion_at AND estimated_completion_at <= estimated_return_at
    AND estimated_return_at <= reserved_end),
  CONSTRAINT chk_quote_type CHECK (
    (booking_type = 'salon' AND service_address IS NULL AND round_trip_distance_meters = 0
      AND outbound_duration_minutes = 0 AND return_duration_minutes = 0 AND travel_fee = 0)
    OR (booking_type = 'home' AND service_address IS NOT NULL
      AND outbound_duration_minutes > 0 AND return_duration_minutes > 0)
  )
);

-- Additive community tables; existing accounts, salons and bookings are unchanged.
CREATE TABLE IF NOT EXISTS forum_posts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id INT UNSIGNED NOT NULL,
  category ENUM('website', 'salons', 'ideas') NOT NULL,
  salon_id INT UNSIGNED NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_forum_posts_created (created_at, id),
  KEY idx_forum_posts_category (category, created_at, id),
  KEY idx_forum_posts_salon (salon_id, created_at, id),
  CONSTRAINT fk_forum_post_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_post_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS forum_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id INT UNSIGNED NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_forum_comments_post (post_id, created_at, id),
  CONSTRAINT fk_forum_comment_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_comment_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forum_post_likes (
  post_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_forum_post_like_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_post_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forum_comment_likes (
  comment_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (comment_id, user_id),
  CONSTRAINT fk_forum_comment_like_comment FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_comment_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Independent home-visit rotas. Existing salon availability and bookings are preserved.
CREATE TABLE IF NOT EXISTS barber_home_weekly_availability (
  barber_id INT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  is_working TINYINT UNSIGNED NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  PRIMARY KEY (barber_id, weekday),
  CONSTRAINT fk_home_weekly_barber FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT chk_home_weekly_day CHECK (weekday <= 6),
  CONSTRAINT chk_home_weekly_shift CHECK (
    (is_working = 0 AND start_time IS NULL AND end_time IS NULL) OR
    (is_working = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL
      AND start_time >= '00:00:00' AND end_time < '24:00:00' AND start_time < end_time)
  )
);
CREATE TABLE IF NOT EXISTS barber_home_availability_dates (
  barber_id INT UNSIGNED NOT NULL,
  availability_date DATE NOT NULL,
  is_working TINYINT UNSIGNED NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  PRIMARY KEY (barber_id, availability_date),
  CONSTRAINT fk_home_date_barber FOREIGN KEY (barber_id) REFERENCES salon_barbers(id) ON DELETE CASCADE,
  CONSTRAINT chk_home_date_shift CHECK (
    (is_working = 0 AND start_time IS NULL AND end_time IS NULL) OR
    (is_working = 1 AND start_time IS NOT NULL AND end_time IS NOT NULL
      AND start_time >= '00:00:00' AND end_time < '24:00:00' AND start_time < end_time)
  )
);

-- Additive fee ledger. Existing quotes remain service + travel only.
ALTER TABLE appointments MODIFY status ENUM('pending','confirmed','cancelled','completed','awaiting_payment') NOT NULL DEFAULT 'pending';
CREATE TABLE IF NOT EXISTS platform_fee_settings (
  booking_type ENUM('salon','home') NOT NULL PRIMARY KEY,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  fee_mode ENUM('fixed','percentage') NOT NULL DEFAULT 'fixed',
  fixed_pence INT UNSIGNED NOT NULL DEFAULT 200,
  percentage_basis_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id),
  CHECK (enabled IN (0,1) AND fixed_pence <= 100000 AND percentage_basis_points <= 10000)
);
INSERT IGNORE INTO platform_fee_settings (booking_type) VALUES ('salon'), ('home');
CREATE TABLE IF NOT EXISTS booking_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  booking_type ENUM('salon','home') NOT NULL,
  fee_pence INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'gbp',
  settings_version INT UNSIGNED NOT NULL,
  status ENUM('created','pending','paid','failed','expired') NOT NULL DEFAULT 'created',
  checkout_session_id VARCHAR(255) CHARACTER SET ascii NULL,
  payment_intent_id VARCHAR(255) CHARACTER SET ascii NULL,
  hold_expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  failure_code VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fee_appointment (appointment_id),
  UNIQUE KEY uq_fee_checkout (checkout_session_id),
  UNIQUE KEY uq_fee_intent (payment_intent_id),
  KEY idx_fee_customer (customer_id,created_at),
  KEY idx_fee_status (status,hold_expires_at),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  CHECK (fee_pence > 0 AND currency = 'gbp')
);
CREATE TABLE IF NOT EXISTS booking_refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
  refund_pence INT UNSIGNED NOT NULL,
  attempt_number INT UNSIGNED NOT NULL DEFAULT 1,
  provider_refund_id VARCHAR(255) CHARACTER SET ascii NULL,
  failure_code VARCHAR(80) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refunded_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_refund_payment (payment_id),
  UNIQUE KEY uq_refund_provider (provider_refund_id),
  KEY idx_refund_status (status,requested_at),
  FOREIGN KEY (payment_id) REFERENCES booking_payments(id),
  CHECK (refund_pence > 0)
);
CREATE TABLE IF NOT EXISTS booking_refund_attempts (
  refund_id BIGINT UNSIGNED NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  provider_refund_id VARCHAR(255) CHARACTER SET ascii NULL,
  status ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
  failure_code VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (refund_id,attempt_number),
  UNIQUE KEY uq_refund_attempt_provider (provider_refund_id),
  FOREIGN KEY (refund_id) REFERENCES booking_refunds(id)
);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  provider_event_id VARCHAR(255) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_key VARCHAR(190) CHARACTER SET ascii NOT NULL,
  kind ENUM('refund','notice') NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending','running','done','failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  run_after DATETIME NOT NULL,
  lease_until DATETIME NULL,
  lease_token CHAR(64) CHARACTER SET ascii NULL,
  failure_code VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_platform_job (job_key),
  KEY idx_job_ready (status,run_after,lease_until)
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  reason VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity_type,entity_id,created_at),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS platform_notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notice_key VARCHAR(190) CHARACTER SET ascii NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notice_user (user_id,created_at),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);

CREATE TABLE IF NOT EXISTS chat_moderation_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  message_body TEXT NULL,
  categories JSON NOT NULL,
  level ENUM('warning','block','review') NOT NULL,
  blocked TINYINT UNSIGNED NOT NULL,
  review_status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
  appeal_text VARCHAR(1000) NULL,
  appealed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_chatguard_request (user_id,request_hash),
  KEY idx_chatguard_user (user_id,created_at),
  KEY idx_chatguard_review (review_status,level,created_at),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  CHECK (blocked IN (0,1))
);
CREATE TABLE IF NOT EXISTS user_restrictions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  scope ENUM('messaging','account') NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_restriction_user (user_id,scope,revoked_at,expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS chat_message_requests (
  user_id INT UNSIGNED NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,request_hash),
  UNIQUE KEY uq_chat_request_message (message_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS appointment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  kind ENUM('created', 'updated') NOT NULL,
  previous_status VARCHAR(30) NULL,
  status VARCHAR(30) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_appointment_events_appointment (appointment_id, id),
  CONSTRAINT fk_appointment_event_booking FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointment_notification_reads (
  user_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NOT NULL,
  last_event_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, appointment_id),
  CONSTRAINT fk_appointment_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_appointment_read_booking FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

-- Each event commits or rolls back with its appointment, including payment
-- worker changes. Reinstalling these triggers preserves all notifications.
DROP TRIGGER IF EXISTS appointment_notify_insert;
CREATE TRIGGER appointment_notify_insert AFTER INSERT ON appointments FOR EACH ROW
  INSERT INTO appointment_events (appointment_id, kind, status) VALUES (NEW.id, 'created', NEW.status);

DROP TRIGGER IF EXISTS appointment_notify_update;
CREATE TRIGGER appointment_notify_update AFTER UPDATE ON appointments FOR EACH ROW
  INSERT INTO appointment_events (appointment_id, kind, previous_status, status)
  SELECT NEW.id, 'updated', OLD.status, NEW.status
  WHERE NOT (OLD.status <=> NEW.status)
     OR NOT (OLD.appointment_at <=> NEW.appointment_at)
     OR NOT (OLD.service_id <=> NEW.service_id)
     OR NOT (OLD.barber_id <=> NEW.barber_id)
     OR NOT (OLD.salon_id <=> NEW.salon_id)
     OR NOT (OLD.notes <=> NEW.notes);
