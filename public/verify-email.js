const title = document.querySelector("#verifyTitle");
const message = document.querySelector("#verifyMessage");
const alertBox = document.querySelector("#verifyAlert");
const token = new URLSearchParams(window.location.search).get("token");

function showResult(nextTitle, nextMessage, type) {
  title.textContent = nextTitle;
  message.textContent = nextMessage;
  alertBox.textContent = nextMessage;
  alertBox.className = `login-alert show ${type}`;
}

async function verifyEmail() {
  if (!token) {
    showResult("Enlace invalido", "El enlace de confirmacion no contiene un token.", "error");
    return;
  }

  try {
    const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo confirmar el correo.");
    showResult("Correo confirmado", payload.message, "success");
  } catch (error) {
    showResult("No se pudo confirmar", error.message, "error");
  }
}

verifyEmail();
