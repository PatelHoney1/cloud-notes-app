// Login, signup and password reset handlers.
// Each setup function is a no-op unless its page's button is present.

// Where a signed-in user lands. The classic wide layout is still reachable
// from Settings -> Classic view.
const AFTER_AUTH = "home.html";

// Firebase error codes are not written for end users, so the common ones get
// a plain-English equivalent and anything unmapped falls back to the original.
const AUTH_MESSAGES = {
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Incorrect password. Try again.",
  "auth/invalid-credential": "Those details don't match an account.",
  "auth/invalid-login-credentials": "Those details don't match an account.",
  "auth/email-already-in-use": "An account already exists with that email.",
  "auth/weak-password": "Please choose a password of at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "Network problem — check your connection."
};

function authMessage(error) {
  return AUTH_MESSAGES[error.code] || error.message;
}

// ========== LOGIN PAGE (index.html) ==========
function setupLoginPage() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const msg = document.getElementById("msg");

  if (!loginBtn) return;

  async function submit() {
    msg.textContent = "";
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      msg.textContent = "Enter your email and password.";
      return;
    }

    loginBtn.disabled = true;
    const original = loginBtn.textContent;
    loginBtn.textContent = "Signing in...";

    try {
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = AFTER_AUTH;
    } catch (error) {
      msg.textContent = authMessage(error);
      loginBtn.disabled = false;
      loginBtn.textContent = original;
    }
  }

  loginBtn.addEventListener("click", submit);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

// ========== SIGNUP PAGE (signup.html) ==========
function setupSignupPage() {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const signupBtn = document.getElementById("signupBtn");
  const msg = document.getElementById("msg");

  if (!signupBtn) return;

  async function submit() {
    msg.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!email || !password) {
      msg.textContent = "Enter an email and password.";
      return;
    }

    if (password !== confirmPassword) {
      msg.textContent = "Passwords do not match.";
      return;
    }

    signupBtn.disabled = true;
    const original = signupBtn.textContent;
    signupBtn.textContent = "Creating account...";

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);

      // Lookup record so notes can later be shared by email address.
      await db.collection("users").doc(cred.user.uid).set({
        uid: cred.user.uid,
        email: cred.user.email
      });

      window.location.href = AFTER_AUTH;
    } catch (error) {
      msg.textContent = authMessage(error);
      signupBtn.disabled = false;
      signupBtn.textContent = original;
    }
  }

  signupBtn.addEventListener("click", submit);
  confirmPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

// ========== FORGOT PASSWORD (forgot-password.html) ==========
function setupForgotPasswordPage() {
  const emailInput = document.getElementById("email");
  const resetBtn = document.getElementById("resetBtn");
  const msg = document.getElementById("msg");

  if (!resetBtn) return;

  async function submit() {
    const email = emailInput.value.trim();
    msg.className = "small mt-3";
    msg.textContent = "";

    if (!email) {
      msg.classList.add("text-danger");
      msg.textContent = "Enter the email address for your account.";
      return;
    }

    resetBtn.disabled = true;
    resetBtn.textContent = "Sending...";

    try {
      await auth.sendPasswordResetEmail(email);
      msg.classList.add("text-success");
      msg.textContent =
        "Check your inbox — if an account exists for " + email +
        ", a reset link is on its way.";
      emailInput.value = "";
    } catch (error) {
      // Deliberately not distinguishing "no such user" here: confirming which
      // addresses have accounts would leak the user list to anyone asking.
      if (error.code === "auth/user-not-found") {
        msg.classList.add("text-success");
        msg.textContent =
          "Check your inbox — if an account exists for that address, a reset " +
          "link is on its way.";
      } else {
        msg.classList.add("text-danger");
        msg.textContent = authMessage(error);
      }
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = "Send reset link";
    }
  }

  resetBtn.addEventListener("click", submit);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}
