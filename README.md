# Barber Finder

A location-based barbershop directory and appointment-booking platform built
with Node.js, Express, Pug and MySQL.



## Run with Docker

```bash
docker compose up -d
```

The app uses `http://localhost:3000`, MySQL runs on `3306`, and phpMyAdmin is
available at `http://localhost:8080`.

On a brand-new database, `database/schema.sql` creates the full appointment
schema and seeds three demo salons, their treatment menus and barber profiles.
For an older database volume, apply the required migrations; preserve the volume
and existing bookings. See the update instructions below.

## Run locally

```bash
npm install
npm run dev
```



