const form = document.querySelector("#registerForm");
const nameInput = document.querySelector("#registerName");
const emailInput = document.querySelector("#registerEmail");
const passwordInput = document.querySelector("#registerPassword");
const confirmationInput = document.querySelector("#registerPasswordConfirmation");
const alertBox = document.querySelector("#registerAlert");

function showMessage(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = `login-alert show ${type}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (passwordInput.value !== confirmationInput.value) {
    showMessage("Las contrasenias no coinciden.");
    return;
  }

  showMessage("Creando cuenta...", "info");

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo crear la cuenta.");

    showMessage("Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesion.", "success");
    window.setTimeout(() => {
      window.location.href = "/login.html";
    }, 2200);
  } catch (error) {
    showMessage(error.message);
  }
});
