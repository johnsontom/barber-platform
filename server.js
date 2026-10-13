
require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");

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
      SELECT s.id, s.name, s.address, s.city, s.description
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

// -------------------- BARBER: OWN SALONS --------------------

app.get("/salons/manage", requireBarber, async (req, res) => {
  try {
    const db = getPool();

    const [salons] = await db.execute(
      `SELECT id, name, address, city, description
       FROM salons
       WHERE owner_id = ?
       ORDER BY name ASC`,
      [req.session.user.id]
    );

    res.render("manage-salons", {
      title: "Manage Salons | Barber Platform",
      salons,
      created: false
    });
  } catch (error) {
    console.error("Owner salon page error:", error);
    res.status(500).send("Unable to load salon management.");
  }
});

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
      !city || city.length > 100
    ) {
      return res.status(400).send("Complete all required fields.");
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

// -------------------- 404 AND SERVER --------------------

app.use((req, res) => {
  res.status(404).render("404", { title: "Page not found" });
});

app.listen(PORT, () => {
  console.log(`Barber Platform running at http://localhost:${PORT}`);
});
