// ========== LOGIN PAGE (index.html) ==========
function setupLoginPage() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const msg = document.getElementById("msg");

  if (!loginBtn) return;

  loginBtn.addEventListener("click", async () => {
    msg.textContent = "";
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "notes.html";
    } catch (error) {
      msg.textContent = error.message;
    }
  });
}

// ========== SIGNUP PAGE (signup.html) ==========
function setupSignupPage() {
  const emailInput           = document.getElementById("email");
  const passwordInput        = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const signupBtn             = document.getElementById("signupBtn");
  const msg                   = document.getElementById("msg");

  if (!signupBtn) return;

  signupBtn.addEventListener("click", async () => {
    msg.style.color = "red";
    msg.textContent = "";

    const email           = emailInput.value.trim();
    const password         = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
      msg.textContent = "Passwords do not match.";
      return;
    }

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);

      // Lookup record so notes can later be shared by email
      await db.collection("users").doc(cred.user.uid).set({
        uid: cred.user.uid,
        email: cred.user.email
      });

      window.location.href = "notes.html";
    } catch (error) {
      msg.textContent = error.message;
    }
  });
}
