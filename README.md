# Barber Finder
Barber Finder is a web-based platform designed to connect customers with
barbers and salons. Customers can discover services, book appointments
at a salon or request a home visit. Barbers and salon managers can
manage appointments and communicate with customers through the platform.
# Key Features
- Customer accounts: Register, sign in and manage bookings.
- Salon and barber discovery: Browse salons, barbers and available
  services.
- Appointment booking: Select a service, barber, date and time.
- Home visits: Request a barber to travel to a customer's address,
  subject to availability and travel-distance rules.
- Appointment management: Managers review and confirm bookings;
  customers and barbers can view appointment details and status.
- Notifications: SMTP email notifications inform barbers about
  confirmed appointments.
- Customer--barber messaging: In-app conversations let customers
  and barbers discuss appointments without exchanging personal phone
  numbers.
- Reviews and feedback: Customers can provide feedback after
  appointments.
# Technology Stack
- Backend: Node.js and Express.js
- Frontend: Pug templates, JavaScript and CSS
- Database: MySQL
- Real-time messaging: Socket.IO, where integrated
- Email: SMTP
- Maps and routing: Google Maps Geocoding API and Routes API
- Development: Docker and npm
The exact services and integrations available depend on the current
project configuration.
Typical Booking Workflow
1. A customer creates an account or signs in.
2. The customer browses salons, barbers and services.
3. The customer chooses a salon appointment or requests a home visit.
4. For a home visit, the address and journey are checked against the
   salon's home-visit settings.
5. The customer selects an available date and time and reviews the
   booking.
6. The booking is submitted for manager review.
7. The manager confirms or rejects the booking.
8. When confirmed, the barber receives an email notification and the
   customer is notified.
9. The customer and barber can communicate through the platform.
10. After the appointment, the customer can leave a review.
Home Visits
Home visits allow participating barbers to serve customers at their
addresses. Google Maps services can be used to verify addresses and
calculate road journeys. Travel availability and pricing depend on the
configured salon settings.

The Google Maps server API key must be stored securely as an environment
variable and must not be exposed in browser-side code.
Project Setup
1. Install Node.js and npm.
2. Clone or open the project repository.
3. Install dependencies:
   npm install
4. Create a local .env file using the environment variables required
   by the project. Check the existing configuration and setup
   documentation for the exact names and values.
5. Configure the MySQL database and apply the project's database schema
   or migrations.
6. Start the development server using the script configured in
   package.json, for example:
   npm run dev
7. Open the local address printed by the development server.
Do not commit .env files, passwords, database credentials or API keys
to source control.
Configuration Notes
The project may require configuration for:
- MySQL connection details
- SMTP credentials
- Google Maps server API key
- Application time zone
- Payment provider credentials, if online payments are enabled
Use test credentials and payment-provider test mode during development.
Configure production secrets through the hosting provider's
environment-variable settings.
Planned Enhancements
The following features have been discussed for future development and
should only be described as available once implemented and tested:
- Configurable Barber Finder booking fee.
- Automated booking-fee refunds when appointments are cancelled.
- ChatGuard moderation to detect contact sharing and attempts to
  arrange bookings outside the platform.
- Admin tools for reviewing moderation incidents, payments and
  refunds.
Security
- Keep secrets and API keys out of source control.
- Enforce authentication and role-based authorization on the server.
- Validate user input on the server.
- Verify payment status and payment webhooks on the server if payments
  are enabled.
- Restrict access to appointment and chat data to authorized users.
- Do not expose customers' private contact details unnecessarily.
Project Status
Barber Finder is under active development. Features and integrations may
change as the booking, home-visit, messaging and administration
workflows are completed and tested.