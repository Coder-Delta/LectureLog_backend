import { Resend } from 'resend';
import pool from '../config/database.config.js';
import dotenv from 'dotenv';

dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const sendWelcomeRegistrationEmail = async ({ name, email, role, organization_id }) => {
  if (!resend) {
    console.log(`[Email Service]: Resend API key not configured. Skipping welcome email to ${email}`);
    return;
  }

  try {
    // Fetch organization details (Name and Slug/Code)
    const orgRes = await pool.query('SELECT name, slug FROM organizations WHERE id = $1', [organization_id]);
    const orgName = orgRes.rows[0]?.name || 'Your College';
    const orgSlug = orgRes.rows[0]?.slug || 'college-code';

    const frontendUrl = process.env.FRONTEND_URL || 'https://merge-portal.vercel.app';
    const desktopAppDownload = `${frontendUrl}/downloads/merge-desktop-latest.exe`;
    const mobileAppDownload = `${frontendUrl}/downloads/merge-mobile.apk`;

    const roleFormatted = role === 'teacher' ? 'Faculty Member' : 'Student';

    const htmlContent = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b; line-height: 1.6;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.07); border: 1px solid #e2e8f0;">
        
        <!-- Header GIF Banner -->
        <div style="text-align: center; margin-bottom: 32px;">
          <img src="https://res.cloudinary.com/dmi7vzu8w/image/upload/v1779071014/Merge_2_kuaat5.gif" alt="Welcome to Merge" style="width: 100%; max-width: 500px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(16, 89, 52, 0.15);" />
        </div>

        <h1 style="color: #105934; font-size: 26px; font-weight: 800; margin-top: 0; margin-bottom: 8px; text-align: center;">Welcome to Merge!</h1>
        <p style="font-size: 16px; color: #64748b; margin-top: 0; margin-bottom: 28px; text-align: center;">Intelligent Classroom Monitoring & Attendance</p>

        <p style="font-size: 16px; margin-bottom: 16px;">Hey <strong>${name}</strong>,</p>
        
        <p style="font-size: 16px; margin-bottom: 24px;">
          <strong>${orgName}</strong> has just registered you as a <strong>${roleFormatted}</strong> in Merge using this email address (${email}).
        </p>

        <div style="background-color: #f0fdf4; border-left: 4px solid #105934; padding: 20px; border-radius: 0 16px 16px 0; margin-bottom: 28px;">
          <h3 style="color: #105934; font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 8px;">🔑 How to Activate Your Account:</h3>
          <ol style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px;">
            <li style="margin-bottom: 8px;">Click the <strong>Activate My Account</strong> button below.</li>
            <li style="margin-bottom: 8px;">Select your college: <strong>${orgName}</strong> (College Code: <strong style="color: #105934; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${orgSlug}</strong>).</li>
            <li style="margin-bottom: 8px;">Verify your email with the secure one-time code sent to your inbox.</li>
            <li>Set your private password and access your smart timetable!</li>
          </ol>
        </div>

        <!-- Main Action Button -->
        <div style="text-align: center; margin-bottom: 36px;">
          <a href="${frontendUrl}/login" target="_blank" style="display: inline-block; background-color: #105934; color: #ffffff; padding: 16px 36px; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 14px; box-shadow: 0 10px 20px -5px rgba(16, 89, 52, 0.3); transition: all 0.2s;">
            Activate My Account
          </a>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 28px;" />

        <!-- Promotional Apps Section -->
        <div style="text-align: center; background-color: #f8fafc; padding: 28px; border-radius: 20px; border: 1px solid #f1f5f9;">
          <h4 style="color: #0f172a; font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 8px;">📱 Download Merge Companion Apps</h4>
          <p style="font-size: 14px; color: #64748b; margin-top: 0; margin-bottom: 20px;">
            Stay synced with live timetable alerts, automatic attendance tracking, and instant notifications.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <a href="${desktopAppDownload}" target="_blank" style="background-color: #ffffff; color: #0f172a; padding: 12px 20px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); display: inline-block; margin: 4px;">
              💻 Desktop App
            </a>
            <a href="${mobileAppDownload}" target="_blank" style="background-color: #ffffff; color: #0f172a; padding: 12px 20px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); display: inline-block; margin: 4px;">
              📱 Mobile App
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 36px; color: #94a3b8; font-size: 13px;">
          <p style="margin-bottom: 4px;">You received this email because your institution registered you in Merge AI.</p>
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Merge Intelligent Systems. All rights reserved.</p>
        </div>

      </div>
    </div>
    `;

    await resend.emails.send({
      from: 'Merge AI <welcome@mahammadanish.me>',
      to: email,
      subject: `Welcome to Merge, ${name}! Activate Your Account`,
      html: htmlContent
    });

    console.log(`[Email Service]: Welcome email successfully dispatched to ${email}`);
  } catch (err) {
    console.error(`[Email Service Error]: Failed to send welcome email to ${email}:`, err.message);
  }
};
