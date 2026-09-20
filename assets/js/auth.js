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

      setAlert('', 'none');
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

        setAlert('Login successful! Redirecting to dashboard...', 'success');
        if (typeof API !== 'undefined' && API.showToast) {
          API.showToast('Login successful!', 'success');
        }

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } catch (err) {
        setAlert(err.message, 'error');
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

      setAlert('', 'none');

      if (password !== confirmPassword) {
        setAlert('Passwords do not match.', 'error');
        return;
      }

      if (password.length < 8) {
        setAlert('Password must be at least 8 characters long.', 'error');
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

        let msg = `<strong>Account created successfully!</strong><br>We sent a verification email to <strong>${email}</strong>.<br>Please check your inbox or spam folder.`;
        if (res.data && res.data.verification_url) {
          msg += `<div style="margin-top: 14px; padding: 12px; background: rgba(34, 197, 94, 0.12); border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.25);">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #15803D;">Testing or email delayed?</div>
            <a href="${res.data.verification_url}" class="btn-auth-primary" style="display:inline-flex; width: auto; height: 38px; padding: 0 16px; font-size: 13px; text-decoration: none; border-radius: 6px; background: #16A34A;">
              <i class="fa-solid fa-circle-check" style="margin-right: 6px;"></i> Click to Verify &amp; Activate Now
            </a>
          </div>`;
        }
        setAlert(msg, 'success', true);
        if (btn) btn.textContent = 'Account Created!';
      } catch (err) {
        setAlert(err.message, 'error');
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

      setAlert('', 'none');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending reset link...';
      }

      try {
        const res = await API.request('/auth/forgot-password.php', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        setAlert(res.message || 'Password reset link sent to your email.', 'success');
      } catch (err) {
        setAlert(err.message, 'error');
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

      setAlert('', 'none');

      if (!token) {
        setAlert('Invalid or missing password reset token.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        setAlert('Passwords do not match.', 'error');
        return;
      }

      if (password.length < 8) {
        setAlert('Password must be at least 8 characters long.', 'error');
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
        setAlert(res.message || 'Password successfully reset! Redirecting to login...', 'success');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1200);
      } catch (err) {
        setAlert(err.message, 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Update Password';
        }
      }
    });
  }
});

function setAlert(msg, type, isHtml = false) {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;

  if (type === 'none' || !msg) {
    alertBox.style.display = 'none';
    return;
  }

  alertBox.className = `alert-box alert-${type}`;
  if (isHtml) {
    alertBox.innerHTML = msg;
  } else {
    alertBox.textContent = msg;
  }
  alertBox.style.display = 'block';
}
