const form = document.querySelector("#resetPasswordForm");
const passwordInput = document.querySelector("#resetPassword");
const confirmationInput = document.querySelector("#resetPasswordConfirmation");
const alertBox = document.querySelector("#resetAlert");
const token = new URLSearchParams(window.location.search).get("token");

function showMessage(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = `login-alert show ${type}`;
}

if (!token) showMessage("El enlace de recuperacion no es valido.");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!token) return;
  if (passwordInput.value !== confirmationInput.value) {
    showMessage("Las contrasenias no coinciden.");
    return;
  }

  showMessage("Guardando...", "info");

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: passwordInput.value })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "El enlace no es valido o ya expiro.");
    }

    showMessage("Contrasena actualizada. Ya puedes iniciar sesion.", "success");
    form.reset();
    window.setTimeout(() => {
      window.location.href = "/login.html";
    }, 1200);
  } catch (error) {
    showMessage(error.message);
  }
});
