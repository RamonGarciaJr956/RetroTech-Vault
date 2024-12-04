export function PasswordResetEmailTemplate({ token }) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; border-radius: 10px;">
            <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="${process.env.DOMAIN}/images/Logo.png" alt="RetroTech Vault" width="200" height="100" style="max-width: 100%; height: auto;">
                </div>

                <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin-bottom: 20px; text-align: center;">
                    Reset Your Password
                </h1>

                <p style="color: #555555; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
                    We received a request to reset the password for your account. If you didn't make this request, you can safely ignore this email.
                </p>

                <div style="text-align: center; margin-bottom: 25px;">
                    <a href="${process.env.DOMAIN}/reset-password?token=${token}" style="background-color: #004aad; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
                        Reset Password
                    </a>
                </div>

                <p style="color: #777777; font-size: 14px; margin-bottom: 20px;">
                    If the button above doesn't work, copy and paste the following URL into your browser:
                </p>

                <p style="background-color: #eaeaea; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 14px;">
                    <a href="${process.env.DOMAIN}/reset-password/?token=${token}" style="color: #004aad; text-decoration: none;">
                        ${process.env.DOMAIN}/reset-password/?token=${token}
                    </a>
                </p>

                <p style="color: #999999; font-size: 14px; margin-top: 30px; text-align: center;">
                    If you didn't request a password reset, please ignore this email or contact support if you have concerns.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}