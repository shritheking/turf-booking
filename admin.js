// Turf ground configuration for admin display
const GROUND_CONFIG = {
  football: {
    title: 'Football Ground',
    options: [
      { id: 'full', label: '5v5 Full Ground' },
      { id: 'half', label: '5v5 Half Ground' }
    ]
  },
  cricket: {
    title: 'Cricket Pitch',
    options: [
      { id: 'full', label: 'Full Ground Match' }
    ]
  }
};

// Admin State
const state = {
  bookings: [],      // Array of booking objects
  adminBlocks: [],   // Array of admin block objects {date, sport, ground, hour}
  isAdminAuthenticated: false
};

// Sync state with the backend server database
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

// Initialize Admin Portal
document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.protocol === 'file:') {
    setTimeout(() => {
      showToast('App loaded via file://. Please open http://localhost:8080/admin.html in your browser for full functionality.', 'error');
    }, 1000);
  }
  loadLocalStorage();
  await syncWithServer();
  toggleAdminViews();
  if (state.isAdminAuthenticated) {
    renderAdminPanel();
    setupAdminForms();
  }
});

// Load from Local Storage
function loadLocalStorage() {
  const storedBookings = localStorage.getItem('gt_bookings');
  state.bookings = storedBookings ? JSON.parse(storedBookings) : [];

  const storedBlocks = localStorage.getItem('gt_blocks');
  state.adminBlocks = storedBlocks ? JSON.parse(storedBlocks) : [];
  
  // Load session authentication state if preserved
  state.isAdminAuthenticated = sessionStorage.getItem('gt_admin_auth') === 'true';
}

function saveLocalStorage() {
  localStorage.setItem('gt_bookings', JSON.stringify(state.bookings));
  localStorage.setItem('gt_blocks', JSON.stringify(state.adminBlocks));
}

function formatDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Separate Admin login views toggling
function toggleAdminViews() {
  const loginView = document.getElementById('admin-login-view');
  const dashboardView = document.getElementById('admin-dashboard-view');
  
  if (state.isAdminAuthenticated) {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
  } else {
    loginView.style.display = 'flex';
    dashboardView.style.display = 'none';
  }
}

// Handle login submissions
function handleAdminLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('admin-username').value.trim();
  const passwordInput = document.getElementById('admin-password').value;

  if (usernameInput === 'admin@goatturf.com' && passwordInput === 'admin123') {
    state.isAdminAuthenticated = true;
    sessionStorage.setItem('gt_admin_auth', 'true');
    showToast('Signed in successfully.');
    
    // Refresh admin views
    toggleAdminViews();
    renderAdminPanel();
    setupAdminForms();
    
    // Reset login form inputs
    document.getElementById('admin-login-form').reset();
  } else {
    showToast('Invalid email or password.', 'error');
  }
}

function handleAdminLogout() {
  state.isAdminAuthenticated = false;
  sessionStorage.removeItem('gt_admin_auth');
  showToast('Signed out of admin session.');
  toggleAdminViews();
}

// Admin Console Dashboard
function renderAdminPanel() {
  if (!state.isAdminAuthenticated) return;

  const revenueTotal = state.bookings
    .filter(b => b.status === 'confirmed')
    .reduce((sum, b) => sum + b.total, 0);
  
  const bookingsConfirmed = state.bookings.filter(b => b.status === 'confirmed').length;
  const uniquePhones = new Set(state.bookings.map(b => b.customerPhone)).size;
  const blockedSlotsCount = state.adminBlocks.length;

  document.getElementById('admin-stat-revenue').innerText = `₹${revenueTotal.toLocaleString('en-IN')}`;
  document.getElementById('admin-stat-bookings').innerText = bookingsConfirmed;
  document.getElementById('admin-stat-users').innerText = uniquePhones;
  document.getElementById('admin-stat-blocks').innerText = blockedSlotsCount;

  // Render logs rows
  const tbody = document.getElementById('admin-bookings-table-body');
  tbody.innerHTML = '';

  const sortedBookings = [...state.bookings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (sortedBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 20px 0;">No active turf bookings records.</td></tr>`;
    return;
  }

  sortedBookings.forEach(booking => {
    const dateFormatted = new Date(booking.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timings = booking.slots.map(h => `${h > 12 ? h-12 : h}:00 ${h>=12 ? 'PM':'AM'}`).join(', ');
    const groundLabel = GROUND_CONFIG[booking.sport].options.find(o => o.id === booking.ground).label;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:500;">#${booking.id}</td>
      <td>
        <div style="font-weight:500;">${booking.customerName}</div>
        <div style="font-size:11px; color:var(--text-secondary);">${booking.customerPhone}</div>
      </td>
      <td>
        <div>${booking.sport.toUpperCase()}</div>
        <div style="font-size:11px; color:var(--text-secondary);">${groundLabel}</div>
      </td>
      <td>
        <div>${dateFormatted}</div>
        <div style="font-size:11px; color:var(--google-blue);">${timings}</div>
      </td>
      <td>
        <div>₹${booking.total}</div>
        <div style="font-size:10px; color:var(--text-secondary); font-family:monospace;">${booking.paymentId || 'N/A'}</div>
      </td>
      <td>
        <span class="ticket-status ${booking.status}">${booking.status}</span>
      </td>
      <td>
        ${booking.status === 'confirmed' ? `
          <button class="btn-cancel-ticket" style="padding:4px 8px; font-size:11px;" onclick="adminCancelBooking('${booking.id}')">Cancel</button>
        ` : '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminCancelBooking(bookingId) {
  if (confirm(`ADMIN: Force cancel booking #${bookingId}?`)) {
    const booking = state.bookings.find(b => b.id === bookingId);
    if (booking) {
      booking.status = 'cancelled';
      saveLocalStorage();
      showToast(`ADMIN: Cancelled Booking #${bookingId}`);
      renderAdminPanel();
    }
  }
}

// Setup admin block dropdown fields
function setupAdminForms() {
  const today = new Date();
  document.getElementById('block-date').value = formatDateString(today);

  updateAdminGroundOptions();

  const hourSelect = document.getElementById('block-hour');
  hourSelect.innerHTML = '';
  for (let i = 5; i <= 22; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.innerText = `${i > 12 ? i - 12 : i}:00 ${i >= 12 ? 'PM' : 'AM'} (${i}:00)`;
    hourSelect.appendChild(opt);
  }
}

function updateAdminGroundOptions() {
  const sport = document.getElementById('block-sport').value;
  const selectGround = document.getElementById('block-ground');
  selectGround.innerHTML = '';

  GROUND_CONFIG[sport].options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id;
    o.innerText = opt.label;
    selectGround.appendChild(o);
  });
}

function checkSlotBooked(date, sport, ground, hour) {
  return state.bookings.some(booking => 
    booking.date === date && 
    booking.sport === sport && 
    booking.ground === ground && 
    booking.slots.includes(hour) &&
    booking.status === 'confirmed'
  );
}

function adminBlockSlot() {
  const date = document.getElementById('block-date').value;
  const sport = document.getElementById('block-sport').value;
  const ground = document.getElementById('block-ground').value;
  const hour = parseInt(document.getElementById('block-hour').value);

  if (!date) {
    showToast('Select a valid date.', 'error');
    return;
  }

  const isAlreadyBlocked = state.adminBlocks.some(b => 
    b.date === date && b.sport === sport && b.ground === ground && parseInt(b.hour) === hour
  );

  if (isAlreadyBlocked) {
    showToast('This slot is already blocked!');
    return;
  }

  // Check conflicts
  const isBooked = checkSlotBooked(date, sport, ground, hour);
  if (isBooked) {
    if (!confirm('This slot conflicts with a customer booking. Continue blocking?')) {
      return;
    }
  }

  state.adminBlocks.push({ date, sport, ground, hour });
  saveLocalStorage();

  if (window.location.protocol !== 'file:') {
    fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, sport, ground, hour })
    }).catch(err => console.error('Failed to post block to server:', err));
  }

  showToast('Slot blocked successfully.');
  renderAdminPanel();
}

function adminResetAllData() {
  if (confirm('Permanently wipe all database records?')) {
    localStorage.removeItem('gt_bookings');
    localStorage.removeItem('gt_blocks');
    state.bookings = [];
    state.adminBlocks = [];
    
    if (window.location.protocol !== 'file:') {
      fetch('/api/reset', { method: 'POST' })
        .catch(err => console.error('Failed to reset data on server:', err));
    }
    
    showToast('Database wiped.');
    renderAdminPanel();
  }
}

function adminPopulateMockData() {
  const todayStr = formatDateString(new Date());
  
  const mockBookings = [
    {
      id: 'GT702918',
      paymentId: 'pay_test_Mock112233',
      customerName: 'Sanjay Krishnan',
      customerPhone: '9442381274',
      customerEmail: 'sanjay@gmail.com',
      sport: 'football',
      ground: 'full',
      date: todayStr,
      slots: [19, 20],
      subtotal: 3000,
      tax: 540,
      total: 3540,
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      id: 'GT301982',
      paymentId: 'pay_test_Mock445566',
      customerName: 'Rahul Dev',
      customerPhone: '8148923019',
      customerEmail: 'rahul.dev@gmail.com',
      sport: 'cricket',
      ground: 'nets',
      date: todayStr,
      slots: [6, 7],
      subtotal: 800,
      tax: 144,
      total: 944,
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 8).toISOString()
    }
  ];

  const mockBlocks = [
    { date: todayStr, sport: 'football', ground: 'full', hour: 12 },
    { date: todayStr, sport: 'football', ground: 'full', hour: 13 }
  ];

  state.bookings = mockBookings;
  state.adminBlocks = mockBlocks;
  saveLocalStorage();

  if (window.location.protocol !== 'file:') {
    Promise.all([
      fetch('/api/reset', { method: 'POST' }),
      ...mockBookings.map(b => fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      })),
      ...mockBlocks.map(b => fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      }))
    ]).catch(err => console.error('Failed to sync mock data to server:', err));
  }

  showToast('Mock dashboard datasets successfully populated.');
  renderAdminPanel();
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

// Dynamic tab synchronization listener
window.addEventListener('storage', (e) => {
  if (e.key === 'gt_bookings' || e.key === 'gt_blocks') {
    loadLocalStorage();
    if (state.isAdminAuthenticated) {
      renderAdminPanel();
    }
  }
});
