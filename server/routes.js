import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import pool from './db.js';

export const router = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const apiError = (status, message) => Object.assign(new Error(message), { status });

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw apiError(400, `${field} is required and must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function idValue(value, field) {
  const id = String(value ?? '');
  if (!/^[1-9]\d*$/.test(id)) {
    throw apiError(400, `${field} must be a positive integer`);
  }
  return id;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw apiError(400, `${field} must be a positive integer`);
  }
  return number;
}

function validEmail(value, field = 'email') {
  const email = requiredText(value, field, 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw apiError(400, `${field} must be a valid email address`);
  }
  return email;
}

function createToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: '1d',
  });
}

const authenticate = asyncRoute(async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'A bearer token is required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = idValue(payload.sub, 'token subject');
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const [users] = await pool.execute(
    'SELECT user_id FROM users WHERE user_id = ? AND account_status = ?',
    [req.userId, 'ACTIVE'],
  );
  if (!users.length) {
    return res.status(401).json({ error: 'Account is unavailable' });
  }
  return next();
});

async function withTransaction(work) {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const result = await work(connection);
    await connection.commit();
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function releaseSeats(connection, registrationId) {
  await connection.execute(
    `UPDATE registration_seats
     SET assignment_status = 'RELEASED'
     WHERE registration_id = ? AND assignment_status IN ('HELD', 'CONFIRMED')`,
    [registrationId],
  );
}

router.post('/auth/register', asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, 'name', 100);
  const email = validEmail(req.body.email);
  const password = req.body.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw apiError(400, 'password must be between 8 and 200 characters');
  }
  const phone = req.body.phone == null ? null : requiredText(req.body.phone, 'phone', 20);
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
    [name, email, phone, passwordHash],
  );
  const user = { user_id: String(result.insertId), name, email, phone };
  return res.status(201).json({ user, token: createToken(user.user_id) });
}));

router.post('/auth/login', asyncRoute(async (req, res) => {
  const email = validEmail(req.body.email);
  const password = req.body.password;
  if (typeof password !== 'string' || !password || password.length > 200) {
    throw apiError(400, 'password is required and must be at most 200 characters');
  }
  const [users] = await pool.execute(
    `SELECT user_id, name, email, phone, password_hash, account_status
     FROM users WHERE email = ?`,
    [email],
  );
  if (
    !users.length ||
    users[0].account_status !== 'ACTIVE' ||
    !(await bcrypt.compare(password, users[0].password_hash))
  ) {
    throw apiError(401, 'Invalid email or password');
  }

  const { user_id, name, phone } = users[0];
  const user = { user_id: String(user_id), name, email, phone };
  return res.json({ user, token: createToken(user.user_id) });
}));

router.post('/organizers', authenticate, asyncRoute(async (req, res) => {
  const organizationName = requiredText(req.body.organization_name, 'organization_name', 150);
  const organizerType = requiredText(req.body.organizer_type, 'organizer_type', 30).toUpperCase();
  if (!['INDIVIDUAL', 'COMPANY', 'COMMUNITY'].includes(organizerType)) {
    throw apiError(400, 'organizer_type must be INDIVIDUAL, COMPANY, or COMMUNITY');
  }
  const contactEmail = validEmail(req.body.contact_email, 'contact_email');
  const contactPhone = req.body.contact_phone == null
    ? null
    : requiredText(req.body.contact_phone, 'contact_phone', 20);
  const [result] = await pool.execute(
    `INSERT INTO organizers
       (created_by_user_id, organization_name, organizer_type, contact_email, contact_phone)
     VALUES (?, ?, ?, ?, ?)`,
    [req.userId, organizationName, organizerType, contactEmail, contactPhone],
  );
  return res.status(201).json({
    organizer_id: String(result.insertId),
    created_by_user_id: req.userId,
    organization_name: organizationName,
    organizer_type: organizerType,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  });
}));

router.post('/colleges', authenticate, asyncRoute(async (req, res) => {
  const collegeName = requiredText(req.body.college_name, 'college_name', 200);
  const collegeEmail = req.body.college_email == null || req.body.college_email === ''
    ? null
    : validEmail(req.body.college_email, 'college_email');
  const address = req.body.address == null ? null : requiredText(req.body.address, 'address', 5000);
  const city = req.body.city == null ? null : requiredText(req.body.city, 'city', 100);
  const state = req.body.state == null ? null : requiredText(req.body.state, 'state', 100);
  const country = req.body.country == null
    ? 'India'
    : requiredText(req.body.country, 'country', 100);

  const college = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO colleges (college_name, college_email, address, city, state, country)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [collegeName, collegeEmail, address, city, state, country],
    );
    await connection.execute(
      `INSERT INTO college_admins (college_id, user_id, admin_role)
       VALUES (?, ?, 'ADMIN')`,
      [result.insertId, req.userId],
    );
    return {
      college_id: String(result.insertId),
      college_name: collegeName,
      college_email: collegeEmail,
      address,
      city,
      state,
      country,
    };
  });
  return res.status(201).json(college);
}));

router.post('/events', authenticate, asyncRoute(async (req, res) => {
  const eventName = requiredText(req.body.event_name, 'event_name', 200);
  const description = req.body.description == null
    ? null
    : requiredText(req.body.description, 'description', 10000);
  const venueId = idValue(req.body.venue_id, 'venue_id');
  const organizerId = req.body.organizer_id == null || req.body.organizer_id === ''
    ? null
    : idValue(req.body.organizer_id, 'organizer_id');
  const collegeId = req.body.college_id == null || req.body.college_id === ''
    ? null
    : idValue(req.body.college_id, 'college_id');

  if ((organizerId === null) === (collegeId === null)) {
    throw apiError(400, 'Provide exactly one of organizer_id or college_id');
  }

  if (organizerId) {
    const [owners] = await pool.execute(
      'SELECT organizer_id FROM organizers WHERE organizer_id = ? AND created_by_user_id = ?',
      [organizerId, req.userId],
    );
    if (!owners.length) {
      throw apiError(403, 'You must own the organizer profile to create its events');
    }
  } else {
    const [admins] = await pool.execute(
      'SELECT college_id FROM college_admins WHERE college_id = ? AND user_id = ?',
      [collegeId, req.userId],
    );
    if (!admins.length) {
      throw apiError(403, 'You must be a college admin to create its events');
    }
  }

  const price = req.body.price == null ? 0 : Number(req.body.price);
  const capacity = positiveInteger(req.body.capacity, 'capacity');
  const minTeamSize = req.body.min_team_size == null
    ? 1
    : positiveInteger(req.body.min_team_size, 'min_team_size');
  const maxTeamSize = req.body.max_team_size == null
    ? 5
    : positiveInteger(req.body.max_team_size, 'max_team_size');
  if (!Number.isFinite(price) || price < 0 || !/^\d+(\.\d{1,2})?$/.test(String(req.body.price ?? 0))) {
    throw apiError(400, 'price must be a non-negative amount with at most two decimal places');
  }
  if (minTeamSize > maxTeamSize) {
    throw apiError(400, 'min_team_size must not exceed max_team_size');
  }

  const startTime = req.body.start_time;
  const endTime = req.body.end_time;
  const registrationDeadline = req.body.registration_deadline;
  if (
    typeof startTime !== 'string' ||
    typeof endTime !== 'string' ||
    typeof registrationDeadline !== 'string'
  ) {
    throw apiError(400, 'start_time, end_time, and registration_deadline must be timestamp strings');
  }
  const startTimestamp = Date.parse(startTime);
  const endTimestamp = Date.parse(endTime);
  const deadlineTimestamp = Date.parse(registrationDeadline);
  if (
    !Number.isFinite(startTimestamp) ||
    !Number.isFinite(endTimestamp) ||
    !Number.isFinite(deadlineTimestamp) ||
    endTimestamp <= startTimestamp ||
    deadlineTimestamp > startTimestamp
  ) {
    throw apiError(400, 'Provide valid event timestamps; end_time must follow start_time and registration_deadline must not follow start_time');
  }

  const status = req.body.status == null ? 'DRAFT' : requiredText(req.body.status, 'status', 20).toUpperCase();
  if (!['DRAFT', 'PUBLISHED'].includes(status)) {
    throw apiError(400, 'status must be DRAFT or PUBLISHED');
  }

  const [result] = await pool.execute(
    `INSERT INTO events
       (organizer_id, college_id, created_by_user_id, venue_id, event_name, description,
        price, capacity, min_team_size, max_team_size, start_time, end_time,
        registration_deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizerId,
      collegeId,
      req.userId,
      venueId,
      eventName,
      description,
      price,
      capacity,
      minTeamSize,
      maxTeamSize,
      startTime,
      endTime,
      registrationDeadline,
      status,
    ],
  );
  return res.status(201).json({ event_id: String(result.insertId), status });
}));

router.get('/events', asyncRoute(async (req, res) => {
  const search = typeof req.query.search === 'string' ? `%${req.query.search.trim()}%` : null;
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
  const [events] = await pool.execute(
    `SELECT e.event_id, e.organizer_id, e.college_id, e.event_name, e.description,
            e.price, e.capacity, e.min_team_size, e.max_team_size, e.start_time,
            e.end_time, e.registration_deadline, e.status, v.venue_name, v.city,
            GREATEST(e.capacity - COALESCE(r.booked, 0), 0) AS remaining_capacity
     FROM events e
     JOIN venues v ON v.venue_id = e.venue_id
     LEFT JOIN (
       SELECT event_id, SUM(attendee_count) AS booked
       FROM registrations
       WHERE registration_status = 'CONFIRMED'
          OR (registration_status = 'HELD' AND hold_expires_at > NOW())
       GROUP BY event_id
     ) r ON r.event_id = e.event_id
     WHERE e.status = 'PUBLISHED'
       AND (? IS NULL OR e.event_name LIKE ?)
       AND (? IS NULL OR v.city = ?)
     ORDER BY e.start_time`,
    [search, search, city, city],
  );
  return res.json({ events });
}));

router.get('/events/:id/availability', asyncRoute(async (req, res) => {
  const eventId = idValue(req.params.id, 'event id');
  const [rows] = await pool.execute(
    `SELECT e.event_id, e.capacity,
            COALESCE(r.booked, 0) AS booked,
            GREATEST(e.capacity - COALESCE(r.booked, 0), 0) AS remaining_capacity
     FROM events e
     LEFT JOIN (
       SELECT event_id, SUM(attendee_count) AS booked
       FROM registrations
       WHERE registration_status = 'CONFIRMED'
          OR (registration_status = 'HELD' AND hold_expires_at > NOW())
       GROUP BY event_id
     ) r ON r.event_id = e.event_id
     WHERE e.event_id = ? AND e.status = 'PUBLISHED'`,
    [eventId],
  );
  if (!rows.length) {
    throw apiError(404, 'Event not found');
  }
  return res.json(rows[0]);
}));

router.post('/teams', authenticate, asyncRoute(async (req, res) => {
  const teamName = requiredText(req.body.team_name, 'team_name', 100);
  const team = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      'INSERT INTO teams (created_by_user_id, team_name) VALUES (?, ?)',
      [req.userId, teamName],
    );
    await connection.execute(
      `INSERT INTO team_members (team_id, user_id, member_role)
       VALUES (?, ?, 'LEADER')`,
      [result.insertId, req.userId],
    );
    return { team_id: String(result.insertId), team_name: teamName };
  });
  return res.status(201).json(team);
}));

router.post('/teams/:id/members', authenticate, asyncRoute(async (req, res) => {
  const teamId = idValue(req.params.id, 'team id');
  const userId = idValue(req.body.user_id, 'user_id');
  const [leaders] = await pool.execute(
    `SELECT t.team_id
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.team_id
     WHERE t.team_id = ? AND tm.user_id = ? AND tm.member_role = 'LEADER'`,
    [teamId, req.userId],
  );
  if (!leaders.length) {
    throw apiError(403, 'Only the team leader can add members');
  }
  const [users] = await pool.execute(
    'SELECT user_id FROM users WHERE user_id = ? AND account_status = ?',
    [userId, 'ACTIVE'],
  );
  if (!users.length) {
    throw apiError(404, 'Active user not found');
  }
  await pool.execute(
    `INSERT INTO team_members (team_id, user_id, member_role)
     VALUES (?, ?, 'MEMBER')`,
    [teamId, userId],
  );
  return res.status(201).json({ team_id: teamId, user_id: userId, member_role: 'MEMBER' });
}));

router.post('/registrations', authenticate, asyncRoute(async (req, res) => {
  const eventId = idValue(req.body.event_id, 'event_id');
  const teamId = req.body.team_id == null || req.body.team_id === ''
    ? null
    : idValue(req.body.team_id, 'team_id');

  const registration = await withTransaction(async (connection) => {
    const [events] = await connection.execute(
      `SELECT event_id, price, capacity, min_team_size, max_team_size, status,
              registration_deadline > NOW() AS registration_open
       FROM events WHERE event_id = ? FOR UPDATE`,
      [eventId],
    );
    if (!events.length) {
      throw apiError(404, 'Event not found');
    }
    const event = events[0];
    if (event.status !== 'PUBLISHED' || !event.registration_open) {
      throw apiError(409, 'Registration is closed for this event');
    }

    await connection.execute(
      `UPDATE registrations
       SET registration_status = 'EXPIRED'
       WHERE event_id = ? AND registration_status = 'HELD' AND hold_expires_at <= NOW()`,
      [eventId],
    );
    await connection.execute(
      `UPDATE registration_seats rs
       JOIN registrations r ON r.registration_id = rs.registration_id
       SET rs.assignment_status = 'RELEASED'
       WHERE r.event_id = ? AND r.registration_status = 'EXPIRED'
         AND rs.assignment_status IN ('HELD', 'CONFIRMED')`,
      [eventId],
    );

    let attendeeCount = 1;
    if (teamId) {
      const [teams] = await connection.execute(
        `SELECT COUNT(*) AS attendee_count,
                SUM(tm.user_id = ?) AS is_leader
         FROM team_members tm
         WHERE tm.team_id = ?`,
        [req.userId, teamId],
      );
      attendeeCount = Number(teams[0].attendee_count);
      if (!attendeeCount || !Number(teams[0].is_leader)) {
        throw apiError(403, 'Only the team leader can register the team');
      }
      if (attendeeCount < event.min_team_size || attendeeCount > event.max_team_size) {
        throw apiError(409, `Team size must be between ${event.min_team_size} and ${event.max_team_size}`);
      }
    }

    const [counts] = await connection.execute(
      `SELECT COALESCE(SUM(attendee_count), 0) AS booked
       FROM registrations
       WHERE event_id = ?
         AND (registration_status = 'CONFIRMED'
           OR (registration_status = 'HELD' AND hold_expires_at > NOW()))`,
      [eventId],
    );
    const booked = Number(counts[0].booked);
    if (booked + attendeeCount > Number(event.capacity)) {
      throw apiError(409, 'Not enough capacity remains for this registration');
    }

    const isFree = Number(event.price) === 0;
    const [result] = await connection.execute(
      `INSERT INTO registrations
         (event_id, user_id, team_id, attendee_count, registration_status, hold_expires_at)
       VALUES (?, ?, ?, ?, ?, ${isFree ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL 10 MINUTE)'})`,
      [eventId, teamId ? null : req.userId, teamId, attendeeCount, isFree ? 'CONFIRMED' : 'HELD'],
    );
    const [created] = await connection.execute(
      `SELECT registration_id, event_id, attendee_count, registration_status,
              hold_expires_at, registered_at
       FROM registrations WHERE registration_id = ?`,
      [result.insertId],
    );
    return created[0];
  });
  return res.status(201).json(registration);
}));

router.post('/registrations/:id/cancel', authenticate, asyncRoute(async (req, res) => {
  const registrationId = idValue(req.params.id, 'registration id');
  const result = await withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT r.registration_id, r.user_id, r.team_id, r.registration_status,
              (r.user_id = ? OR EXISTS (
                SELECT 1 FROM team_members tm
                WHERE tm.team_id = r.team_id AND tm.user_id = ?
              )) AS is_owner
       FROM registrations r
       WHERE r.registration_id = ? FOR UPDATE`,
      [req.userId, req.userId, registrationId],
    );
    if (!rows.length) {
      throw apiError(404, 'Registration not found');
    }
    const registration = rows[0];
    if (!registration.is_owner) {
      throw apiError(403, 'You cannot cancel this registration');
    }
    if (registration.registration_status === 'CANCELLED') {
      return { registration_id: registrationId, registration_status: 'CANCELLED' };
    }
    if (registration.registration_status === 'CONFIRMED') {
      throw apiError(409, 'Confirmed registrations require a refund workflow and cannot be cancelled here');
    }
    if (!['HELD', 'PENDING'].includes(registration.registration_status)) {
      throw apiError(409, `A ${registration.registration_status.toLowerCase()} registration cannot be cancelled`);
    }
    await connection.execute(
      `UPDATE registrations SET registration_status = 'CANCELLED', hold_expires_at = NULL
       WHERE registration_id = ?`,
      [registrationId],
    );
    await connection.execute(
      `UPDATE payments SET payment_status = 'FAILED'
       WHERE registration_id = ? AND payment_status = 'PENDING'`,
      [registrationId],
    );
    await releaseSeats(connection, registrationId);
    return { registration_id: registrationId, registration_status: 'CANCELLED' };
  });
  return res.json(result);
}));

router.post('/payments', authenticate, asyncRoute(async (req, res) => {
  const registrationId = idValue(req.body.registration_id, 'registration_id');
  const paymentMethod = requiredText(req.body.payment_method, 'payment_method', 30).toUpperCase();
  const [rows] = await pool.execute(
    `SELECT r.registration_id, r.user_id, r.team_id, r.attendee_count,
            r.registration_status, r.hold_expires_at,
            (r.hold_expires_at > NOW()) AS hold_active, e.price,
            (r.user_id = ? OR EXISTS (
              SELECT 1 FROM team_members tm
              WHERE tm.team_id = r.team_id AND tm.user_id = ?
            )) AS is_owner
     FROM registrations r
     JOIN events e ON e.event_id = r.event_id
     WHERE r.registration_id = ?`,
    [req.userId, req.userId, registrationId],
  );
  if (!rows.length) {
    throw apiError(404, 'Registration not found');
  }
  const registration = rows[0];
  if (!registration.is_owner) {
    throw apiError(403, 'You cannot pay for this registration');
  }
  if (
    registration.registration_status !== 'HELD' ||
    !registration.hold_active
  ) {
    throw apiError(409, 'The registration hold is no longer active');
  }
  const amount = Number((Number(registration.price) * Number(registration.attendee_count)).toFixed(2));
  if (amount <= 0) {
    throw apiError(400, 'Free registrations do not require a payment attempt');
  }
  const [result] = await pool.execute(
    `INSERT INTO payments (registration_id, amount, payment_method, payment_status)
     VALUES (?, ?, ?, 'PENDING')`,
    [registrationId, amount, paymentMethod],
  );
  return res.status(201).json({
    payment_id: String(result.insertId),
    registration_id: registrationId,
    amount: amount.toFixed(2),
    payment_method: paymentMethod,
    payment_status: 'PENDING',
  });
}));

router.post('/payments/webhook', asyncRoute(async (req, res) => {
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  const suppliedSecret = req.get('x-webhook-secret') || '';
  if (!expectedSecret) {
    throw apiError(503, 'Payment webhook is not configured');
  }
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw apiError(401, 'Invalid webhook secret');
  }

  const paymentId = idValue(req.body.payment_id, 'payment_id');
  const status = requiredText(req.body.status, 'status', 20).toUpperCase();
  const transactionId = req.body.transaction_id == null
    ? null
    : requiredText(req.body.transaction_id, 'transaction_id', 150);
  if (!['SUCCESS', 'FAILED'].includes(status)) {
    throw apiError(400, 'status must be SUCCESS or FAILED');
  }

  const outcome = await withTransaction(async (connection) => {
    const [payments] = await connection.execute(
      'SELECT payment_id, registration_id, payment_status FROM payments WHERE payment_id = ? FOR UPDATE',
      [paymentId],
    );
    if (!payments.length) {
      throw apiError(404, 'Payment not found');
    }
    const payment = payments[0];
    if (payment.payment_status !== 'PENDING') {
      if (payment.payment_status === status) {
        return { payment_id: paymentId, payment_status: status, already_processed: true };
      }
      throw apiError(409, 'Payment has already been processed with a different status');
    }

    const [registrations] = await connection.execute(
      `SELECT registration_id, registration_status,
              hold_expires_at > NOW() AS hold_active
       FROM registrations WHERE registration_id = ? FOR UPDATE`,
      [payment.registration_id],
    );
    const registration = registrations[0];
    const expiredSuccess = status === 'SUCCESS' &&
      (registration.registration_status !== 'HELD' || !registration.hold_active);

    await connection.execute(
      `UPDATE payments
       SET payment_status = ?, transaction_id = ?, payment_date = NOW()
       WHERE payment_id = ?`,
      [status, transactionId, paymentId],
    );

    if (status === 'FAILED' && registration.registration_status === 'HELD') {
      await connection.execute(
        `UPDATE registrations SET registration_status = 'FAILED', hold_expires_at = NULL
         WHERE registration_id = ?`,
        [registration.registration_id],
      );
      await releaseSeats(connection, registration.registration_id);
    } else if (status === 'SUCCESS' && !expiredSuccess) {
      await connection.execute(
        `UPDATE registrations
         SET registration_status = 'CONFIRMED', hold_expires_at = NULL
         WHERE registration_id = ?`,
        [registration.registration_id],
      );
      await connection.execute(
        `UPDATE registration_seats SET assignment_status = 'CONFIRMED'
         WHERE registration_id = ? AND assignment_status = 'HELD'`,
        [registration.registration_id],
      );
    } else if (expiredSuccess && registration.registration_status === 'HELD') {
      await connection.execute(
        `UPDATE registrations SET registration_status = 'EXPIRED', hold_expires_at = NULL
         WHERE registration_id = ?`,
        [registration.registration_id],
      );
      await releaseSeats(connection, registration.registration_id);
    }

    return {
      payment_id: paymentId,
      payment_status: status,
      expired_registration: expiredSuccess,
    };
  });

  if (outcome.expired_registration) {
    return res.status(409).json({
      ...outcome,
      error: 'Payment succeeded after the registration hold expired; refund handling is required',
    });
  }
  return res.json(outcome);
}));

router.post('/reviews', authenticate, asyncRoute(async (req, res) => {
  const eventId = idValue(req.body.event_id, 'event_id');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw apiError(400, 'rating must be an integer from 1 to 5');
  }
  const reviewText = req.body.review_text == null
    ? null
    : requiredText(req.body.review_text, 'review_text', 10000);
  const [events] = await pool.execute(
    `SELECT event_id FROM events WHERE event_id = ? AND status = 'COMPLETED'`,
    [eventId],
  );
  if (!events.length) {
    throw apiError(409, 'Reviews are available only for completed events');
  }
  const [registrations] = await pool.execute(
    `SELECT registration_id
     FROM registrations r
     WHERE r.event_id = ? AND r.registration_status = 'CONFIRMED'
       AND (r.user_id = ? OR EXISTS (
         SELECT 1 FROM team_members tm
         WHERE tm.team_id = r.team_id AND tm.user_id = ?
       ))
     LIMIT 1`,
    [eventId, req.userId, req.userId],
  );
  if (!registrations.length) {
    throw apiError(403, 'A confirmed event participant is required to review this event');
  }
  const [result] = await pool.execute(
    'INSERT INTO reviews (user_id, event_id, rating, review_text) VALUES (?, ?, ?, ?)',
    [req.userId, eventId, rating, reviewText],
  );
  return res.status(201).json({
    review_id: String(result.insertId),
    user_id: req.userId,
    event_id: eventId,
    rating,
    review_text: reviewText,
  });
}));

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with the same unique value already exists' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({ error: 'A referenced record is invalid or a database constraint was not met' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON' });
  }
  if (error.status) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error('API request failed:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
