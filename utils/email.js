const Mailgen = require("mailgen");
const nodemailer = require("nodemailer");

// const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend"); 

// const mailerSend = new MailerSend({
//   apiKey: process.env.MAILSEND_API_TOKEN,
// });

const sendEmailVerificationCode = async ({ email, verificationCode }) => {
  const sentFrom = new Sender(
    "hayan@trial-3yxj6ljy077ldo2r.mlsender.net",
    "Hayan Beigh"
  );

  const recipients = [new Recipient(email, "Your Client")];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setReplyTo(sentFrom)
    .setSubject("Verification code")
    .setHtml(
      `<strong>
     ${verificationCode}
    </strong>`
    )
    .setText("This is the text content");

  const response = await mailerSend.email.send(emailParams);
};

// module.exports = {
//   sendVerifyEmail,
// };

// import Mailgen from "mailgen";
// import nodemailer from "nodemailer";

const sendEmail = async (options) => {
  // Initialize mailgen instance with default theme and brand configuration
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "Quick Puff",
      link: "https://deliveryapptest.com",
    },
  });

  // Generate the plaintext version of the e-mail (for clients that do not support HTML)
  const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent);

  // Generate an HTML email with the provided contents
  const emailHtml = mailGenerator.generate(options.mailgenContent);

  // Create a nodemailer transporter instance which is responsible to send a mail
  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: process.env.MAILTRAP_SMTP_PORT,
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  });

  const mail = {
    from: "mail.delivery@gmail.com", // We can name this anything. The mail will go to your Mailtrap inbox
    to: options.email, // receiver's mail
    subject: options.subject, // mail subject
    text: emailTextual, // mailgen content textual variant
    html: emailHtml, // mailgen content html variant
  };

  try {
    await transporter.sendMail(mail);
  } catch (error) {
    // As sending email is not strongly coupled to the business logic it is not worth to raise an error when email sending fails
    // So it's better to fail silently rather than breaking the app
    console.log(
      "Email service failed silently. Make sure you have provided your MAILTRAP credentials in the .env file"
    );
    console.log("Error: ", error);
  }
};

const emailVerificationMailgenContent = (username, verificationUrl) => {
  return {
    body: {
      name: username,
      intro: "Welcome to our app! We're very excited to have you on board.",
      action: {
        instructions:
          "To verify your email please click on the following button:",
        button: {
          color: "#22BC66", // Optional action button color
          text: "Verify your email",
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
      intro: "Welcome to our app! We're very excited to have you on board.",
      action: {
        instructions:
          "Here is your login code:",
        button: {
          color: "#22BC66", // Optional action button color
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
  loginCodeMailgenContent
};
