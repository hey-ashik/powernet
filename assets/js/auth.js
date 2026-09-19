/**
 * PowerNet Authentication Controller
 * Manages Login, Registration, Password Reset, and Session routing
 */

document.addEventListener('DOMContentLoaded', () => {
  // Check active form on the page
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formForgot = document.getElementById('form-forgot');
  const formReset = document.getElementById('form-reset');

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const btn = formLogin.querySelector('button[type="submit"]');

      setAlert('', 'none');
      btn.disabled = true;
      btn.textContent = 'Authenticating...';

      try {
        const res = await API.request('/auth/login.php', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (res.data && res.data.token) {
          API.setToken(res.data.token);
          API.setUser(res.data.user);
        }

        setAlert('Login successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 600);
      } catch (err) {
        setAlert(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    });
  }

  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      const btn = formRegister.querySelector('button[type="submit"]');

      setAlert('', 'none');

      if (password !== confirmPassword) {
        setAlert('Passwords do not match.', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creating account...';

      try {
        const res = await API.request('/auth/register.php', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password,
            confirm_password: confirmPassword
          })
        });

        let msg = `<strong>Account created successfully!</strong><br>We sent a verification email to <strong>${email}</strong>.<br>Please check your inbox or spam folder.`;
        if (res.data && res.data.verification_url) {
          msg += `<div style="margin-top: 14px; padding: 12px; background: rgba(34, 197, 94, 0.15); border-radius: 10px; border: 1px solid rgba(34, 197, 94, 0.3);">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #15803D;">Testing or email delayed?</div>
            <a href="${res.data.verification_url}" class="btn-primary-block" style="display:inline-block; padding: 8px 16px; font-size: 13.5px; text-decoration: none; border-radius: 8px; background: #16A34A; color: white;">
              <i class="fa-solid fa-circle-check" style="margin-right: 6px;"></i> Click to Verify & Activate Now
            </a>
          </div>`;
        }
        setAlert(msg, 'success', true);
        btn.textContent = 'Account Created!';
      } catch (err) {
        setAlert(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }

    });
  }

  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const btn = formForgot.querySelector('button[type="submit"]');

      setAlert('', 'none');
      btn.disabled = true;
      btn.textContent = 'Sending reset link...';

      try {
        const res = await API.request('/auth/forgot-password.php', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        setAlert(res.message || 'Password reset link sent to your email.', 'success');
      } catch (err) {
        setAlert(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    });
  }

  if (formReset) {
    formReset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || '';
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      const btn = formReset.querySelector('button[type="submit"]');

      setAlert('', 'none');

      if (!token) {
        setAlert('Invalid or missing password reset token.', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating password...';

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
        btn.disabled = false;
        btn.textContent = 'Set New Password';
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
