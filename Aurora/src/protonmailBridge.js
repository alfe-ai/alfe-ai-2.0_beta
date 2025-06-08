/**
 * Simple example demonstrating how to send emails using ProtonMail Bridge in Node.js.
 * 
 * Steps:
 * 1. Install ProtonMail Bridge and configure it locally.
 * 2. Retrieve local SMTP details from the Bridge (host, port, user, pass).
 * 3. Use those credentials in the Nodemailer transport config below.
 */

import nodemailer from 'nodemailer';

/**
 * Creates a Nodemailer transporter configured to use ProtonMail Bridge.
 *
 * @param {Object} options
 * @param {string} options.host   - Typically '127.0.0.1' or 'localhost'
 * @param {number} options.port   - The SMTP port exposed by ProtonMail Bridge (e.g., 1025)
 * @param {boolean} options.secure - false if using a plain (non-SSL/TLS) port
 * @param {string} options.user   - Bridge username
 * @param {string} options.pass   - Bridge password
 * @returns {Transporter} A Nodemailer transport instance.
 */
export function createProtonMailTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Example usage:
 *
 * const transport = createProtonMailTransport({
 *   host: '127.0.0.1',
 *   port: 1025,
 *   secure: false,
 *   user: 'bridge-username',
 *   pass: 'bridge-password'
 * });
 *
 * transport.sendMail({
 *   from: 'me@protonmail.com',
 *   to: 'someone@example.com',
 *   subject: 'ProtonMail Bridge Test',
 *   text: 'Hello from ProtonMail Bridge!'
 * })
 * .then(info => console.log('Message sent:', info))
 * .catch(err => console.error('Error:', err));
 */


