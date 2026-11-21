# ⚡ HackGrid — Real-Time Hackathon Booking & Management System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%2B-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--Time-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Database Normalization](https://img.shields.io/badge/Normalization-3NF-blueviolet?style=for-the-badge)](#database-architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**HackGrid** is a real-time hackathon discovery, booking, and event management platform engineered to handle high-concurrency registrations without overbooking. Built with **Node.js**, **MySQL**, and **WebSockets**, HackGrid treats the relational database as the single source of truth while delivering live seat and capacity updates to participants and organizers.

---

## 📋 Table of Contents
- [Key Features](#-key-features)
- [System Architecture & Tech Stack](#-system-architecture--tech-stack)
- [Database Architecture (13-Table 3NF Schema)](#-database-architecture-13-table-3nf-schema)
- [Concurrency & Real-Time Booking Workflow](#-concurrency--real-time-booking-workflow)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Endpoints Overview](#-api-endpoints-overview)
- [DBMS Concepts Demonstrated](#-dbms-concepts-demonstrated)

---

## ✨ Key Features

* **Dual Event Ownership Model:** Supports both **Independent Organizers** (communities, companies, individuals) and **Registered Colleges** (managed via authorized `College_Admins`).
* **Flexible Participant Registration:** Seamlessly supports both **Solo Hackers** and **Multi-Member Teams** within a unified registration pipeline, enforcing event-specific `min_team_size` and `max_team_size` rules.
* **LiveSeat (Real-Time Capacity & Seat Allocation):** 
  * Live remaining capacity counters broadcast via WebSockets immediately after database transaction commits.
  * Optional numbered seat selection (`Seats` & `Registration_Seats`) for venues requiring assigned seating, alongside general admission capacity tracking.
* **Transactional Hold & Expiry Engine:** Short-lived reservations (`HELD` status with `hold_expires_at` timestamps) prevent race conditions during external payment gateways, automatically releasing expired holds back into the available pool.
* **Multi-Attempt Payment Tracking:** Decoupled payment ledger (`Payments`) supporting retries, multiple payment methods, webhook verification, and refund states.
* **Post-Event Reviews & Ratings:** Verified participant rating system (`1–5` scale) restricted to one review per user per event.

---

## 🛠 System Architecture & Tech Stack

| Layer | Technology | Responsibility |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js & Express** | RESTful APIs, authentication, business logic, and payment webhooks |
| **Relational Database** | **MySQL 8.0+ (InnoDB)** | ACID transactions, row-level locking (`FOR UPDATE`), 3NF data storage, and referential integrity |
| **Real-Time Engine** | **Socket.IO** | Broadcasting committed availability and seat-status changes to connected clients |
| **Frontend** | **HTML5 / CSS3 / JS (or React)** | Live event dashboards, interactive seat maps, and team management |

---

## 🗄 Database Architecture (13-Table 3NF Schema)

HackGrid is built on a strictly normalized **Third Normal Form (3NF)** relational schema consisting of **13 core tables**:

### 1. Users & Institutions
1. **`Users`**: Core user accounts, authentication credentials, and account status (`ACTIVE`, `BLOCKED`).
2. **`Organizers`**: Independent organizing profiles (`INDIVIDUAL`, `COMPANY`, `COMMUNITY`) linked to managing users.
3. **`Colleges`**: Registered educational institutions hosting campus hackathons.
4. **`College_Admins`**: Authorization mapping linking `Users` to `Colleges` with administrative roles.

### 2. Event Management
5. **`Venues`**: Physical locations hosting events.
6. **`Events`**: Hackathon metadata, pricing, capacity, team size bounds, and schedules. Enforces mutually exclusive ownership (`organizer_id` XOR `college_id`).

### 3. Team Management
7. **`Teams`**: Participant teams created by users.
8. **`Team_Members`**: Junction table mapping users to teams with explicit roles (`LEADER`, `MEMBER`).

### 4. Registrations & Seating
9. **`Registrations`**: Unified booking table supporting mutually exclusive individual (`user_id`) or team (`team_id`) registrations, attendee counts, and hold expirations.
10. **`Seats`**: Optional numbered seats associated with specific events.
11. **`Registration_Seats`**: Tracks seat assignments (`HELD`, `CONFIRMED`, `RELEASED`) with composite foreign keys ensuring seats match the registered event.

### 5. Transactions & Feedback
12. **`Payments`**: Tracks payment attempts, gateway transaction IDs, and statuses (`PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`).
13. **`Reviews`**: Participant ratings (`1–5`) and feedback per event.

---

## 🔒 Concurrency & Real-Time Booking Workflow

To eliminate double-booking when multiple users compete for the final slot or seat simultaneously, HackGrid executes bookings through a strict **2-Phase Transactional Hold Protocol**:

1. **Row-Level Serialization (`BEGIN` + `SELECT ... FOR UPDATE`):** The backend locks the target `Events` row to serialize concurrent capacity checks.
2. **Garbage Collection:** Any `HELD` registrations where `hold_expires_at <= NOW()` are transitioned to `EXPIRED`, and their seats are marked `RELEASED`.
3. **Capacity Validation:** Available capacity is computed dynamically:
   $$\text{Available Slots} = \text{Event Capacity} - \sum(\text{CONFIRMED Attendees}) - \sum(\text{Unexpired HELD Attendees})$$
4. **Temporary Hold Creation:** If capacity permits, a `HELD` registration (and optional `HELD` seat assignments) is inserted with a 10-minute expiration window, and the transaction commits.
5. **External Payment & Webhook Confirmation:** Payment occurs outside the DB lock. Upon verified gateway webhook confirmation, a second atomic transaction promotes the status from `HELD` to `CONFIRMED`.
6. **Post-Commit Broadcast:** Only *after* MySQL commits the transaction does Socket.IO emit updated seat availability to connected browsers.

---

## 📁 Project Structure

```text
hackgrid/
├── database/
│   ├── schema.sql           # Complete 13-table MySQL DDL with constraints & indexes
│   └── seed.sql             # Sample dataset (10+ tuples per table) for testing & queries
├── src/
│   ├── config/
│   │   └── db.js            # mysql2/promise connection pool configuration
│   ├── controllers/         # Request handlers (auth, events, teams, bookings, payments)
│   ├── routes/              # Express API route definitions
│   ├── services/
│   │   └── bookingService.js # ACID transaction & SELECT FOR UPDATE locking logic
│   ├── sockets/
│   │   └── availability.js  # Socket.IO room management & live seat broadcasts
│   └── app.js               # Express & HTTP server entry point
├── .env.example             # Environment variable template
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18 or higher)
* **MySQL Server** (v8.0 or higher)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/hackgrid.git
cd hackgrid
```

### 2. Initialize the MySQL Database
Create a database named `hackgrid` and import `init/hackgrid_backup.sql` using MySQL Workbench or your preferred MySQL import tool. The dump drops and recreates its tables, so back up existing data first.

### 3. Configure Environment Variables
Copy `.env.example` to `.env` in the project root and set your MySQL password and two separate random secrets. Do not commit `.env`.
```env
PORT=5000
DB_PASSWORD=your_mysql_password
JWT_SECRET=at_least_32_random_characters
PAYMENT_WEBHOOK_SECRET=a_separate_random_webhook_secret
```

### 4. Install Dependencies & Run
Run the API and frontend in separate terminals:
```bash
npm install
npm run api
```
```bash
npm run dev
```
The API listens on `http://localhost:5000`; the Vite frontend is usually at `http://localhost:5173`.

---

## 🔌 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Create an account and return a bearer token |
| `POST` | `/api/auth/login` | Authenticate and return a bearer token |
| `POST` | `/api/organizers` | Register an organizer profile |
| `POST` | `/api/colleges` | Register a college and make the caller its admin |
| `POST` | `/api/events` | Create a draft or published event |
| `GET` | `/api/events` | Browse published events; optional `search` and `city` query parameters |
| `GET` | `/api/events/:id/availability` | Return capacity, booked places, and remaining places |
| `POST` | `/api/teams` | Create a team; caller becomes its leader |
| `POST` | `/api/teams/:id/members` | Add a user to a team |
| `POST` | `/api/registrations` | Register an individual or team; paid events receive a 10-minute hold |
| `POST` | `/api/registrations/:id/cancel` | Cancel a pending or held registration |
| `POST` | `/api/payments` | Create a pending payment ledger record |
| `POST` | `/api/payments/webhook` | Verify the configured webhook secret and process payment status |
| `POST` | `/api/reviews` | Submit a review as a confirmed participant of a completed event |

All routes except `GET /api/events`, `GET /api/events/:id/availability`, `POST /api/auth/register`, `POST /api/auth/login`, and the secret-protected payment webhook require `Authorization: Bearer <token>`. Send JSON fields matching the database names (for example `event_id`, `venue_id`, or `registration_id`). The payment endpoint creates a ledger attempt only; connect a payment provider before accepting real payments. The webhook expects `x-webhook-secret` and a JSON body containing `payment_id`, `status` (`SUCCESS` or `FAILED`), and optionally `transaction_id`.

---

## 🎓 DBMS Concepts Demonstrated

This project is designed to showcase core relational database principles in a real-world production scenario:
* **Normalization (1NF, 2NF, 3NF):** Elimination of repeating groups (e.g., `Team_Members`, `Registration_Seats`) and transitive dependencies (`Venues`, `Colleges`, `Organizers`).
* **Complex Integrity Constraints:** `CHECK` constraints for mutually exclusive foreign keys (`organizer_id` vs `college_id`, `user_id` vs `team_id`), composite foreign keys (`(event_id, seat_id)`), and range validations.
* **Concurrency Control:** Pessimistic row-level locking (`SELECT ... FOR UPDATE`) to prevent lost updates and phantom reads during peak booking traffic.
* **Analytical SQL:** Multi-table `JOIN`s, `GROUP BY` / `HAVING` aggregations for organizer dashboards, correlated subqueries for live capacity calculation, and indexed lookups.

---

## 📄 License
This project is licensed under the MIT License. See the `LICENSE` file for details.