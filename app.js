// ========== Plan & Pricing ==========
let currentPlan = 'free';

async function fetchUserPlan() {
  try {
    const res = await authFetch(`${apiBaseUrl}/user-plan`);
    if (res.ok) {
      const data = await res.json();
      currentPlan = data.plan;
      updateUIBasedOnPlan();
    }
  } catch (err) { console.error(err); }
}

function updateUIBasedOnPlan() {
  // Example: hide/show pro features
  const proElements = document.querySelectorAll('.pro-feature');
  proElements.forEach(el => {
    if (currentPlan === 'pro' || currentPlan === 'premium') {
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });
  // Update pricing page buttons
  const freeBtn = document.getElementById('free-plan');
  const proBtn = document.getElementById('pro-plan');
  if (freeBtn) {
    if (currentPlan === 'free') freeBtn.textContent = 'Current Plan';
    else freeBtn.textContent = 'Downgrade (not implemented)';
  }
  if (proBtn) {
    if (currentPlan === 'pro') proBtn.textContent = 'Current Plan';
    else proBtn.textContent = 'Upgrade to Pro';
  }
}

// Call after login
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ... existing code ...
    fetchUserPlan(); // after token set
  }
});

// Handle upgrade button
document.addEventListener('click', async (e) => {
  if (e.target.id === 'pro-plan' && e.target.textContent !== 'Current Plan') {
    try {
      const res = await authFetch(`${apiBaseUrl}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_1R0GbpIXqpnCRRNU8G8M7E2S', planName: 'pro' }) // replace with your actual price ID
      });
      const { url } = await res.json();
      window.location.href = url; // redirect to Stripe Checkout
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
});

// Handle payment success page
if (window.location.pathname.includes('payment-success')) {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  if (sessionId) {
    // Optionally verify with backend, but webhook will handle it
    setTimeout(() => {
      showView('dashboard');
      fetchUserPlan();
    }, 3000);
  }
}
