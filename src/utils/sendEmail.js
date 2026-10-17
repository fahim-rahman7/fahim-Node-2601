// HTML Email Template for OTP
export const generateOtpEmailTemplate = (name, otp) => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #333; text-align: center;">Account Verification</h2>
        <p style="font-size: 16px; color: #555;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 16px; color: #555;">Thank you for registering with us. Please use the following One-Time Password (OTP) to verify your account:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 28px; font-weight: bold; background-color: #4F46E5; color: #fff; padding: 12px 24px; border-radius: 8px; letter-spacing: 4px; display: inline-block;">${otp}</span>
        </div>
  
        <p style="font-size: 14px; color: #777; text-align: center;">This OTP is valid for only <strong>5 minutes</strong>.</p>
        <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
      </div>
    `;
  };
  // HTML Email Template for Password Reset Link
export const generateResetLinkEmailTemplate = (name, resetLink) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
      <p style="font-size: 16px; color: #555;">Hello <strong>${name}</strong>,</p>
      <p style="font-size: 16px; color: #555;">We received a request to reset your password. Click the button below to reset it:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="font-size: 16px; font-weight: bold; background-color: #DC2626; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Reset Password</a>
      </div>

      <p style="font-size: 14px; color: #777; text-align: center;">This link is valid for only <strong>15 minutes</strong>.</p>
      <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;
};
  // HTML Email Template for Password Reset
export const generateResetPasswordEmailTemplate = (name, otp) => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p style="font-size: 16px; color: #555;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 16px; color: #555;">We received a request to reset your password. Use the following One-Time Password (OTP):</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 28px; font-weight: bold; background-color: #DC2626; color: #fff; padding: 12px 24px; border-radius: 8px; letter-spacing: 4px; display: inline-block;">${otp}</span>
        </div>
  
        <p style="font-size: 14px; color: #777; text-align: center;">This OTP is valid for only <strong>5 minutes</strong>.</p>
        <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
      </div>
    `;
  };
  // Function to Send Email via Brevo API
  export const sendEmail = async ({ to, subject, htmlContent }) => {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { 
            email: process.env.BREVO_SENDER_EMAIL, 
            name: 'FDR Assignment App' 
          },
          to: [{ email: to }],
          subject: subject,
          htmlContent: htmlContent,
        }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Brevo API Error:', errorData);
        throw new Error('Email pathate somoshsha hoyeche!');
      }
  
      return true;
    } catch (error) {
      console.error('Email sending failed:', error.message);
      throw error;
    }
  };