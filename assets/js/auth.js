/**
 * PowerNet Authentication Controller
 * Manages Login, Registration, Password Reset, and Session routing
 * Preserves 100% backend API continuity & local storage state
 */

document.addEventListener('DOMContentLoaded', () => {
  // Check active forms on the page
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formForgot = document.getElementById('form-forgot');
  const formReset = document.getElementById('form-reset');

  // Helper for notification toasts
  const notify = (msg, type = 'info') => {
    if (typeof API !== 'undefined' && API.showToast) {
      API.showToast(msg, type);
    }
  };

  // Check URL query parameters on page load for automated toast feedback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verified') === '1') {
    notify('Email verified successfully! You can now sign in.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('registered') === '1') {
    notify('Account created! Please check your email inbox to verify.', 'info');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('reset') === '1') {
    notify('Password reset successfully! Please log in with your new password.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Password visibility eye toggles
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const icon = btn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
          icon.className = 'fa-regular fa-eye-slash';
        }
      } else {
        input.type = 'password';
        if (icon) {
          icon.className = 'fa-regular fa-eye';
        }
      }
    });
  });

  // 1. Sign In
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const btn = formLogin.querySelector('button[type="submit"]');

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Authenticating...';
      }

      try {
        const res = await API.request('/auth/login.php', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (res.data && res.data.token) {
          API.setToken(res.data.token);
          API.setUser(res.data.user);
        }

        notify('Login successful! Redirecting to dashboard...', 'success');

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } catch (err) {
        notify(err.message || 'Login failed. Please check credentials.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      }
    });
  }

  // 2. Sign Up (Register)
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fnameInput = document.getElementById('fname');
      const lnameInput = document.getElementById('lname');
      const nameInput = document.getElementById('name');
      
      let name = '';
      if (nameInput) {
        name = nameInput.value.trim();
      } else if (fnameInput || lnameInput) {
        const fname = fnameInput ? fnameInput.value.trim() : '';
        const lname = lnameInput ? lnameInput.value.trim() : '';
        name = `${fname} ${lname}`.trim();
      }

      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const confirmPasswordInput = document.getElementById('confirm_password');

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
      const btn = formRegister.querySelector('button[type="submit"]');

      if (password !== confirmPassword) {
        notify('Passwords do not match.', 'error');
        return;
      }

      if (password.length < 8) {
        notify('Password must be at least 8 characters long.', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creating account...';
      }

      try {
        const res = await API.request('/auth/register.php', {
          method: 'POST',
          body: JSON.stringify({
            name: name || 'PowerNet User',
            email,
            password,
            confirm_password: confirmPassword
          })
        });

        notify('Account created! Verification email sent to your inbox.', 'success');
        if (btn) {
          btn.textContent = 'Account Created!';
        }

        setTimeout(() => {
          window.location.href = '/login?registered=1';
        }, 1500);
      } catch (err) {
        notify(err.message || 'Registration failed. Please try again.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign Up';
        }
      }
    });
  }

  // 3. Forgot Password
  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const email = emailInput ? emailInput.value.trim() : '';
      const btn = formForgot.querySelector('button[type="submit"]');

      if (!email) {
        notify('Please enter your registered email address.', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending reset link...';
      }

      try {
        const res = await API.request('/auth/forgot-password.php', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        notify(res.message || 'Password reset link sent to your email. Please check your inbox.', 'success');
      } catch (err) {
        notify(err.message || 'Unable to process request. Please try again.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send Reset Link';
        }
      }
    });
  }

  // 4. Reset Password
  if (formReset) {
    formReset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || '';
      const passwordInput = document.getElementById('password');
      const confirmPasswordInput = document.getElementById('confirm_password');
      const password = passwordInput ? passwordInput.value : '';
      const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
      const btn = formReset.querySelector('button[type="submit"]');

      if (!token) {
        notify('Invalid or missing password reset token in link.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        notify('Passwords do not match.', 'error');
        return;
      }

      if (password.length < 8) {
        notify('Password must be at least 8 characters long.', 'error');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Updating password...';
      }

      try {
        const res = await API.request('/auth/reset-password.php', {
          method: 'POST',
          body: JSON.stringify({
            token,
            password,
            confirm_password: confirmPassword
          })
        });
        notify(res.message || 'Password reset successfully! Redirecting to login...', 'success');
        setTimeout(() => {
          window.location.href = '/login?reset=1';
        }, 1200);
      } catch (err) {
        notify(err.message || 'Password reset failed. Link may have expired.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Update Password';
        }
      }
    });
  }
});

function setAlert(msg, type, isHtml = false) {
  // Legacy fallback safely redirects to API.showToast without showing green box
  if (type && type !== 'none' && msg) {
    const textOnly = isHtml ? msg.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : msg;
    if (typeof API !== 'undefined' && API.showToast) {
      API.showToast(textOnly, type === 'error' ? 'error' : 'success');
    }
  }
  const alertBox = document.getElementById('alert-box');
  if (alertBox) {
    alertBox.style.display = 'none';
  }
}
