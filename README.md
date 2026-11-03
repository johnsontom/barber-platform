# Barber Platform

A location-based barbershop directory and appointment-booking platform built
with Node.js, Express, Pug and MySQL.

Booking fees, Stripe test setup, ChatGuard, database changes, test commands and the full feature file list are documented in [docs/platform-fees-chatguard.md](docs/platform-fees-chatguard.md). Fees start disabled; the confirmed £2 platform fee is collected separately from salon service and travel charges.

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

Copy `.env.example` to `.env` and set the MySQL credentials before starting.

## Administrator login

Administrators sign in directly at `/admin/login` using their existing account.
This page has no links from the public website or public login and registration
pages, and requests carry search engine `noindex` instructions. Public `/login`
accepts only customers and salon managers; `/admin/login` accepts only accounts
whose saved database role is `admin`. A submitted role field cannot change this.

Admin pages still enforce administrator access on the server. Logged-out visits
to admin routes, admin logout and expired admin sessions return to the dedicated
login. Successful login opens the existing dashboard. Public registration cannot
create administrator accounts. This change needs no database migration or new
administrator password.

## Email verification

Email verification is currently disabled in the local `.env`. To change it:

```dotenv
# Disable verification
EMAIL_VERIFICATION_ENABLED=false

# Enable verification instead
EMAIL_VERIFICATION_ENABLED=true
```

Use one value in `.env`, then restart the app (`Ctrl+C`, then `npm run dev`).
When disabled, registration sends no verification email and opens the dashboard
without requiring an email sender. Accounts already waiting for verification
can log in normally. The verification and resend pages redirect to login,
and the login page hides its verification link. Manager approval and password
recovery continue to work as before.

Disabling does not mark an email as verified or remove tokens. Accounts created
while it is disabled retain an unverified address. Re-enabling requires those
accounts, and other pending accounts, to verify before dashboard access; they
can log in to request a fresh link. Legacy accounts explicitly exempted by the
migration remain exempt. If the setting is absent, verification defaults to enabled.

When enabled, new customers and salon managers must verify their registered email before
accessing a dashboard, bookings or salon management. Registration sends a
verification email and opens `/verify-email` without creating an authenticated
session. Logging in before verification opens the same page, where the user can
resend a link to their saved address. Salon managers still need administrator
approval after email verification to manage their salon.

Links expire after 24 hours, work once and are replaced by a newer request.
Opening a link leads to a clean confirmation URL; selecting **Verify email**
confirms the address and returns to login. The explicit confirmation prevents
email link previews from consuming the link. Tokens are stored as hashes,
forms require CSRF protection, and registration, resend and confirmation
attempts are rate limited. Resends have a one-minute account cooldown.
Password reset does not count as email verification.

Run `npm run db:migrate` before restarting to apply the additive, repeatable
`005_email_verification.sql` migration. Existing accounts retain their access
with `email_verification_required = 0` and no fabricated verification timestamp.
New accounts require verification; repeating the migration never exempts them.
New database schemas include the verification fields and token table.

Verification uses the same Gmail sender settings as password recovery below.
If the sender is not configured, registration displays an unavailable message
and creates no account. If delivery fails after creation, the account remains
pending and can request a new link after login. No dashboard access is granted.
Use a public HTTPS `APP_BASE_URL` for live users; localhost links are for local
development. Restart after entering sender settings in `.env`.

Run `npm test` and `npm run test:verification:mysql` to check verification and
registration, real database locking, rollback, access gates and migration
preservation in an isolated database, with captured emails.

## Forgot password

Customers and salon managers can select **Forgot password?** on `/login` and
request a link sent to the email already registered on their account. Links
expire after 30 minutes, work once and are replaced by a newer request. Requests
for unregistered or administrator emails show the same confirmation; admin
recovery is not available through this public flow.

The new password must have at least 8 characters and fit bcrypt's 72-byte limit.
Changing it signs the account out of all existing sessions; the user then logs
in with the new password. Reset pages use the shared dark/light theme. Tokens
are stored only as hashes, reset forms require CSRF tokens, and request/submit
attempts are rate limited. Reset tokens are removed from the URL before the
new-password form appears, with no-referrer and no-store response headers.

Run `npm run db:migrate` to apply the repeatable, additive
`004_password_resets.sql` migration before restarting the app. It adds a reset
table and a password version; existing password hashes, roles and bookings are
preserved. New databases include both in `database/schema.sql`.

For Gmail / Google Workspace, configure the **sender** in `.env`:

On Windows, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-gmail.ps1`
from the project folder. It asks for the sender address and a masked Google app
password, checks SMTP authentication, then saves the Gmail settings while
preserving the rest of `.env`. It does not send any emails. The app password
stays local and does not go into shell history. Alternatively, enter these
settings in `.env` manually:

```dotenv
APP_BASE_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=your-sender@gmail.com
SMTP_PASSWORD=your-google-app-password
MAIL_FROM="Barber Finder <your-sender@gmail.com>"
```

Enable 2-Step Verification on the sender's Google account and create an app
password for this app. Store that app password locally in `.env`, without spaces;
do not use the sender's regular Google password. Workspace accounts may need
their administrator to enable app passwords. Use the real public HTTPS address
for `APP_BASE_URL` in production. Reset links always use this configured URL,
never a request's Host header. Restart after changing environment settings.
The sender is the app's mailbox; recipients remain the registered account emails.
Run `npm run email:check` to check SMTP authentication without sending an email.

Until sender credentials are configured, reset requests display an unavailable
message and do not issue reset tokens. Delivery failures are logged without
tokens or credentials and invalidate the undelivered link.

For local email preview without sending to real mailboxes, run
`docker compose --profile mail-preview up -d mailpit`, then use
`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_REQUIRE_TLS=false`, empty
`SMTP_USER`/`SMTP_PASSWORD`, and `MAIL_FROM=Barber Finder <no-reply@barber.test>`.
Open `http://localhost:8025` to inspect captured messages. Restore Gmail settings
when enabling actual delivery.

Run `npm test` for recovery and session tests and `npm run test:password:mysql`
for expiry, one-use concurrency and migration checks in an isolated database.

## Display theme

Every page has the same **Light mode / Dark mode** toggle as the homepage,
including customer appointments, messages, salon management and administration.
The choice is saved in the browser under `barber-finder-theme` and applied before
page content appears, so navigation and refresh keep the selected theme. Other
open tabs follow changes too. Dark remains the default for a new browser.

## Admin salon records

The admin dashboard shows platform totals and opens the searchable salon
directory at `/admin/salons`. Search salon names, owners, emails, addresses, cities
or IDs; filter listing status and booking dates, and sort by value, bookings,
name or newest listing. Each salon opens a dedicated record with overview,
finances, bookings, customers, team and availability, services, reviews and photos.

Booking, customer, service and barber figures use scheduled appointment dates.
Completed value includes saved service prices and home-visit travel fees for
appointments marked completed. Pending, confirmed and cancelled values are
shown separately. The app does not track collected payments; legacy bookings
without a saved quote use current service prices and are counted explicitly.
Monthly breakdowns, counts and totals include the full history, independently
of the current search or result page. Review filters use review submission dates.
Current profiles, services and weekly rotas stay visible even with no bookings
in the period; availability date changes use their effective dates.

Search booking references, names, emails, services, barbers, notes or home
addresses. Customer, service and barber records link to their matching bookings.
Reviews include salon and barber feedback, with rating/type filters. Every record
table has server pagination; bookings and reviews are no longer capped at the
latest 100 records. The owner-application queue also has search and pagination.
Messaging shows activity counts and timestamps. Private message bodies remain
in the existing participant-only messaging flow. Passwords and booking tokens
are excluded from salon records. All admin record routes require an admin session.

No database migration is required. Run `npm run test:admin:mysql` for the salon
reporting integration checks against a separate, temporary MySQL database.

## Appointment flow

- Customers choose a treatment, a barber, a date and a 30-minute slot.
- Salon slots respect opening hours. Home arrival slots use separate home-visit
  availability. Both respect every existing pending or confirmed booking,
  including reserved travel and treatment time.
- Booking creation uses a MySQL advisory lock so two customers cannot take the
  same barber and time.
- Customers can review and cancel their bookings from `/appointments`.
- Each appointment section on the customer dashboard has independent pagination
  with five appointments per page. Previous, Next and page-number links retain
  the other sections' selected pages; summary cards count the full history.
- Confirmed salon visits show **Get directions** on the customer dashboard,
  appointment list and booking details. It opens Google Maps, with an Apple Maps
  option alongside it. Maps uses the customer's current location when available
  or lets them choose a starting point. Directions use the salon address and city;
  no Maps API key is needed. Home visits do not show directions to the salon.
- Salon owners can confirm, complete or cancel bookings from
  `/appointments/manage`.
- Manager and customer appointment pages show five appointments per section,
  with independent page links that keep the other sections' selected pages.
  Each appointment starts collapsed; click or press Enter on its summary to
  reveal the full details and booking actions. Search checks the full history
  before pagination, and summary totals continue to include all appointments.
- Managers can use **Find an appointment by reference** on their dashboard or
  appointment management page. Enter `BP-0001`, `#1`, or the booking number to
  open its details. Lookups cover all booking statuses in the manager's own salons.

Opening hours are currently Mon-Fri 9am-7pm, Sat 9am-6pm and Sun 10am-4pm.

## Barber services and appointment emails

Approved managers can open **Services offered** directly from the dashboard.
Add any salon service with a name, price and duration; the form is open when the
menu loads. Managers with several active salons choose which menu to edit.
The service menu links to **Assign services to barbers**. Each barber's service
picker has search, a scrollable list, a selected count, and **Select shown** /
**Clear shown** actions. Searching never removes selected services from the form.

In **Manage My Salon > Barbers**, add each barber's email and select their
**Services offered** from the salon menu. The speciality text is descriptive;
the selected services control which appointments that barber can accept.
Customer booking choices update with the treatment, and the server checks the
assignment again for availability, home quotes and the final booking.

After confirming a booking in **Manage appointments**, click **Send to barber**
to email its details to the booked barber's saved address. Home visits include
the customer's address, arrival, treatment, travel and return times. The app uses
the existing SMTP sender settings above. A successful send is recorded; duplicate
clicks do not resend. Failed sends can be retried. Sending requires an approved
manager who owns the salon and a confirmed appointment.

Run `npm run db:migrate` before restarting to apply the repeatable additive
`011_barber_services_email.sql` migration. Existing bookings are preserved.
Existing barber profiles have no assigned services or email until a manager
sets them; they cannot accept new bookings until their services are selected.
New services also need to be assigned to the barbers who offer them.

Run `npm test`, `npm run check` and `npm run test:barbers:mysql` to verify the
booking restrictions, manager forms, email retry/duplicate handling and migrations.

## Barber availability

Approved salon managers can open **Barber Availability** from their dashboard,
salon management page or a barber's team profile. Select a salon and barber,
then save a seven-day weekly rota with a start and finish or a day off for each
day. Add specific dates for holidays or different shifts; removing a date change
restores the weekly rota for that day.

Select **At the salon** or **Home visits** to edit independent rotas. Salon shifts
must fit opening hours; home shifts may start earlier or finish later. Salon
appointments must fit their full treatment duration. Home hours describe the
earliest arrival at the customer's home and the time treatment must finish by.
Every new home visit includes 20 minutes of setup after arrival, followed by
the full treatment duration. Travel and buffers can happen outside those hours.
For example, 07:00 arrival with a 90-minute service means setup until 07:20
and treatment until 08:50, so the home hours must extend through 08:50.
Booking submission rechecks the saved rota. Updates that conflict with pending
or confirmed treatments are rejected with a booking reference, so managers can
resolve them first.

Existing salon rotas are preserved. Until a home rota is saved, home arrival
requests can be made throughout the day, subject to existing reservations and
home date changes. Managers can set independent home hours and days off under
**Barber Availability > Visit type > Home visits**. The editor labels this
default. Availability is saved separately for each barber and visit type and
can only be edited by the approved owner of their salon.

For an existing database, run `npm run db:migrate` (or `npm.cmd run db:migrate`
in PowerShell) before starting the updated app. This applies the additive
`003_barber_availability.sql` and `008_home_availability.sql` migrations as well
as the booking quote migration. New databases include the salon and home
availability tables in `database/schema.sql`. The availability migrations do
not seed rotas or change existing appointments.

Use `npm run preview:availability` for an in-memory manager and booking preview
at `http://127.0.0.1:3012/salons/availability`. It uses synthetic data and never
connects to the project database.

## Home-service booking

Customers can choose a salon visit or a home visit. For a home visit, they enter
a full UK address, choose an arrival time, and select **Check arrival and price**.
Only that proposed arrival is routed, avoiding paid API calls for every time in
the grid. Times marked **Check travel** are candidates; the full journey must be
verified before the request can be submitted.

**Use my location** requests browser permission and fills an editable home
address. If permission is denied, the form shows Chrome/Edge, Firefox and
Windows location-setting instructions. In Chrome, use the site controls icon
beside the address bar → Site settings → Location → Allow, then reload the
booking page. On Windows, also check Settings → Privacy & security → Location,
including access for apps and desktop apps. The website cannot change these
permissions. Location requires HTTPS or a local `localhost`/`127.0.0.1` address;
manual address entry remains available.

The server geocodes a precise address, routes outbound and return separately,
and calculates a fixed fee from total round-trip road distance. Example defaults:

| Total round-trip road distance | Travel fee |
| --- | --- |
| Up to and including 3 miles | £5 |
| Over 3, up to and including 6 miles | £8 |
| Over 6, up to and including 10 miles | £12 |
| Over 10 miles | Outside coverage |

These are configurable example prices. The comparison uses unrounded metres
divided by 1609.344; rounding the displayed mileage never changes a band.
Total = the treatment price + the travel fee. No travel-time fee or online payment
is added. The salon confirms or declines the pending request in the existing
owner workflow. Declines use the existing `cancelled` status and retain history.

### Set a salon's home-visit area

Approved salon managers can open **Dashboard → Home Visit Area**, or
**Manage My Salon → Home visit area** for an individual salon. They can pause
home visits, set a maximum round-trip road distance, and edit the travel-fee
bands. A 20-mile limit permits roughly 10 miles each way, depending on the roads.
The last fee band must cover at least the chosen maximum; increasing coverage
without a matching price is rejected with a message on the form.

Settings are stored on that salon's database record and apply to new quotes
immediately, without restarting the app. Saved settings take priority over
that salon's environment defaults; other salons keep their own settings.
The platform-wide `HOME_SERVICE_ENABLED=false` switch still pauses all home
visits. Existing bookings keep their agreed prices and travel reservations;
settings changes require customers with unsubmitted quotes to review again.

For an existing installation, run `npm.cmd run db:migrate` once to add the
nullable `salons.home_service_settings` column, then restart the app to load
the new manager routes. The migration is safe to repeat and preserves records.

The existing availability helper reserves departure through return, with a
5-minute departure buffer and a 5-minute return buffer by default. Outbound
traffic is estimated at the calculated departure: the provider iterates until
the arrival/departure estimate is stable, or rejects the quote. The return leg
uses service completion as its departure time. The whole reserved block must
begin in the future and remain clear of other appointments. Arrival through
treatment completion, including the 20-minute setup, must fit any configured
home-visit availability. The treatment price and duration stay unchanged; setup
is shown separately in the quote and saved booking details. Existing bookings
retain their saved completion times and do not gain setup time retroactively.
Salon opening hours do not restrict home visits: a 9am arrival with one hour of outbound travel
can reserve departure at 8am (plus the buffer), even when the salon opens at 9am.
Trips crossing midnight check overlapping bookings on all dates touched.
Home hours and days off apply to the dates touched by setup and treatment; travel-only
dates do not restrict arrival times. Apply `008_home_availability.sql` through
`npm.cmd run db:migrate` to add the separate home rota tables without changing
existing salon rotas or bookings.

Pending and confirmed visits reserve the full block. Cancelled visits release
it. A home visit can be marked completed only after its reserved block ends.
New salon bookings also save price/duration snapshots, with zero travel fees;
older bookings without snapshots keep the existing treatment-duration behavior.

Quotes expire after 10 minutes and belong to the customer session, treatment,
barber, arrival and address. Submission always recalculates routes server-side;
a changed price/configuration requires the customer to review a new quote.
Availability is checked again inside the booking transaction after acquiring
the salon/day MySQL lock. A unique token hash prevents repeated submissions,
and appointment + quote inserts either both commit or both roll back.

### Enable and configure home visits

1. Apply `database/migrations/002_booking_quotes.sql` before starting this code:

   ```bash
   npm run db:migrate
   ```

   In Windows PowerShell, use `npm.cmd run db:migrate`. This applies the additive
   booking, availability, account and salon home-visit settings migrations.
   Do not rerun demo seeds or reset database volumes.

2. In Google Cloud, enable **Geocoding API** and **Routes API** and configure the
   billing/quota requirements for your project. Create a server-side API key
   restricted to those APIs and, where deployment permits, the server's egress
   addresses. Put it in `GOOGLE_MAPS_SERVER_KEY`; never put it in browser code.

   For IP restrictions, allow the public address Google sees for the app server.
   Local requests can leave through IPv6, so allowing only your public IPv4
   address may still cause rejection. Google's IP-denial message can mention
   an "empty referer"; that alone does not indicate website restrictions.
   Run `npm.cmd run google:check` on the app server to check the app's default
   connection and IPv4/IPv6 separately. It prints only sanitized Google statuses
   and valid outgoing IPs extracted from rejection messages; it never prints
   your key or customer addresses. In Google Cloud **Credentials**, select the
   key used by `GOOGLE_MAPS_SERVER_KEY`, open **Application restrictions > IP
   addresses**, and add each rejected outgoing IP as a separate entry while
   retaining existing valid entries. Save and rerun the diagnostic. An unavailable
   IPv6 connection does not prevent booking when the app's default check succeeds.
   If IPv4 succeeds but the app's IPv6 is rejected or changes frequently, set
   `GOOGLE_MAPS_IP_FAMILY=4` in `.env` and restart the app. This selects IPv4 for
   both Geocoding and Routes API requests only. The allowed public IPv4 must
   still match your connection; production servers should use a stable outgoing
   address. Use `auto` (the default) or `6` for other deployment configurations.
   To also verify precise address lookup, reverse lookup, and a road round trip
   using public London landmarks, run `npm.cmd run google:check -- --flow`.
   This makes no database changes or bookings and prints no resolved addresses.
   After saving key restrictions, allow a few minutes for propagation and rerun
   `npm.cmd run home:check`. Restart the app if you replace the key in `.env`.

3. Set `APP_TIME_ZONE=Europe/London` (the application default) and enable home
   visits once for **all active salons, including salons created later**:

   ```dotenv
   HOME_SERVICE_ENABLED=true
   HOME_SERVICE_SALONS_JSON={}
   ```

   No salon IDs or manual `originVerified` flags are needed. Each quote uses the
   salon's current saved **street address and city**, verifies a precise UK
   address with Google, and then routes the journey. Existing approximate
   directory coordinates are not used for quoting. Salon owners/admins should
   save the real building number/name, street and postcode. Ambiguous, invalid
   or unverifiable salon addresses cannot produce a home quote.

   A change to a salon address is picked up automatically and requires a fresh
   quote before saving. The salon address is locked during transactional
   revalidation so a concurrent edit cannot silently change the departure point.
   Defaults apply automatically: £5/£8/£12 at 3/6/10 round-trip miles, with five
   minutes of departure and return buffers. Managers can override coverage and
   fees through **Home Visit Area**. Optional per-salon defaults in
   `HOME_SERVICE_SALONS_JSON` support prices, coverage, buffers or
   `{"enabled":false}` opt-outs; overriding one salon does not disable others.
   The maximum is explicitly **round-trip** distance and cannot exceed the last
   band. Buffers must be integers from 0 to 120 minutes, and bands must have
   strictly increasing positive limits. Restart the app after changing `.env`.

   Run `npm.cmd run home:configure` to enable the automatic setup while
   preserving your API key, other environment settings and custom travel prices.
   It removes obsolete manually configured origins. Run `npm.cmd run home:check`
   to verify existing active salons' saved addresses with Google. This makes
   Geocoding API calls but does not create bookings or update salon records.

Routing failures, invalid/ambiguous addresses, unstable traffic estimates, missing
credentials and out-of-area journeys prevent quotes and home bookings. The
provider is replaceable through the `routing` dependency passed to the appointment
router: `resolveOrigin`, `geocode`, `reverseGeocode`, and `roundTrip` are its interface.

Routing responses are not cached between checks or reused at submission.
Customer geocoded coordinates are not saved; the operational booking snapshot
stores the necessary address, price, distance, durations and schedule. Address
pages/API responses use `Cache-Control: no-store` and reveal details only to the
booking customer, that salon's authorised owner, or an administrator. Set an
appropriate booking-data retention policy and check the selected provider's
terms for storing operational route/quote records before enabling it in production.

### Verification

```bash
npm test
npm run check
npm run test:mysql
```

The first suite uses mocked routing and database fixtures. `check` verifies
JavaScript syntax and compiles all Pug templates. `test:mysql` needs the configured
MySQL account to create a temporary test database; it tests real constraints,
concurrent locks, migration compatibility and snapshots, then removes only its
randomly named test database. It never changes the project database's records.

For a manual UI check without paid APIs or real appointments:

```bash
npm run preview:booking
```

Open the URL printed on port 3011. This preview uses synthetic data and routing.
Use real provider credentials and a valid saved salon address for a final end-to-end
home-service check. The implementation and current verification results are
recorded in [the home-service handoff](docs/home-service-handoff.md).

## About Us and community forum

The homepage navigation includes **About Us** (`/about`) and **Forum**
(`/forum`). Both pages are public. The forum supports Website, Salons and
New Ideas categories, keyword search, optional related-salon filters,
newest/most-liked sorting, and paginated discussions and comments.

Signed-in accounts can publish discussions, comment, and like or unlike both
discussions and comments. Each account has at most one like on each item.
Authors can edit or remove their discussions and remove their comments;
administrators can remove any discussion or comment. Existing account and
email-verification rules apply. Writes require a session-bound form token
and are limited to 30 actions per account per minute. Discussion content is
plain text and is escaped when displayed; public pages do not expose emails.

For existing installations, `npm.cmd run db:migrate` adds the four forum tables
without altering existing accounts, salons or appointments. New installations
include them in `database/schema.sql`. Restart the app after updating the code.
Forum posts, comments and likes persist in MySQL; removing a discussion also
removes its comments and likes. No example discussions are inserted into the
project database.

Run `npm.cmd run test:forum:mysql` for the forum's integration checks. They use
a randomly named temporary database and a test server on a random loopback port.
The regular `npm test` suite covers input checks, account/form protection,
escaped rendering and navigation. The About Us copy lives in `views/about.pug`.

## Messaging

- Customers start a private thread from a salon profile with **Message salon**.
  Each customer has one continuing thread per salon.
- Customers and approved salon owners get separate inboxes at `/messages`.
- Conversations keep their full message history, show unread counts, and refresh
  automatically while a thread is open.
- Inbox search matches salon names, customer names, and message text. Thread
  search finds and highlights matching messages.
- Only the customer in the thread and the approved owner of that salon can read
  or post messages.

## Updating an existing database

`database/schema.sql` includes the messaging tables for new databases. If you
already have a database volume, apply the migration once:

```bash
docker compose exec -T mysql mysql -uroot -pbarber_dev_password barber_platform < database/migrations/001_messages.sql
```

In PowerShell, use:

```powershell
Get-Content database/migrations/001_messages.sql | docker compose exec -T mysql mysql -uroot -pbarber_dev_password barber_platform
```

## Business categories

Apply `npm run db:migrate` when updating an existing database. Migration
`012_service_categories.sql` preserves existing salons as barber listings and
starts nail and massage categories disabled. Repeating the migration preserves
the administrator's saved category settings, accounts and appointments.

Open **Business categories** from the administrator dashboard (`/admin/categories`)
to enable or disable a category, edit its public description and staff titles, or
add more categories. New categories start disabled. In **Salon records**, choose
the category when creating or editing a listing; disabled categories are available
so managers can prepare services, staff profiles, staff service assignments,
availability, photos and home-visit settings before launch.

Enabled categories appear in separate homepage sections using the same salon
cards, location search, service search, ratings and booking flow. Staff titles
adapt to nail technicians, massage therapists and custom categories. Only staff
offering the selected treatment can be booked. Disabling a category hides its
public listings, profiles and API results and prevents new bookings, including
stale booking forms. Existing appointments, payments and manager tools remain
available; disabling a category does not cancel appointments or send emails.

Run `npm run test:categories:mysql` to verify the switches and booking flows in
an isolated database with captured email delivery.

## Live notifications

Customers and approved salon managers receive unread badges on their Messages
and Appointments links and dashboard cards. New messages, new bookings and
appointment changes also show a dismissible notification while the site is open.
Appointment cards highlight unread changes and refresh their saved details.
Updates are checked every five seconds while the tab is visible, and immediately
when returning to it. Expanded appointment details, search inputs and chat drafts
are preserved during refreshes.

Opening an appointment's folded details or confirmation page marks its displayed
changes viewed for that account. The other participant's unread state is separate.
Reading a chat clears its unread messages through the existing message feed.
Background checks do not extend the idle session timeout.

For existing installations, `npm run db:migrate` applies
`013_live_notifications.sql`. It preserves existing appointments and does not
mark old bookings as new. New installations include the notification tables and
triggers in `database/schema.sql`. Restart the app after updating the server code.

`npm test` includes the notification client's badge, refresh and acknowledgement
checks. `npm run test:notifications:mysql` verifies notification isolation,
transactional appointment events and persisted read state in a temporary database.
