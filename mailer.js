const nodemailer = require("nodemailer");

function hasMailConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.MAIL_FROM
  );
}

function createTransporter() {
  if (!hasMailConfig()) {
    const error = new Error("El servicio de correo no esta configurado.");
    error.status = 503;
    throw error;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

async function sendPasswordResetEmail({ to, nombre, resetUrl }) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Restablecer contrasenia de TODOs",
    text: [
      `Hola ${nombre},`,
      "",
      "Recibimos una solicitud para restablecer tu contrasenia.",
      `Usa este enlace dentro de 15 minutos: ${resetUrl}`,
      "",
      "Si no solicitaste este cambio, puedes ignorar este correo."
    ].join("\n"),
    html: `
      <p>Hola ${nombre},</p>
      <p>Recibimos una solicitud para restablecer tu contrasenia.</p>
      <p><a href="${resetUrl}">Restablecer contrasenia</a></p>
      <p>Este enlace expira en 15 minutos. Si no solicitaste este cambio, ignora este correo.</p>
    `
  });
}

async function sendEmailVerificationEmail({ to, nombre, verificationUrl }) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Confirma tu correo de TODOs",
    text: [
      `Hola ${nombre},`,
      "",
      "Gracias por crear tu cuenta en TODOs.",
      `Confirma tu correo dentro de 24 horas: ${verificationUrl}`,
      "",
      "Si no creaste esta cuenta, puedes ignorar este correo."
    ].join("\n"),
    html: `
      <p>Hola ${nombre},</p>
      <p>Gracias por crear tu cuenta en TODOs.</p>
      <p><a href="${verificationUrl}">Confirmar mi correo</a></p>
      <p>Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo.</p>
    `
  });
}

module.exports = {
  hasMailConfig,
  sendEmailVerificationEmail,
  sendPasswordResetEmail
};
