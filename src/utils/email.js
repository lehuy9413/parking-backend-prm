const { google } = require('googleapis');
const logger = require('./logger');

const getOauth2Client = () => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return oAuth2Client;
};

const encodeHeaderUtf8 = (value) => {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${base64}?=`;
};

const buildRawEmail = (toEmail, subject, html, text) => {
  const boundary = 'parking-system-boundary';
  const encodedSubject = encodeHeaderUtf8(subject);
  const senderEmail = process.env.GMAIL_SENDER_EMAIL || process.env.EMAIL_USER;

  if (!senderEmail) {
    throw new Error('Missing GMAIL_SENDER_EMAIL or EMAIL_USER');
  }

  const emailLines = [
    `From: Parking System <${senderEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || 'Please view this email in an HTML compatible client.',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
    '',
    `--${boundary}--`,
  ];

  return Buffer.from(emailLines.join('\r\n')).toString('base64url');
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const oAuth2Client = getOauth2Client();
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    
    const raw = buildRawEmail(to, subject, html, text);
    
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: raw,
      },
    });

    logger.info(`Email sent: ${res.data.id}`);
    return res.data;
  } catch (error) {
    logger.error(`Email send error: ${error.message}`);
    throw error;
  }
};

const sendVerificationEmail = async (user, token) => {
  // Trỏ thẳng link xác nhận về Backend API thay vì mở Flutter app
  const serverUrl = process.env.SERVER_URL || 'https://parking-backend-prm.onrender.com';
  const verifyUrl = `${serverUrl}/api/v1/auth/verify-email/${token}`;
  
  await sendEmail({
    to: user.email,
    subject: 'Verify your email - Parking System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to Parking System!</h2>
        <p>Hi ${user.fullName},</p>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${verifyUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Verify Email
        </a>
        <p>Or copy this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
        <hr/>
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't create an account, please ignore this email.
        </p>
      </div>
    `,
  });
};

const sendResetPasswordEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset Password - Parking System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Reset Your Password</h2>
        <p>Hi ${user.fullName},</p>
        <p>You requested a password reset. Click the button below:</p>
        <a href="${resetUrl}" 
           style="display: inline-block; padding: 12px 24px; background-color: #dc2626; 
                  color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <hr/>
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't request a password reset, please ignore this email.
        </p>
      </div>
    `,
  });
};

const sendBookingConfirmation = async (user, booking) => {
  await sendEmail({
    to: user.email,
    subject: `Booking Confirmed #${booking._id} - Parking System`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Booking Confirmed!</h2>
        <p>Hi ${user.fullName},</p>
        <p>Your parking booking has been confirmed.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Booking ID:</strong> ${booking._id}</p>
          <p><strong>Parking Lot:</strong> ${booking.parkingLot?.name}</p>
          <p><strong>Date:</strong> ${new Date(booking.scheduledDate).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</p>
          <p><strong>Vehicle Type:</strong> ${booking.vehicleType?.name}</p>
        </div>
        <p>Please arrive on time. Your QR code is attached.</p>
      </div>
    `,
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendBookingConfirmation,
};
