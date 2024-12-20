const Mailgen = require('mailgen');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

// const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

// const mailerSend = new MailerSend({
//   apiKey: process.env.MAILSEND_API_TOKEN,
// });

const sendEmailVerificationCode = async ({ email, verificationCode }) => {
  const sentFrom = new Sender(
    'hayan@trial-3yxj6ljy077ldo2r.mlsender.net',
    'Hayan Beigh',
  );

  const recipients = [new Recipient(email, 'Your Client')];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setReplyTo(sentFrom)
    .setSubject('Verification code')
    .setHtml(
      `<strong>
     ${verificationCode}
    </strong>`,
    )
    .setText('This is the text content');

  const response = await mailerSend.email.send(emailParams);
};

// module.exports = {
//   sendVerifyEmail,
// };

// import Mailgen from "mailgen";
// import nodemailer from "nodemailer";

// const sendEmail = async (options) => {
//   // Set the SendGrid API key from environment variables
//   sgMail.setApiKey(process.env.SENDGRID_API_KEY);

//   // Initialize Mailgen with theme and brand configuration
//   const mailGenerator = new Mailgen({
//     theme: 'default',
//     product: {
//       name: 'Quick Puff',
//       link: 'https://deliveryapptest.com',
//     },
//   });

//   // Generate the plaintext and HTML versions of the email
//   const emailText = mailGenerator.generatePlaintext(options.mailgenContent);
//   const emailHtml = mailGenerator.generate(options.mailgenContent);

//   // Email details
//   const mailOptions = {
//     to: options.email, // Recipient email
//     from: 'quickpuff048@gmail.com', // Sender email address
//     subject: options.subject, // Email subject
//     text: emailText, // Plaintext version
//     html: emailHtml, // HTML version
//   };

//   try {
//     // Send the email using SendGrid
//     await sgMail.send(mailOptions);
//   } catch (error) {
//     console.error('Failed to send email:', error.response?.body || error);
//   }
// };

// Load SMTP credentials from environment variables
const sendEmail = async (options) => {
  // Configure nodemailer with AWS SES SMTP credentials
  const transporter = nodemailer.createTransport({
    host: 'email-smtp.ap-south-1.amazonaws.com', // SES SMTP endpoint (from your config)
    port: 587, // Use port 587 for STARTTLS
    secure: false, // Use false for STARTTLS
    auth: {
      user: process.env.AWS_SMTP_USER_NAME, // AWS SMTP username
      pass: process.env.AWS_SMTP_PASSWORD, // AWS SMTP password
    },
  });

  // Initialize Mailgen with theme and brand configuration
  const mailGenerator = new Mailgen({
    theme: 'default',
    product: {
      name: 'Quick Puff',
      link: 'https://deliveryapptest.com',
    },
  });

  // Generate plaintext and HTML email content
  const emailText = mailGenerator.generatePlaintext(options.mailgenContent);
  const emailHtml = mailGenerator.generate(options.mailgenContent);

  // Configure the email details
  const mailOptions = {
    to: options.email, // Recipient email
    from: '"Quick Puff quickpuff795@gmail.com', // Sender email
    subject: options.subject, // Email subject
    text: emailText, // Plaintext version of email
    html: emailHtml, // HTML version of email
  };

  try {
    // Send the email using nodemailer with AWS SES
    const info = await transporter.sendMail(mailOptions);
    console.log(info);
    console.log('Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error.message);
  }
};

const emailVerificationMailgenContent = (username, verificationUrl) => {
  return {
    body: {
      name: username,
      intro: "Welcome to our app! We're very excited to have you on board.",
      action: {
        instructions:
          'To verify your email please click on the following button:',
        button: {
          color: '#22BC66', // Optional action button color
          text: 'Verify your email',
          link: verificationUrl,
        },
      },
      outro:
        "Need help, or have questions? Just reply to this email, we'd love to help.",
    },
  };
};

const loginCodeMailgenContent = (username, verificationCode) => {
  return {
    body: {
      name: username,
      intro: "Welcome to Quick Puff! We're very excited to have you on board.",
      action: {
        instructions: 'Here is your verification code:',
        button: {
          color: '#22BC66', // Optional action button color
          text: verificationCode,
          // link: verificationUrl,
        },
      },
      outro:
        "Need help, or have questions? Just reply to this email, we'd love to help.",
    },
  };
};

module.exports = {
  sendEmailVerificationCode,
  sendEmail,
  emailVerificationMailgenContent,
  loginCodeMailgenContent,
};
