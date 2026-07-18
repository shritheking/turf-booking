// Turf ground configuration and rates
const GROUND_CONFIG = {
  football: {
    title: 'Football Ground',
    icon: '⚽',
    options: [
      { id: 'full', label: '5v5 Full Ground', dayRate: 1200, nightRate: 1500 },
      { id: 'half', label: '5v5 Half Ground', dayRate: 700, nightRate: 900 }
    ]
  },
  cricket: {
    title: 'Cricket Pitch',
    icon: '🏏',
    options: [
      { id: 'full', label: 'Full Ground Match', dayRate: 1500, nightRate: 1800 }
    ]
  }
};

// Global App State
const state = {
  currentSport: 'football',
  currentGround: 'full',
  selectedDate: '',
  selectedSlotType: 'day', // 'day' or 'night'
  selectedSlots: [], // Array of hours (integers)
  bookings: [],      // Array of booking objects
  adminBlocks: [],   // Array of admin block objects {date, sport, ground, hour}
  
  // User Authentication State
  currentUser: null, // Current logged-in user details { name, email, phone }
  authEmail: ''      // Temporary email stored during registration flows
};

// Server Time (Synchronized via NTP)
let serverTime = new Date();

async function fetchServerTime() {
  try {
    const res = await fetch('/api/time');
    const data = await res.json();
    if (data.success) {
      serverTime = new Date(data.ntpTime);
      console.log('NTP Synchronized Server Time:', serverTime);
    }
  } catch (err) {
    console.error('Failed to sync NTP time:', err);
  }
}

// Sync local storage state with the backend server database
async function syncWithServer() {
  if (window.location.protocol === 'file:') return;

  try {
    const [bookingsRes, blocksRes] = await Promise.all([
      fetch('/api/bookings').then(r => r.json()),
      fetch('/api/blocks').then(r => r.json())
    ]);

    if (bookingsRes && bookingsRes.success && bookingsRes.bookings) {
      state.bookings = bookingsRes.bookings;
    }
    if (blocksRes && blocksRes.success && blocksRes.blocks) {
      state.adminBlocks = blocksRes.blocks;
    }

    saveLocalStorage();
  } catch (err) {
    console.error('Server synchronization failed. Using cached local storage data.', err);
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.protocol === 'file:') {
    setTimeout(() => {
      showToast('App loaded via file://. Please open http://localhost:8080 in your browser for login & booking to work.', 'error');
    }, 1000);
  }
  initScrollHeader();
  loadLocalStorage();
  await syncWithServer();
  await fetchServerTime();
  setDefaultDate();
  initBookingFilters();
  renderGroundSelectors();
  renderSlotsGrid();
  renderMyBookings();
  updateAuthNavUI();
});

// Scroll shadow for header
function initScrollHeader() {
  const header = document.getElementById('main-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      header.style.boxShadow = '0 1px 3px 0 rgba(60,64,67,0.15)';
    } else {
      header.style.boxShadow = 'none';
    }
  });
}

// Load from Local Storage
function loadLocalStorage() {
  const storedBookings = localStorage.getItem('gt_bookings');
  state.bookings = storedBookings ? JSON.parse(storedBookings) : [];

  const storedBlocks = localStorage.getItem('gt_blocks');
  state.adminBlocks = storedBlocks ? JSON.parse(storedBlocks) : [];

  const storedCurrentUser = localStorage.getItem('gt_current_user');
  state.currentUser = storedCurrentUser ? JSON.parse(storedCurrentUser) : null;
}

function saveLocalStorage() {
  localStorage.setItem('gt_bookings', JSON.stringify(state.bookings));
  localStorage.setItem('gt_blocks', JSON.stringify(state.adminBlocks));
  localStorage.setItem('gt_current_user', JSON.stringify(state.currentUser));
}

// Set target date to today by default
function setDefaultDate() {
  state.selectedDate = formatDateString(serverTime);
}

function formatDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Navigation switcher
function switchView(viewName) {
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`panel-${viewName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  document.querySelectorAll('#navbar a').forEach(link => {
    link.classList.remove('active');
  });

  const activeLink = document.getElementById(`nav-${viewName}`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  document.getElementById('navbar').classList.remove('active');

  // Show/Hide footer contact details depending on page view
  const footer = document.getElementById('footer-contact');
  if (footer) {
    if (viewName === 'book') {
      footer.style.display = 'none';
    } else {
      footer.style.display = 'block';
    }
  }

  // Trigger view-specific re-renders
  if (viewName === 'mybookings') {
    renderMyBookings();
  } else if (viewName === 'book') {
    state.selectedSlots = [];
    updateSummaryBar();
    renderSlotsGrid();
  }
}

function toggleMobileMenu() {
  const navbar = document.getElementById('navbar');
  navbar.classList.toggle('active');
}

// Render court configurations
function renderGroundSelectors() {
  const container = document.getElementById('ground-container');
  container.innerHTML = '';

  const sportConfig = GROUND_CONFIG[state.currentSport];
  sportConfig.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = `ground-btn ${opt.id === state.currentGround ? 'active' : ''}`;
    btn.innerText = opt.label;
    btn.onclick = () => selectGround(opt.id);
    container.appendChild(btn);
  });
}

function selectGround(groundId) {
  state.currentGround = groundId;
  state.selectedSlots = [];
  
  document.querySelectorAll('.ground-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  updateSummaryBar();
  renderSlotsGrid();
}

function setSport(sportName) {
  state.currentSport = sportName;
  state.currentGround = GROUND_CONFIG[sportName].options[0].id;
  state.selectedSlots = [];

  document.querySelectorAll('.sport-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.sport-btn[data-sport="${sportName}"]`).classList.add('active');

  const legendSelected = document.getElementById('legend-selected-color');
  const bookContainer = document.getElementById('panel-book');
  
  if (sportName === 'cricket') {
    legendSelected.style.backgroundColor = 'var(--google-blue)';
    bookContainer.className = 'view-panel active sport-cricket';
  } else {
    legendSelected.style.backgroundColor = 'var(--google-green)';
    bookContainer.className = 'view-panel active';
  }

  renderGroundSelectors();
  updateSummaryBar();
  renderSlotsGrid();
}

// Initialize filters values and min constraints
function initBookingFilters() {
  const dateInput = document.getElementById('booking-date');
  const typeSelect = document.getElementById('booking-slot-type');
  const monthSelect = document.getElementById('booking-month');

  // Configure Month calendar input (excluding current month!)
  if (monthSelect) {
    const current = new Date(serverTime);
    const nextMonthDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    const year = nextMonthDate.getFullYear();
    const monthNum = nextMonthDate.getMonth() + 1; // 1-indexed
    const nextMonthStr = `${year}-${String(monthNum).padStart(2, '0')}`;

    monthSelect.min = nextMonthStr;
    monthSelect.value = nextMonthStr;
    state.selectedMonth = nextMonthStr;
  }
  
  if (dateInput) {
    dateInput.value = state.selectedDate;
    dateInput.min = formatDateString(serverTime);
  }
  if (typeSelect) {
    typeSelect.value = state.selectedSlotType;
  }
  
  // Align DOM visibility on load
  changeBookingSlotType();
}

// Toggle date picker or month picker visibility depending on Slot Type selected
function changeBookingSlotType() {
  const typeSelect = document.getElementById('booking-slot-type');
  const dateGroup = document.getElementById('group-booking-date');
  const monthGroup = document.getElementById('group-booking-month');

  if (typeSelect) {
    state.selectedSlotType = typeSelect.value;
  }

  if (state.selectedSlotType === 'month') {
    if (dateGroup) dateGroup.style.display = 'none';
    if (monthGroup) monthGroup.style.display = 'block';
  } else {
    if (dateGroup) dateGroup.style.display = 'block';
    if (monthGroup) monthGroup.style.display = 'none';
  }

  changeBookingFilters();
}

// Update filter values and re-render slots
function changeBookingFilters() {
  const dateInput = document.getElementById('booking-date');
  const typeSelect = document.getElementById('booking-slot-type');
  const monthSelect = document.getElementById('booking-month');

  if (typeSelect) {
    state.selectedSlotType = typeSelect.value;
  }
  if (dateInput && dateInput.value) {
    state.selectedDate = dateInput.value;
  }
  if (monthSelect && monthSelect.value) {
    state.selectedMonth = monthSelect.value;
  }

  state.selectedSlots = [];
  updateSummaryBar();
  renderSlotsGrid();
}

// Dummy function to keep compatibility
function renderDateSlider() {}

function selectDate(dateStr, cardElement) {
  state.selectedDate = dateStr;
  state.selectedSlots = [];
  updateSummaryBar();
  renderSlotsGrid();
}

// Render slot timings
function renderSlotsGrid() {
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '';

  const sportConfig = GROUND_CONFIG[state.currentSport];
  const groundOption = sportConfig.options.find(o => o.id === state.currentGround);
  
  // Timing range: 5:00 AM to 11:00 PM (hourly blocks)
  const startHour = 5;
  const endHour = 22;

  const todayStr = formatDateString(serverTime);
  const currentHour = serverTime.getHours();

  for (let hour = startHour; hour <= endHour; hour++) {
    const slotTimeStr = formatSlotTime(hour);
    const rate = hour >= 18 ? groundOption.nightRate : groundOption.dayRate;

    const checkKey = state.selectedSlotType === 'month' ? state.selectedMonth : state.selectedDate;
    const isBlocked = checkSlotBlocked(checkKey, state.currentSport, state.currentGround, hour);
    const isBooked = checkSlotBooked(checkKey, state.currentSport, state.currentGround, hour);
    const isSelected = state.selectedSlots.includes(hour);

    let isPast = false;
    if (state.selectedSlotType === 'day') {
      if (state.selectedDate < todayStr) {
        isPast = true;
      } else if (state.selectedDate === todayStr && hour <= currentHour) {
        isPast = true;
      }
    }

    let statusClass = 'available';
    if (isBlocked) statusClass = 'blocked';
    else if (isBooked) statusClass = 'booked';
    else if (isPast) statusClass = 'blocked';
    else if (isSelected) statusClass = 'selected';

    const slotDiv = document.createElement('div');
    slotDiv.className = `slot ${statusClass}`;
    
    if (isPast) {
      slotDiv.innerHTML = `
        <div class="slot-time">${slotTimeStr}</div>
        <div class="slot-price" style="color:var(--text-secondary); font-size:11px;">Passed</div>
      `;
    } else {
      slotDiv.innerHTML = `
        <div class="slot-time">${slotTimeStr}</div>
        <div class="slot-price">₹${rate}</div>
      `;
    }

    if (!isPast && (statusClass === 'available' || statusClass === 'selected')) {
      slotDiv.onclick = () => toggleSlotSelection(hour, slotDiv);
    }

    grid.appendChild(slotDiv);
  }
}

function formatSlotTime(hour) {
  const start = hour > 12 ? hour - 12 : hour;
  const startAmPm = hour >= 12 ? 'PM' : 'AM';
  
  const endHour = hour + 1;
  const end = endHour > 12 ? endHour - 12 : endHour;
  const endAmPm = endHour >= 12 ? 'PM' : 'AM';

  return `${start} ${startAmPm} - ${end} ${endAmPm}`;
}

// Blocks check
function checkSlotBlocked(dateOrMonth, sport, ground, hour) {
  return state.adminBlocks.some(block => {
    const isSameGround = block.sport === sport && block.ground === ground;
    const isSameHour = parseInt(block.hour) === hour;
    if (!isSameGround || !isSameHour) return false;

    if (state.selectedSlotType === 'month') {
      // Monthly slot: blocked if any block exists in this month (starts with YYYY-MM)
      return block.date.startsWith(dateOrMonth);
    } else {
      // Daily slot: blocked if exact match, or a monthly block exists for this month
      const isMonthly = block.date.length <= 7 || block.date.includes('Whole Month');
      if (isMonthly) {
        return dateOrMonth.startsWith(block.date.substring(0, 7));
      } else {
        return block.date === dateOrMonth;
      }
    }
  });
}

// Bookings check
function checkSlotBooked(dateOrMonth, sport, ground, hour) {
  return state.bookings.some(booking => {
    const isSameGround = booking.sport === sport && booking.ground === ground;
    const hasHour = booking.slots.includes(hour) || booking.slots.includes(hour.toString()) || booking.slots.some(h => parseInt(h) === hour);
    const isConfirmed = booking.status === 'confirmed';
    if (!isSameGround || !hasHour || !isConfirmed) return false;

    if (state.selectedSlotType === 'month') {
      // Monthly slot: booked if any booking exists in this month
      return booking.date.startsWith(dateOrMonth);
    } else {
      // Daily slot: booked if exact match, or a monthly booking exists for this month
      const isMonthly = booking.date.length <= 7 || booking.date.includes('Whole Month');
      if (isMonthly) {
        return dateOrMonth.startsWith(booking.date.substring(0, 7));
      } else {
        return booking.date === dateOrMonth;
      }
    }
  });
}

function toggleSlotSelection(hour, slotElement) {
  const index = state.selectedSlots.indexOf(hour);
  if (index > -1) {
    state.selectedSlots.splice(index, 1);
    slotElement.classList.remove('selected');
    slotElement.classList.add('available');
  } else {
    state.selectedSlots.push(hour);
    slotElement.classList.remove('available');
    slotElement.classList.add('selected');
  }

  state.selectedSlots.sort((a, b) => a - b);
  updateSummaryBar();
}

// Update summary reservation values
function updateSummaryBar() {
  const summaryBar = document.getElementById('summary-bar');
  if (state.selectedSlots.length === 0) {
    summaryBar.style.display = 'none';
    return;
  }

  summaryBar.style.display = 'flex';

  const sportTitle = GROUND_CONFIG[state.currentSport].title;
  const groundLabel = GROUND_CONFIG[state.currentSport].options.find(o => o.id === state.currentGround).label;
  document.getElementById('summary-sport-desc').innerText = `${sportTitle} - ${groundLabel}`;

  const timings = state.selectedSlots.map(h => `${h > 12 ? h-12 : h} ${h>=12 ? 'PM':'AM'}`).join(', ');
  
  if (state.selectedSlotType === 'month') {
    const details = getSelectedMonthDetails();
    document.getElementById('summary-slots-desc').innerText = `${details.label} (${details.days} Days) | Selected: ${state.selectedSlots.length} hrs (${timings})`;
  } else {
    const dateFormatted = new Date(state.selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('summary-slots-desc').innerText = `${dateFormatted} | Selected: ${state.selectedSlots.length} hrs (${timings})`;
  }

  const subtotal = calculateSubtotal();
  document.getElementById('summary-price-amount').innerText = `₹${subtotal}`;
}

function getSelectedMonthDetails() {
  if (!state.selectedMonth) return { label: '', days: 1 };
  
  const [yearStr, monthStr] = state.selectedMonth.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr) - 1;
  
  const monthsNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const label = `${monthsNames[monthNum]} ${year}`;
  const days = new Date(year, monthNum + 1, 0).getDate();
  
  return { label, days, year, monthNum };
}

function calculateSubtotal() {
  const sportConfig = GROUND_CONFIG[state.currentSport];
  const groundOption = sportConfig.options.find(o => o.id === state.currentGround);
  
  const baseDayCost = state.selectedSlots.reduce((sum, hour) => {
    const rate = hour >= 18 ? groundOption.nightRate : groundOption.dayRate;
    return sum + rate;
  }, 0);

  if (state.selectedSlotType === 'month') {
    const details = getSelectedMonthDetails();
    return baseDayCost * details.days;
  }
  return baseDayCost;
}

// Modal actions
function openCheckoutModal() {
  if (!state.currentUser) {
    showToast('Please sign in to proceed with booking.', 'error');
    openAuthModal();
    return;
  }

  const modal = document.getElementById('checkout-modal');
  modal.style.display = 'flex';

  const sportConfig = GROUND_CONFIG[state.currentSport];
  const groundOption = sportConfig.options.find(o => o.id === state.currentGround);
  document.getElementById('checkout-summary-sport').innerText = `${sportConfig.title} (${groundOption.label})`;

  const timings = state.selectedSlots.map(h => `${h > 12 ? h-12 : h}:00 ${h>=12 ? 'PM':'AM'}`).join(', ');
  document.getElementById('checkout-summary-slots').innerText = `${timings} (${state.selectedSlots.length} hr${state.selectedSlots.length > 1 ? 's' : ''})`;

  if (state.selectedSlotType === 'month') {
    const details = getSelectedMonthDetails();
    document.getElementById('checkout-summary-date').innerText = `${details.label} (Whole Month - ${details.days} Days)`;
  } else {
    const dateFormatted = new Date(state.selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('checkout-summary-date').innerText = dateFormatted;
  }

  const subtotal = calculateSubtotal();
  const rawTotal = subtotal / 0.9764;
  const fee = rawTotal - subtotal;
  const total = rawTotal;

  document.getElementById('checkout-summary-subtotal').innerText = `₹${subtotal}`;
  document.getElementById('checkout-summary-tax').innerText = `₹${fee.toFixed(2)}`;
  document.getElementById('checkout-summary-total').innerText = `₹${total.toFixed(2)}`;

  // User Autofill Handling (They are guaranteed to be logged in here)
  const signinPrompt = document.getElementById('checkout-signin-prompt');
  const nameInput = document.getElementById('customer-name');
  const phoneInput = document.getElementById('customer-phone');
  const emailInput = document.getElementById('customer-email');

  signinPrompt.style.display = 'none';
  nameInput.value = state.currentUser.name;
  phoneInput.value = state.currentUser.phone;
  emailInput.value = state.currentUser.email;
  
  // Readonly properties to prevent mistakes
  nameInput.readOnly = true;
  phoneInput.readOnly = true;
  emailInput.readOnly = true;
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').style.display = 'none';
}

// USER AUTHENTICATION & MULTI-STEP MODAL VIEWS
function openAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  switchAuthStep('signin');
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthStep(step) {
  const title = document.getElementById('auth-modal-title');
  const steps = ['signin', 'signup', 'otp', 'forgot', 'reset'];
  
  steps.forEach(s => {
    document.getElementById(`auth-step-${s}`).style.display = 'none';
  });

  document.getElementById(`auth-step-${step}`).style.display = 'block';

  if (step === 'signin') {
    title.innerText = 'Sign in';
  } else if (step === 'signup') {
    title.innerText = 'Sign up';
  } else if (step === 'otp') {
    title.innerText = 'Verify Email OTP';
    // Clear code fields
    for (let i = 1; i <= 6; i++) {
      document.getElementById(`otp-${i}`).value = '';
    }
    document.getElementById('otp-1').focus();
  } else if (step === 'forgot') {
    title.innerText = 'Reset Password';
  } else if (step === 'reset') {
    title.innerText = 'Create New Password';
  }
}

function focusNextOtp(current, nextId) {
  if (current.value.length >= 1) {
    document.getElementById(nextId).focus();
  }
}

// 1. SIGN IN SUBMISSION
async function handleAuthSigninSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-signin-email').value.trim();
  const password = document.getElementById('auth-signin-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      saveLocalStorage();
      showToast(`Welcome back, ${data.user.name}!`);
      closeAuthModal();
      updateAuthNavUI();
      
      if (document.getElementById('checkout-modal').style.display === 'flex') {
        openCheckoutModal();
      }
    } else {
      if (data.unverified) {
        showToast('Your email is unverified. Verifying code...', 'error');
        state.authEmail = email;
        switchAuthStep('otp');
      } else {
        showToast(data.message || 'Incorrect credentials.', 'error');
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Sign-in error: ' + err.message, 'error');
  }
}

// 2. SIGN UP SUBMISSION
function handleAuthSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('auth-signup-name').value.trim();
  const email = document.getElementById('auth-signup-email').value.trim();
  const phone = document.getElementById('auth-signup-phone').value.trim();
  const password = document.getElementById('auth-signup-password').value;

  if (password.length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return;
  }

  // Set email session and immediately transition to the OTP step
  state.authEmail = email;
  switchAuthStep('otp');
  
  // Show active sending progress message in the OTP step
  const statusMsg = document.getElementById('otp-status-message');
  if (statusMsg) {
    statusMsg.innerText = `Sending 6-digit verification code to ${email}...`;
    statusMsg.style.color = 'var(--google-blue)';
  }

  // Trigger registration request in background
  fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (statusMsg) {
        statusMsg.innerText = `Code sent! Check your email.`;
        statusMsg.style.color = 'var(--google-green)';
      }
      showToast('Verification code successfully sent.');
    } else {
      if (statusMsg) {
        statusMsg.innerText = `Failed to send code: ${data.message || 'Error'}`;
        statusMsg.style.color = 'var(--google-red)';
      }
      showToast(data.message || 'Registration failed.', 'error');
    }
  })
  .catch(err => {
    console.error(err);
    if (statusMsg) {
      statusMsg.innerText = `Error sending code: ${err.message}`;
      statusMsg.style.color = 'var(--google-red)';
    }
    showToast('Registration error: ' + err.message, 'error');
  });
}

// 3. OTP CODE SUBMISSION
async function handleAuthOtpSubmit(e) {
  e.preventDefault();
  const codes = [];
  for (let i = 1; i <= 6; i++) {
    codes.push(document.getElementById(`otp-${i}`).value);
  }
  const otpCode = codes.join('');

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.authEmail, otp: otpCode })
    });

    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      saveLocalStorage();
      showToast(`Welcome, ${data.user.name}! Your account is verified and logged in.`);
      closeAuthModal();
      updateAuthNavUI();

      if (document.getElementById('checkout-modal').style.display === 'flex') {
        openCheckoutModal();
      }
    } else {
      showToast(data.message || 'Incorrect verification code.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Verification error: ' + err.message, 'error');
  }
}

// Resend Verification OTP
async function resendEmailOtp() {
  if (!state.authEmail) {
    showToast('No active verification email session found.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.authEmail })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Verification code resent! ' + (data.fallbackNotice || 'Check your Gmail.'));
      switchAuthStep('otp');
    } else {
      showToast(data.message || 'Failed to resend verification OTP.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('OTP resend error: ' + err.message, 'error');
  }
}

// 4. FORGOT PASSWORD SUBMISSION
function handleAuthForgotSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-forgot-email').value.trim();

  // Set email session and immediately transition to the reset password input view
  state.authEmail = email;
  document.getElementById('auth-reset-email').value = email;
  switchAuthStep('reset');

  // Show active sending progress message in the reset password step
  const statusMsg = document.getElementById('reset-status-message');
  if (statusMsg) {
    statusMsg.innerText = `Sending 6-digit password reset code to ${email}...`;
    statusMsg.style.color = 'var(--google-blue)';
  }

  // Trigger forgot password request in background
  fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (statusMsg) {
        statusMsg.innerText = `Reset code successfully sent! Check your inbox.`;
        statusMsg.style.color = 'var(--google-green)';
      }
      showToast('Password reset code successfully sent.');
    } else {
      if (statusMsg) {
        statusMsg.innerText = `Failed to send reset code: ${data.message || 'Error'}`;
        statusMsg.style.color = 'var(--google-red)';
      }
      showToast(data.message || 'Reset request failed.', 'error');
    }
  })
  .catch(err => {
    console.error(err);
    if (statusMsg) {
      statusMsg.innerText = `Error sending reset code: ${err.message}`;
      statusMsg.style.color = 'var(--google-red)';
    }
    showToast('Reset request error: ' + err.message, 'error');
  });
}

// 5. RESET PASSWORD SUBMISSION
async function handleAuthResetSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-reset-email').value;
  const code = document.getElementById('auth-reset-code').value.trim();
  const newPassword = document.getElementById('auth-reset-password').value;

  if (newPassword.length < 4) {
    showToast('Password must be at least 4 characters.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Password updated! Please login with your new password.');
      switchAuthStep('signin');
      document.getElementById('auth-signin-email').value = email;
      document.getElementById('auth-signin-password').focus();
    } else {
      showToast(data.message || 'Incorrect password reset code.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Password reset error: ' + err.message, 'error');
  }
}

// Update user session button inside header
function updateAuthNavUI() {
  const loginLink = document.getElementById('nav-login');
  const profileMenu = document.getElementById('header-user-profile');
  const dropdown = document.getElementById('profile-dropdown');
  
  if (state.currentUser) {
    if (loginLink) loginLink.style.display = 'none';
    if (profileMenu) profileMenu.style.display = 'block';
    
    const initial = state.currentUser.name ? state.currentUser.name.charAt(0).toUpperCase() : 'U';
    document.getElementById('user-avatar').innerText = initial;
    document.getElementById('dropdown-avatar').innerText = initial;
    
    document.getElementById('dropdown-user-name').innerText = state.currentUser.name;
    document.getElementById('dropdown-user-email').innerText = state.currentUser.email;
  } else {
    if (loginLink) loginLink.style.display = 'inline-block';
    if (profileMenu) profileMenu.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';
  }
}

function toggleProfileDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('profile-dropdown');
  const isVisible = dropdown.style.display === 'block';
  dropdown.style.display = isVisible ? 'none' : 'block';
}

function handleUserLogout(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  if (confirm('Sign out of your active user account?')) {
    state.currentUser = null;
    saveLocalStorage();
    showToast('Signed out successfully.');
    updateAuthNavUI();
    
    // Clear checkout inputs if modal is open
    if (document.getElementById('checkout-modal').style.display === 'flex') {
      openCheckoutModal();
    }
  }
}

// Close dropdown on clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('profile-dropdown');
  const avatar = document.getElementById('user-avatar');
  if (dropdown && dropdown.style.display === 'block') {
    if (!dropdown.contains(e.target) && e.target !== avatar) {
      dropdown.style.display = 'none';
    }
  }
});

// Trigger payment via real Razorpay API loaded from .env
function triggerPayment(e) {
  e.preventDefault();

  // Validate authentication before authorizing checkout
  if (!state.currentUser) {
    showToast('Please sign in or register to complete slot reservation.', 'error');
    openAuthModal();
    return;
  }

  // Load key from .env served by env.js
  const rzpKeyId = window.ENV ? window.ENV.RAZORPAY_KEY_ID : '';

  if (!rzpKeyId || rzpKeyId.includes('YOUR_KEY_HERE') || rzpKeyId === '') {
    showToast('Razorpay Gateway is not configured. Please add RAZORPAY_KEY_ID inside your server .env file.', 'error');
    closeCheckoutModal();
    return;
  }

  const name = document.getElementById('customer-name').value;
  const phone = document.getElementById('customer-phone').value;
  const email = document.getElementById('customer-email').value;

  const subtotal = calculateSubtotal();
  const total = Math.round((subtotal / 0.9764) * 100) / 100;

  const sportTitle = GROUND_CONFIG[state.currentSport].title;
  const groundLabel = GROUND_CONFIG[state.currentSport].options.find(o => o.id === state.currentGround).label;

  // Razorpay Checkout Options
  const options = {
    "key": rzpKeyId,
    "amount": Math.round(total * 100), // amount in paise
    "currency": "INR",
    "name": "GOAT Turf Madurai",
    "description": `${sportTitle} - ${groundLabel} Slot Booking`,
    "image": "assets/images/logo.jpg",
    "handler": function (response) {
      // Payment succeeded callback
      completeRealPayment(response.razorpay_payment_id, name, phone, email);
    },
    "prefill": {
      "name": name,
      "email": email,
      "contact": phone
    },
    "notes": {
      "sport": state.currentSport,
      "ground": state.currentGround,
      "date": state.selectedSlotType === 'month' ? `${state.selectedMonth} (Whole Month)` : state.selectedDate,
      "slots": state.selectedSlots.join(',')
    },
    "theme": {
      "color": state.currentSport === 'cricket' ? "#1a73e8" : "#1e8e3e"
    }
  };

  try {
    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      showToast("Payment Failed: " + response.error.description, 'error');
    });
    rzp.open();
    closeCheckoutModal();
  } catch (err) {
    console.error(err);
    showToast("Could not load Razorpay sandbox gateway.", "error");
  }
}

// Success payment callback integration
function completeRealPayment(paymentId, name, phone, email) {
  const subtotal = calculateSubtotal();
  const total = Math.round((subtotal / 0.9764) * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100; // Convenience fee saved as tax/fee column

  const bookingId = 'GT' + Math.floor(100000 + Math.random() * 900000);

  const newBooking = {
    id: bookingId,
    paymentId: paymentId,
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    sport: state.currentSport,
    ground: state.currentGround,
    date: state.selectedSlotType === 'month' ? `${state.selectedMonth} (Whole Month)` : state.selectedDate,
    slots: [...state.selectedSlots],
    subtotal: subtotal,
    tax: tax,
    total: total,
    status: 'confirmed',
    timestamp: new Date().toISOString()
  };

  state.bookings.push(newBooking);
  saveLocalStorage();

  // Post booking to backend server database
  if (window.location.protocol !== 'file:') {
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking)
    }).catch(err => console.error('Failed to post booking to server:', err));
  }

  showToast(`Confirmed! Booking #${bookingId}`);
  
  state.selectedSlots = [];
  updateSummaryBar();
  renderSlotsGrid();

  document.getElementById('checkout-form').reset();
  switchView('mybookings');
}

// SnackBar style Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  if (type === 'error') {
    toast.style.backgroundColor = 'var(--google-red)';
  }
  
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s forwards cubic-bezier(0.4, 0.0, 1, 1)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Inject toast animation out rules
const styleSheet = document.createElement('style');
styleSheet.innerText = `
  @keyframes toastOut {
    to { transform: translateY(100px); opacity: 0; }
  }
`;
document.head.appendChild(styleSheet);

// User Booking list renderer (Refund is not allowed)
function renderMyBookings() {
  const container = document.getElementById('my-bookings-list');
  const emptyState = document.getElementById('bookings-empty-state');
  
  container.innerHTML = '';
  
  // Filter bookings to show only those belonging to the logged-in user if they are logged in.
  // If not logged in, show none (they must sign in to review history).
  let userBookings = [];
  if (state.currentUser) {
    userBookings = state.bookings.filter(b => b.customerEmail.toLowerCase() === state.currentUser.email.toLowerCase());
  }

  const sortedBookings = [...userBookings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (sortedBookings.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    
    if (!state.currentUser) {
      emptyState.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
        </svg>
        <h3 style="font-weight: 500;">Sign in to view bookings</h3>
        <p style="margin-top: 6px; font-size: 14px;">Please authenticate your account to inspect historical bookings.</p>
        <button class="btn-primary" style="margin-top: 16px; font-size: 13px;" onclick="openAuthModal()">Sign In Now</button>
      `;
    } else {
      emptyState.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <h3 style="font-weight: 500;">No active bookings</h3>
        <p style="margin-top: 6px; font-size: 14px;">You haven't reserved any turf slots yet.</p>
        <button class="btn-primary" style="margin-top: 16px; font-size: 13px;" onclick="switchView('book')">Reserve a Slot</button>
      `;
    }
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';

  sortedBookings.forEach(booking => {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    
    const sportName = GROUND_CONFIG[booking.sport].title;
    const groundLabel = GROUND_CONFIG[booking.sport].options.find(o => o.id === booking.ground).label;
    
    let dateFormatted;
    if (booking.date.includes('(Whole Month)')) {
      dateFormatted = booking.date;
    } else {
      const parsedDate = new Date(booking.date);
      dateFormatted = isNaN(parsedDate.getTime()) ? booking.date : parsedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    const times = booking.slots.map(h => `${h > 12 ? h-12 : h}:00 ${h>=12 ? 'PM':'AM'}`).join(', ');

    card.innerHTML = `
      <div class="ticket-header ${booking.sport}">
        <div class="ticket-sport-badge">${sportName}</div>
        <div class="ticket-status ${booking.status}">${booking.status}</div>
      </div>
      
      <div class="ticket-body">
        <div class="ticket-row">
          <div class="ticket-col">
            <div class="ticket-label">Match Date</div>
            <div class="ticket-val">${dateFormatted}</div>
          </div>
          <div class="ticket-col">
            <div class="ticket-label">Court Configuration</div>
            <div class="ticket-val">${groundLabel}</div>
          </div>
        </div>
        
        <div class="ticket-row" style="margin-bottom: 0;">
          <div class="ticket-col">
            <div class="ticket-label">Schedule Hours</div>
            <div class="ticket-val" style="font-size:13px; font-weight:400; color:var(--text-secondary);">${times} (${booking.slots.length} hr${booking.slots.length > 1 ? 's' : ''})</div>
          </div>
        </div>
      </div>
      
      <div class="ticket-footer">
        <div>
          <div class="ticket-price-lbl">Transaction Total</div>
          <div class="ticket-price-val">₹${booking.total}</div>
        </div>
        
        <!-- Cancel Ticket buttons are hidden because Refund is not allowed -->
        <span style="font-size: 11px; color: var(--google-red); font-weight: 500; text-transform: uppercase;">No Refunds</span>
      </div>
    `;

    container.appendChild(card);
  });
}

// Dynamic tab synchronization listener
window.addEventListener('storage', (e) => {
  if (e.key === 'gt_bookings' || e.key === 'gt_blocks') {
    loadLocalStorage();
    renderSlotsGrid();
    renderMyBookings();
  }
});
