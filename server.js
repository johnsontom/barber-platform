
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const mysql = require("mysql2/promise");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");

// -------------------- SALON IMAGE UPLOADS --------------------

const salonUploadDir = path.join(
  __dirname,
  "public",
  "uploads",
  "salons"
);

fs.mkdirSync(salonUploadDir, { recursive: true });

const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const salonStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, salonUploadDir);
  },

  filename: (req, file, cb) => {
    const extension = allowedImageTypes[file.mimetype];

    if (!extension) {
      return cb(new Error("Only JPG, PNG and WebP images are allowed."));
    }

    cb(null, `${crypto.randomUUID()}${extension}`);
  }
});

const salonUpload = multer({
  storage: salonStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8
  },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes[file.mimetype]) {
      return cb(
        new Error("Only JPG, PNG and WebP images are allowed.")
      );
    }

    cb(null, true);
  }
});

// Return a clear response for Multer upload errors.
function handleSalonUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (error) {
        return res.status(400).send(
          error instanceof multer.MulterError
            ? "Upload failed. Images must be no larger than 5 MB each, with a maximum of 8 gallery images."
            : error.message
        );
      }

      next();
    });
  };
}
const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "barber_platform",
  createDatabaseTable: true
});

app.use(session({
  name: "barber.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "barber_platform",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  return pool;
}

// -------------------- ACCESS CONTROL --------------------

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).send("Platform administrator access required.");
  }

  next();
}

// Recheck approval in MySQL on every protected barber request.
async function requireBarber(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  if (req.session.user.role !== "barber") {
    return res.status(403).send("A salon owner account is required.");
  }

  try {
    const db = getPool();

    const [rows] = await db.execute(
      `SELECT approval_status
       FROM users
       WHERE id = ? AND role = 'barber'
       LIMIT 1`,
      [req.session.user.id]
    );

    if (!rows.length || rows[0].approval_status !== "approved") {
      return res.status(403).send(
        "Your salon owner application must be approved before you can manage a salon."
      );
    }

    next();
  } catch (error) {
    console.error("Owner permission check failed:", error);
    res.status(500).send("Unable to verify salon owner access.");
  }
}

// -------------------- PUBLIC HOMEPAGE --------------------

app.get("/", async (req, res) => {
  try {
    const db = getPool();
    const location = String(req.query.location || "").trim();
    const service = String(req.query.service || "").trim();

    let sql = `
      SELECT s.id, s.name, s.address, s.city, s.description, s.cover_image
      FROM salons s
      WHERE 1 = 1
    `;

    const params = [];

    if (location) {
      sql += `
        AND (
          s.name LIKE ?
          OR s.address LIKE ?
          OR s.city LIKE ?
        )
      `;

      const term = `%${location}%`;
      params.push(term, term, term);
    }

    const servicePatterns = {
      fade: "%fade%",
      beard: "%beard%",
      "full-cut": "%haircut%"
    };

    if (servicePatterns[service]) {
      sql += `
        AND EXISTS (
          SELECT 1
          FROM services sv
          WHERE sv.salon_id = s.id
            AND LOWER(sv.name) LIKE ?
        )
      `;

      params.push(servicePatterns[service]);
    }

    sql += " ORDER BY s.name ASC";

    const [salons] = await db.execute(sql, params);

// Load saved gallery images for the salons in the search results.
    const salonIds = salons.map((salon) => salon.id);

    if (salonIds.length > 0) {
      const placeholders = salonIds.map(() => "?").join(", ");

      const [images] = await db.execute(
        `SELECT id, salon_id, image_url
        FROM salon_images
        WHERE salon_id IN (${placeholders})
        ORDER BY created_at DESC`,
        salonIds
      );

      for (const salon of salons) {
        salon.galleryImages = images.filter(
          (image) => Number(image.salon_id) === Number(salon.id)
        );
      }
    } else {
      for (const salon of salons) {
        salon.galleryImages = [];
      }
    }

    res.render("index", {
      title: "Barber Platform | Find your next cut",
      page: "home",
      salons,
      location,
      service
    });
  } catch (error) {
    console.error("Homepage error:", error);
    res.status(500).send("Unable to load salons. Please try again.");
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "barber-platform" });
});

app.get("/api/salons", async (req, res) => {
  try {
    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id, name, address, city, description
       FROM salons
       ORDER BY name ASC`
    );

    res.json(salons);
  } catch (error) {
    console.error("Salon API error:", error);
    res.status(503).json({ error: "Salon data is unavailable." });
  }
});

// -------------------- REGISTRATION --------------------

app.get("/register", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  res.render("register", {
    title: "Create Account | Barber Platform",
    error: null
  });
});

app.post("/register", async (req, res) => {
  try {
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "customer");

    if (
      !fullName ||
      fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 190 ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !["customer", "barber"].includes(role)
    ) {
      return res.status(400).render("register", {
        title: "Create Account | Barber Platform",
        error: "Check your details. Passwords must be 8–72 bytes."
      });
    }

    const db = getPool();
    const passwordHash = await bcrypt.hash(password, 12);

    // Salon owners apply for approval; customers can use the platform.
    const approvalStatus = role === "barber" ? "pending" : "approved";

    const [result] = await db.execute(
      `INSERT INTO users
        (full_name, email, password_hash, role, approval_status)
       VALUES (?, ?, ?, ?, ?)`,
      [fullName, email, passwordHash, role, approvalStatus]
    );

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session regeneration error:", error);
        return res.status(500).send("Unable to create your session.");
      }

      req.session.user = {
        id: result.insertId,
        fullName,
        email,
        role,
        approvalStatus
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).send("Unable to save your session.");
        }

        res.redirect("/dashboard");
      });
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).render("register", {
        title: "Create Account | Barber Platform",
        error: "This email is already registered. Please log in."
      });
    }

    console.error("Registration error:", error);
    res.status(500).send("Unable to register right now.");
  }
});

// -------------------- LOGIN AND LOGOUT --------------------

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  res.render("login", {
    title: "Login | Barber Platform",
    error: null
  });
});

app.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const db = getPool();

    const [rows] = await db.execute(
      `SELECT id, full_name, email, password_hash, role, approval_status
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      return res.status(401).render("login", {
        title: "Login | Barber Platform",
        error: "Invalid email or password."
      });
    }

    const user = rows[0];

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session regeneration error:", error);
        return res.status(500).send("Unable to log you in.");
      }

      req.session.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approval_status
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).send("Unable to save your session.");
        }

        res.redirect("/dashboard");
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Unable to log in right now.");
  }
});

app.post("/logout", requireLogin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("barber.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    res.redirect("/");
  });
});

// -------------------- DASHBOARD --------------------

app.get("/dashboard", requireLogin, (req, res) => {
  res.render("dashboard", {
    title: "My Dashboard | Barber Platform",
    user: req.session.user
  });
});

// -------------------- ADMIN: SALONS --------------------

app.get("/admin", requireAdmin, (req, res) => {
  res.redirect("/admin/salons");
});

app.get("/admin/salons", requireAdmin, async (req, res) => {
  try {
    const db = getPool();

    const [barbers] = await db.execute(
      `SELECT id, full_name, email
       FROM users
       WHERE role = 'barber'
         AND approval_status = 'approved'
       ORDER BY full_name`
    );

    const [salons] = await db.execute(
      `SELECT s.id, s.name, s.address, s.city,
              s.description, s.owner_id,
              u.full_name AS owner_name
       FROM salons s
       LEFT JOIN users u ON u.id = s.owner_id
       ORDER BY s.created_at DESC`
    );

    res.render("admin-salons", {
      title: "Admin | Manage Salons",
      barbers,
      salons,
      error: null,
      created: req.query.created === "1"
    });
  } catch (error) {
    console.error("Admin salons error:", error);
    res.status(500).send("Unable to load admin salon manager.");
  }
});

// Only admin can create salon listings and assign approved owners.
app.post("/admin/salons", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    const city = String(req.body.city || "").trim();
    const description = String(req.body.description || "").trim();
    const ownerId = Number(req.body.owner_id);

    if (
      !name || name.length > 150 ||
      !address || address.length > 255 ||
      !city || city.length > 100 ||
      !Number.isInteger(ownerId) || ownerId < 1
    ) {
      return res.status(400).send(
        "Enter valid salon details and select an approved owner."
      );
    }

    const db = getPool();

    const [owners] = await db.execute(
      `SELECT id FROM users
       WHERE id = ?
         AND role = 'barber'
         AND approval_status = 'approved'`,
      [ownerId]
    );

    if (!owners.length) {
      return res.status(400).send("The selected owner is not approved.");
    }

    await db.execute(
      `INSERT INTO salons
        (owner_id, name, address, city, description)
       VALUES (?, ?, ?, ?, ?)`,
      [ownerId, name, address, city, description || null]
    );

    res.redirect("/admin/salons?created=1");
  } catch (error) {
    console.error("Admin salon creation error:", error);
    res.status(500).send("Unable to create salon.");
  }
});

// Admin can edit any salon and reassign its owner.
app.get("/admin/salons/:id/edit", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid salon ID.");
    }

    const db = getPool();

    const [rows] = await db.execute(
      `SELECT id, name, address, city, description, owner_id
       FROM salons WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).send("Salon not found.");
    }

    const [barbers] = await db.execute(
      `SELECT id, full_name, email
       FROM users
       WHERE role = 'barber' AND approval_status = 'approved'
       ORDER BY full_name`
    );

    res.render("edit-salon", {
      title: "Admin | Edit Salon",
      salon: rows[0],
      barbers,
      isAdmin: true,
      formAction: `/admin/salons/${id}/edit`
    });
  } catch (error) {
    console.error("Admin edit page error:", error);
    res.status(500).send("Unable to load salon.");
  }
});

app.post("/admin/salons/:id/edit", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    const city = String(req.body.city || "").trim();
    const description = String(req.body.description || "").trim();
    const ownerId = Number(req.body.owner_id);

    if (
      !Number.isInteger(id) || id < 1 ||
      !name || name.length > 150 ||
      !address || address.length > 255 ||
      !city || city.length > 100 ||
      !Number.isInteger(ownerId) || ownerId < 1
    ) {
      return res.status(400).send("Complete all required fields.");
    }

    const db = getPool();

    const [owners] = await db.execute(
      `SELECT id FROM users
       WHERE id = ? AND role = 'barber'
         AND approval_status = 'approved'`,
      [ownerId]
    );

    if (!owners.length) {
      return res.status(400).send("Select an approved salon owner.");
    }

    const [result] = await db.execute(
      `UPDATE salons
       SET name = ?, address = ?, city = ?,
           description = ?, owner_id = ?
       WHERE id = ?`,
      [name, address, city, description || null, ownerId, id]
    );

    if (!result.affectedRows) {
      const [existing] = await db.execute(
        "SELECT id FROM salons WHERE id = ?",
        [id]
      );

      if (!existing.length) {
        return res.status(404).send("Salon not found.");
      }
    }

    res.redirect("/admin/salons");
  } catch (error) {
    console.error("Admin salon update error:", error);
    res.status(500).send("Unable to update salon.");
  }
});

// -------------------- ADMIN: OWNER APPLICATIONS --------------------

app.get("/admin/applications", requireAdmin, async (req, res) => {
  try {
    const db = getPool();

    const [applications] = await db.execute(
      `SELECT id, full_name, email, approval_status, created_at
       FROM users
       WHERE role = 'barber'
         AND approval_status = 'pending'
       ORDER BY created_at ASC`
    );

    res.render("admin-applications", {
      title: "Admin | Salon Applications",
      applications
    });
  } catch (error) {
    console.error("Applications page error:", error);
    res.status(500).send("Unable to load applications.");
  }
});

app.post(
  "/admin/applications/:id/approve",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).send("Invalid application ID.");
      }

      const db = getPool();

      await db.execute(
        `UPDATE users
         SET approval_status = 'approved'
         WHERE id = ? AND role = 'barber'
           AND approval_status = 'pending'`,
        [id]
      );

      res.redirect("/admin/applications");
    } catch (error) {
      console.error("Approval error:", error);
      res.status(500).send("Unable to approve application.");
    }
  }
);

app.post(
  "/admin/applications/:id/reject",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).send("Invalid application ID.");
      }

      const db = getPool();

      await db.execute(
        `UPDATE users
         SET approval_status = 'rejected'
         WHERE id = ? AND role = 'barber'
           AND approval_status = 'pending'`,
        [id]
      );

      res.redirect("/admin/applications");
    } catch (error) {
      console.error("Rejection error:", error);
      res.status(500).send("Unable to reject application.");
    }
  }
);


/* -------------------- BARBER: APPOINTMENTS -------------------- */

// View appointments for salons assigned to the logged-in owner.

app.get("/appointments/manage", requireBarber, async (req, res) => {
  try {
    const db = getPool();

    const [appointments] = await db.execute(
      `SELECT
         a.id,
         a.appointment_at,
         a.status,
         a.notes,
         c.full_name AS customer_name,
         c.email AS customer_email,
         s.id AS salon_id,
         s.name AS salon_name,
         sv.name AS service_name,
         sv.price AS service_price,
         sv.duration_minutes
       FROM appointments a
       INNER JOIN salons s ON s.id = a.salon_id
       INNER JOIN users c ON c.id = a.customer_id
       INNER JOIN services sv ON sv.id = a.service_id
       WHERE s.owner_id = ?
       ORDER BY a.appointment_at DESC`,
      [req.session.user.id]
    );

    const now = new Date();

    const sections = {
      pending: [],
      upcoming: [],
      ongoing: [],
      completed: [],
      cancelled: []
    };

    for (const appointment of appointments) {
      const start = new Date(appointment.appointment_at);
      const duration = Number(appointment.duration_minutes) || 0;
      const end = new Date(start.getTime() + duration * 60000);

      if (appointment.status === "pending") {
        sections.pending.push(appointment);
      } else if (appointment.status === "cancelled") {
        sections.cancelled.push(appointment);
      } else if (appointment.status === "completed") {
        sections.completed.push(appointment);
      } else if (appointment.status === "confirmed") {
        if (now < start) {
          sections.upcoming.push(appointment);
        } else if (now >= start && now < end) {
          sections.ongoing.push(appointment);
        } else {
          // Confirmed appointments whose scheduled duration
          // has passed remain confirmed until marked completed.
          sections.upcoming.push(appointment);
        }
      }
    }

    res.render("manage-appointments", {
      title: "Manage Appointments | Barber Platform",
      appointments,
      sections
    });
  } catch (error) {
    console.error("Appointment dashboard error:", error);
    res.status(500).send("Unable to load appointments.");
  }
});


// Update the status of an appointment belonging to the owner's salon.
app.post(
  "/appointments/:id/status",
  requireBarber,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body.status || "");

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).send("Invalid appointment ID.");
      }

      if (!["confirmed", "cancelled", "completed"].includes(status)) {
        return res.status(400).send("Invalid appointment status.");
      }

      const db = getPool();

      // Only allow valid status transitions.
      let allowedCurrentStatuses = [];

      if (status === "confirmed") {
        allowedCurrentStatuses = ["pending"];
      } else if (status === "cancelled") {
        allowedCurrentStatuses = ["pending", "confirmed"];
      } else if (status === "completed") {
        allowedCurrentStatuses = ["confirmed"];
      }

      const placeholders = allowedCurrentStatuses.map(() => "?").join(", ");

      const [result] = await db.execute(
        `UPDATE appointments a
         INNER JOIN salons s ON s.id = a.salon_id
         SET a.status = ?
         WHERE a.id = ?
           AND s.owner_id = ?
           AND a.status IN (${placeholders})`,
        [
          status,
          id,
          req.session.user.id,
          ...allowedCurrentStatuses
        ]
      );

      if (!result.affectedRows) {
        return res.status(409).send(
          "Appointment not found, not assigned to your salon, or cannot be updated from its current status."
        );
      }

      res.redirect("/appointments/manage");
    } catch (error) {
      console.error("Appointment status update error:", error);
      res.status(500).send("Unable to update appointment.");
    }
  }
);


// -------------------- BARBER: OWN SALONS --------------------
async function requireOwnedSalon(req, res, next) {
  try {
    const salonId = Number(req.params.id);

    if (!Number.isInteger(salonId) || salonId < 1) {
      return res.status(400).send("Invalid salon ID.");
    }

    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id, cover_image
       FROM salons
       WHERE id = ? AND owner_id = ?
       LIMIT 1`,
      [salonId, req.session.user.id]
    );

    if (!salons.length) {
      return res.status(404).send(
        "Salon not found or not assigned to your account."
      );
    }

    req.ownedSalon = salons[0];
    next();
  } catch (error) {
    console.error("Salon ownership check error:", error);
    res.status(500).send("Unable to verify salon ownership.");
  }
}

app.post(
  "/salons/:id/cover-image",
  requireBarber,
  requireOwnedSalon,
  handleSalonUpload(salonUpload.single("cover_image")),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("Please select a cover image.");
      }

      const imageUrl = `/uploads/salons/${req.file.filename}`;
      const db = getPool();

      await db.execute(
        `UPDATE salons
         SET cover_image = ?
         WHERE id = ? AND owner_id = ?`,
        [
          imageUrl,
          req.ownedSalon.id,
          req.session.user.id
        ]
      );

      res.redirect("/salons/manage");
    } catch (error) {
      console.error("Salon cover upload error:", error);

      // Remove the new file if saving its database path fails.
      if (req.file) {
        fs.unlink(
          req.file.path,
          () => {}
        );
      }

      res.status(500).send("Unable to save salon cover image.");
    }
  }
);

app.post(
  "/salons/:id/gallery",
  requireBarber,
  requireOwnedSalon,
  handleSalonUpload(salonUpload.array("gallery_images", 8)),
  async (req, res) => {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).send("Please select at least one image.");
    }

    const db = getPool();
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      for (const file of files) {
        const imageUrl = `/uploads/salons/${file.filename}`;

        await connection.execute(
          `INSERT INTO salon_images (salon_id, image_url)
           VALUES (?, ?)`,
          [req.ownedSalon.id, imageUrl]
        );
      }

      await connection.commit();

      res.redirect("/salons/manage");
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      console.error("Salon gallery upload error:", error);

      // Remove files if the database operation fails.
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }

      res.status(500).send("Unable to save gallery images.");
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

app.get("/salons/manage", requireBarber, async (req, res) => {
  try {
    const db = getPool();

    const [salons] = await db.execute(
      `SELECT
         id,
         name,
         address,
         city,
         description,
         cover_image
       FROM salons
       WHERE owner_id = ?
       ORDER BY name ASC`,
      [req.session.user.id]
    );
    const salonIds = salons.map(salon => salon.id);

    let galleryImages = [];

    if (salonIds.length > 0) {
      const placeholders = salonIds.map(() => "?").join(", ");

      const [images] = await db.execute(
        `SELECT id, salon_id, image_url, created_at
        FROM salon_images
        WHERE salon_id IN (${placeholders})
        ORDER BY created_at DESC`,
        salonIds
      );

      galleryImages = images;
    }

    for (const salon of salons) {
      salon.galleryImages = galleryImages.filter(
        image => Number(image.salon_id) === Number(salon.id)
      );
    }
    res.render("manage-salons", {
      title: "Manage Salons | Barber Platform",
      salons,
      created: false
    });
    

    

    if (salonIds.length) {
      const placeholders = salonIds.map(() => "?").join(", ");

      const [images] = await db.execute(
        `SELECT id, salon_id, image_url, created_at
        FROM salon_images
        WHERE salon_id IN (${placeholders})
        ORDER BY created_at DESC`,
        salonIds
      );

      galleryImages = images;
    }

    for (const salon of salons) {
      salon.galleryImages = galleryImages.filter(
        image => image.salon_id === salon.id
      );
    }
  } catch (error) {
    console.error("Owner salon page error:", error);
    res.status(500).send("Unable to load salon management.");
  }
});



/* ---------------- OWNER: SERVICE MANAGEMENT ---------------- */

// Show services for a salon owned by the logged-in owner.
app.get("/salons/:id/services", requireBarber, async (req, res) => {
  try {
    const salonId = Number(req.params.id);

    if (!Number.isInteger(salonId) || salonId < 1) {
      return res.status(400).send("Invalid salon ID.");
    }

    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id, name, address, city, description, cover_image
       FROM salons
       WHERE id = ? AND owner_id = ?`,
      [salonId, req.session.user.id]
    );
    const [galleryImages] = await db.execute(
      `SELECT id, image_url
      FROM salon_images
      WHERE salon_id = ?
      ORDER BY created_at DESC`,
      [id]
    );
    res.render("salon-details", {
      title: salons[0].name + " | Barber Platform",
      salon: salons[0],
      services,
      galleryImages
    });

    if (!salons.length) {
      return res.status(404).send("Salon not found.");
    }

    const [services] = await db.execute(
      `SELECT id, salon_id, name, description, price, duration_minutes
       FROM services
       WHERE salon_id = ?
       ORDER BY name ASC`,
      [salonId]
    );

    res.render("manage-services", {
      title: "Services & Pricing",
      salon: salons[0],
      services,
      error: null
    });
  } catch (error) {
    console.error("Load services error:", error);
    res.status(500).send("Unable to load services.");
  }
});


// Add a service.
app.post("/salons/:id/services", requireBarber, async (req, res) => {
  try {
    const salonId = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const priceText = String(req.body.price ?? "").trim();
    const durationText = String(req.body.duration_minutes ?? "").trim();

    const price = Number(priceText);
    const duration = Number(durationText);

    if (
      !Number.isInteger(salonId) || salonId < 1 ||
      !name || name.length > 120 ||
      description.length > 2000 ||
      priceText === "" || !Number.isFinite(price) ||
      !/^\d+(\.\d{1,2})?$/.test(priceText) ||
      price < 0 || price > 999999.99 ||
      durationText === "" ||
      !Number.isInteger(duration) ||
      duration < 1 || duration > 65535
    ) {
      return res.status(400).send("Check the service name, description, price and duration.");
    }

    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id FROM salons
       WHERE id = ? AND owner_id = ?`,
      [salonId, req.session.user.id]
    );

    if (!salons.length) {
      return res.status(404).send("Salon not found.");
    }

    await db.execute(
      `INSERT INTO services
       (salon_id, name, description, price, duration_minutes)
       VALUES (?, ?, ?, ?, ?)`,
      [salonId, name, description || null, price.toFixed(2), duration]
    );

    res.redirect(`/salons/${salonId}/services`);
  } catch (error) {
    console.error("Add service error:", error);
    res.status(500).send("Unable to add service.");
  }
});


// Edit an existing service.
app.post(
  "/salons/:salonId/services/:serviceId/edit",
  requireBarber,
  async (req, res) => {
    try {
      const salonId = Number(req.params.salonId);
      const serviceId = Number(req.params.serviceId);
      const name = String(req.body.name || "").trim();
      const description = String(req.body.description || "").trim();
      const priceText = String(req.body.price ?? "").trim();
      const durationText = String(req.body.duration_minutes ?? "").trim();

      const price = Number(priceText);
      const duration = Number(durationText);

      if (
        !Number.isInteger(salonId) || salonId < 1 ||
        !Number.isInteger(serviceId) || serviceId < 1 ||
        !name || name.length > 120 ||
        description.length > 2000 ||
        priceText === "" || !Number.isFinite(price) ||
        !/^\d+(\.\d{1,2})?$/.test(priceText) ||
        price < 0 || price > 999999.99 ||
        durationText === "" ||
        !Number.isInteger(duration) ||
        duration < 1 || duration > 65535
      ) {
        return res.status(400).send("Check the service details.");
      }

      const db = getPool();

      const [result] = await db.execute(
        `UPDATE services AS sv
         INNER JOIN salons AS s ON s.id = sv.salon_id
         SET sv.name = ?,
             sv.description = ?,
             sv.price = ?,
             sv.duration_minutes = ?
         WHERE sv.id = ?
           AND sv.salon_id = ?
           AND s.owner_id = ?`,
        [
          name,
          description || null,
          price.toFixed(2),
          duration,
          serviceId,
          salonId,
          req.session.user.id
        ]
      );

      if (!result.affectedRows) {
        const [existing] = await db.execute(
          `SELECT sv.id
           FROM services sv
           INNER JOIN salons s ON s.id = sv.salon_id
           WHERE sv.id = ? AND sv.salon_id = ? AND s.owner_id = ?`,
          [serviceId, salonId, req.session.user.id]
        );

        if (!existing.length) {
          return res.status(404).send("Service not found.");
        }
      }

      res.redirect(`/salons/${salonId}/services`);
    } catch (error) {
      console.error("Edit service error:", error);
      res.status(500).send("Unable to update service.");
    }
  }
);


// Delete a service.
app.post(
  "/salons/:salonId/services/:serviceId/delete",
  requireBarber,
  async (req, res) => {
    try {
      const salonId = Number(req.params.salonId);
      const serviceId = Number(req.params.serviceId);

      if (
        !Number.isInteger(salonId) || salonId < 1 ||
        !Number.isInteger(serviceId) || serviceId < 1
      ) {
        return res.status(400).send("Invalid service or salon ID.");
      }

      const db = getPool();

      const [result] = await db.execute(
        `DELETE sv FROM services sv
         INNER JOIN salons s ON s.id = sv.salon_id
         WHERE sv.id = ?
           AND sv.salon_id = ?
           AND s.owner_id = ?`,
        [serviceId, salonId, req.session.user.id]
      );

      if (!result.affectedRows) {
        return res.status(404).send("Service not found.");
      }

      res.redirect(`/salons/${salonId}/services`);
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).send(
          "This service is linked to appointments and cannot be deleted."
        );
      }

      console.error("Delete service error:", error);
      res.status(500).send("Unable to delete service.");
    }
  }
);


// Owner can only edit salons assigned to their own account.
app.get("/salons/:id/edit", requireBarber, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid salon ID.");
    }

    const db = getPool();

    const [rows] = await db.execute(
      `SELECT id, name, address, city, description, owner_id
       FROM salons
       WHERE id = ? AND owner_id = ?`,
      [id, req.session.user.id]
    );

    if (!rows.length) {
      return res.status(404).send("Salon not found.");
    }

    res.render("edit-salon", {
      title: "Edit My Salon",
      salon: rows[0],
      barbers: [],
      isAdmin: false,
      formAction: `/salons/${id}/edit`
    });
  } catch (error) {
    console.error("Owner edit page error:", error);
    res.status(500).send("Unable to load salon.");
  }
});

app.post("/salons/:id/edit", requireBarber, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    const city = String(req.body.city || "").trim();
    const description = String(req.body.description || "").trim();

    
    if (
      !Number.isInteger(id) || id < 1 ||
      !name || name.length > 150 ||
      !address || address.length > 255 ||
      !city || city.length > 100 ||
      description.length > 1000
    ) {
      return res.status(400).send(
        "Check your details. The description must not exceed 1,000 characters."
      );
    }


    const db = getPool();

    const [result] = await db.execute(
      `UPDATE salons
       SET name = ?, address = ?, city = ?, description = ?
       WHERE id = ? AND owner_id = ?`,
      [
        name, address, city, description || null,
        id, req.session.user.id
      ]
    );

    if (!result.affectedRows) {
      const [existing] = await db.execute(
        `SELECT id FROM salons
         WHERE id = ? AND owner_id = ?`,
        [id, req.session.user.id]
      );

      if (!existing.length) {
        return res.status(404).send("Salon not found.");
      }
    }

    res.redirect("/salons/manage");
  } catch (error) {
    console.error("Owner salon update error:", error);
    res.status(500).send("Unable to update salon.");
  }
});


/* -------------------- PUBLIC SALON PROFILE -------------------- */

app.get("/salons/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid salon ID.");
    }

    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id, name, address, city, description
       FROM salons
       WHERE id = ?`,
      [id]
    );

    if (!salons.length) {
      return res.status(404).send("Salon not found.");
    }

    const [services] = await db.execute(
      `SELECT id, name, description, price, duration_minutes
       FROM services
       WHERE salon_id = ?
       ORDER BY name ASC`,
      [id]
    );

    res.render("salon-details", {
      title: salons[0].name + " | Barber Platform",
      salon: salons[0],
      services
    });
  } catch (error) {
    console.error("Public salon profile error:", error);
    res.status(500).send("Unable to load salon details.");
  }
});


/* ---------------- CUSTOMER BOOKINGS ---------------- */

// Show the booking form for a selected service
app.get("/booking", requireLogin, async (req, res) => {
  try {
    // Only customer accounts can make bookings
    if (req.session.user.role !== "customer") {
      return res.status(403).send("Only customer accounts can make bookings.");
    }

    const serviceId = Number(req.query.service_id);

    if (!Number.isInteger(serviceId) || serviceId < 1) {
      return res.status(400).send("Please select a valid service.");
    }

    const db = getPool();

    const [rows] = await db.execute(
      `SELECT
         sv.id AS service_id,
         sv.name AS service_name,
         sv.description AS service_description,
         sv.price,
         sv.duration_minutes,
         s.id AS salon_id,
         s.name AS salon_name,
         s.address,
         s.city
       FROM services sv
       JOIN salons s ON s.id = sv.salon_id
       WHERE sv.id = ?
       LIMIT 1`,
      [serviceId]
    );

    if (!rows.length) {
      return res.status(404).send("That service could not be found.");
    }
    req.session.bookingToken = require("crypto").randomBytes(32).toString("hex");
    
    res.render("booking", {
      title: "Book an Appointment | Barber Platform",
      service: rows[0],
      error: null,
      bookingToken: req.session.bookingToken,
      form: { appointment_at: "", notes: "" }
    });
  } catch (error) {
    console.error("Booking form error:", error);
    res.status(500).send("Unable to load the booking form.");
  }
});

// Save the customer's booking

app.post("/booking", requireLogin, async (req, res) => {
  let service = null;

  try {
    if (req.session.user.role !== "customer") {
      return res.status(403).send("Only customers can make bookings.");
    }

    const serviceId = Number(req.body.service_id);
    const appointmentAt = String(req.body.appointment_at || "").trim();
    const notes = String(req.body.notes || "").trim();
    const token = String(req.body.booking_token || "");

    const db = getPool();

    if (!Number.isInteger(serviceId) || serviceId < 1) {
      return res.status(400).send("Please select a valid service.");
    }

    // Validate the form token against this customer's session.
    const savedToken = req.session.bookingToken;

    if (!token || !savedToken || token !== savedToken) {
      return res.status(409).send(
        "This booking form has already been submitted or expired. Please open the form again."
      );
    }

    const [services] = await db.execute(
      `SELECT
         sv.id AS service_id,
         sv.name AS service_name,
         sv.price,
         sv.duration_minutes,
         s.id AS salon_id,
         s.name AS salon_name,
         s.address,
         s.city
       FROM services sv
       JOIN salons s ON s.id = sv.salon_id
       WHERE sv.id = ?
       LIMIT 1`,
      [serviceId]
    );

    if (!services.length) {
      return res.status(400).send("That service is not available.");
    }

    service = services[0];

    // Require the exact datetime-local format.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(appointmentAt)) {
      return res.status(400).send("Please choose a valid appointment time.");
    }

    const [datePart, timePart] = appointmentAt.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const start = new Date(year, month - 1, day, hour, minute);

    if (
      start.getFullYear() !== year ||
      start.getMonth() !== month - 1 ||
      start.getDate() !== day ||
      start.getHours() !== hour ||
      start.getMinutes() !== minute ||
      start <= new Date()
    ) {
      return res.status(400).send(
        "Choose a valid date and time in the future."
      );
    }

    if (notes.length > 1000) {
      return res.status(400).send("Notes must be 1,000 characters or fewer.");
    }

    const end = new Date(
      start.getTime() + Number(service.duration_minutes) * 60 * 1000
    );

    // Check for overlap with pending or confirmed appointments at this salon.
    // Cancelled and completed bookings do not block a time.
    const [conflicts] = await db.execute(
      `SELECT a.id
       FROM appointments a
       JOIN services existing_service
         ON existing_service.id = a.service_id
       WHERE a.salon_id = ?
         AND a.status IN ('pending', 'confirmed')
         AND a.appointment_at < ?
         AND DATE_ADD(
           a.appointment_at,
           INTERVAL existing_service.duration_minutes MINUTE
         ) > ?
       LIMIT 1`,
      [
        service.salon_id,
        end.toISOString().slice(0, 19).replace("T", " "),
        start.toISOString().slice(0, 19).replace("T", " ")
      ]
    );

    if (conflicts.length) {
      return res.status(409).send(
        "That time overlaps an existing booking. Please choose another time."
      );
    }

    const mysqlDateTime =
      `${datePart} ${timePart}:00`;

    await db.execute(
      `INSERT INTO appointments
         (customer_id, salon_id, service_id, appointment_at, status, notes)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        req.session.user.id,
        service.salon_id,
        service.service_id,
        mysqlDateTime,
        notes || null
      ]
    );

    // Invalidate the token after a successful insert.
    delete req.session.bookingToken;

    req.session.save((saveError) => {
      if (saveError) {
        console.error("Booking session save error:", saveError);
      }
      res.redirect("/dashboard?booking=created");
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).send("Unable to create your booking. Please try again.");
  }
});




// -------------------- 404 AND SERVER --------------------

app.use((req, res) => {
  res.status(404).render("404", { title: "Page not found" });
});

app.listen(PORT, () => {
  console.log(`Barber Platform running at http://localhost:${PORT}`);
});
