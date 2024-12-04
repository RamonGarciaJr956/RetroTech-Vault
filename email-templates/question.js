export function AdminQuestionEmail({ email }) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Quote Request</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
                    border-radius: 10px;
                }
                .content {
                    background-color: #ffffff;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .logo {
                    text-align: center;
                    margin-bottom: 30px;
                }
                h1 {
                    color: #333333;
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    text-align: center;
                }
                .quote-info {
                    background-color: #f9f9f9;
                    padding: 20px;
                    border-radius: 5px;
                    margin-bottom: 25px;
                }
                .quote-info p {
                    color: #555555;
                    font-size: 16px;
                    line-height: 1.5;
                    margin-bottom: 10px;
                }
                .cta {
                    text-align: center;
                    margin-bottom: 25px;
                }
                .cta a {
                    background-color: #004aad;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    font-size: 16px;
                    display: inline-block;
                }
                .footer {
                    color: #999999;
                    font-size: 14px;
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content">
                    <div class="logo">
                        <img src="${process.env.DOMAIN}/images/Logo.png" alt="RetroTech Vault" width="200" height="100" style="max-width: 100%; height: auto;">
                    </div>
                    <h1>New Quote Request</h1>
                    <div class="quote-info">
                        <p><strong>From:</strong>${email}</p>
                    </div>
                    <div class="cta">
                        <a href="mailto:${email}">Respond to Quote Request</a>
                    </div>
                    <div class="footer">
                        <p>This is an automated email. Please do not reply directly to this message.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}