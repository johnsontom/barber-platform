CREATE DATABASE IF NOT EXISTS barber_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE barber_platform;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'barber', 'admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS salons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_salons_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  salon_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price DECIMAL(8, 2) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_services_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  salon_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  appointment_at DATETIME NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_appointments_salon FOREIGN KEY (salon_id) REFERENCES salons(id),
  CONSTRAINT fk_appointments_service FOREIGN KEY (service_id) REFERENCES services(id)
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

INSERT INTO salons (name, address, city, description)
SELECT 'Northside Studio', '12 Example Road', 'London', 'A modern studio for precision fades and clean finishes.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'Northside Studio');

INSERT INTO salons (name, address, city, description)
SELECT 'The Gentlemen''s Room', '28 Sample Street', 'London', 'Classic cuts with a contemporary touch.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'The Gentlemen''s Room');

INSERT INTO salons (name, address, city, description)
SELECT 'Form & Fade', '5 Demo Lane', 'London', 'Detail-led grooming for your everyday style.'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE name = 'Form & Fade');
