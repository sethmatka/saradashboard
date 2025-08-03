import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, orderBy, runTransaction, getDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global variables
let withdrawalRequests = [];

// Function to fetch pending withdrawal requests
async function fetchWithdrawalRequests() {
  try {
    const requestsContainer = document.getElementById('requestsContainer');
    requestsContainer.innerHTML = '<div class="loading">Loading withdrawal requests...</div>';

    // Query withdrawal_requests collection for pending status
    const withdrawalCollection = collection(db, "withdrawal_requests");
    const q = query(
      withdrawalCollection,
      where("status", "==", "Pending"),
      orderBy("timestamp", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    withdrawalRequests = [];
    
    querySnapshot.forEach((doc) => {
      withdrawalRequests.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    displayWithdrawalRequests();
    updateStats();
    
    console.log("Fetched withdrawal requests:", withdrawalRequests);
  } catch (error) {
    console.error("Error fetching withdrawal requests:", error);
    const requestsContainer = document.getElementById('requestsContainer');
    requestsContainer.innerHTML = '<div class="loading">Error loading withdrawal requests</div>';
  }
}

// Function to display withdrawal requests
async function displayWithdrawalRequests() {
  const requestsContainer = document.getElementById('requestsContainer');
  
  if (withdrawalRequests.length === 0) {
    requestsContainer.innerHTML = `
      <div class="no-requests">
        <div class="icon">📭</div>
        <h3>No Pending Requests</h3>
        <p>There are no pending withdrawal requests at the moment.</p>
      </div>
    `;
    return;
  }
  
  let requestsHTML = '';
  
  // Fetch user balances for all requests
  for (const request of withdrawalRequests) {
    const date = new Date(request.timestamp).toLocaleString();
    
    // Get user's current balance
    let userBalance = 'Loading...';
    let balanceClass = '';
    try {
      const userRef = doc(db, "users", request.userId);
      const userSnapshot = await getDoc(userRef);
      if (userSnapshot.exists()) {
        const balance = userSnapshot.data().balance || 0;
        userBalance = `₹${balance.toLocaleString()}`;
        // Add warning class if balance is insufficient
        balanceClass = balance < request.amount ? 'insufficient-balance' : 'sufficient-balance';
      } else {
        userBalance = 'User not found';
        balanceClass = 'user-not-found';
      }
    } catch (error) {
      console.error('Error fetching user balance:', error);
      userBalance = 'Error loading';
      balanceClass = 'error-balance';
    }
    
    requestsHTML += `
      <div class="request-card">
        <div class="request-info">
          <div class="request-header">
            <div class="request-id">Request #${request.id.substring(0, 8)}</div>
            <div class="request-amount">₹${request.amount.toLocaleString()}</div>
          </div>
          
          <div class="request-details">
            <div class="detail-item">
              <div class="detail-label">User ID</div>
              <div class="detail-value">${request.userId}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Current Balance</div>
              <div class="detail-value ${balanceClass}">${userBalance}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Type</div>
              <div class="detail-value">${request.type}</div>
            </div>
             <div class="detail-item">
              <div class="detail-label">UPI ID</div>
              <div class="detail-value upi-id" onclick="copyUpiId('${request.upiId}', this)" title="Click to copy UPI ID">${request.upiId}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Date & Time</div>
              <div class="detail-value">${date}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Status</div>
              <div class="detail-value">
                <span class="status-badge status-pending">${request.status}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="request-actions">
          <button class="action-btn approve-btn" onclick="confirmApproval('${request.id}', '${request.userId}', ${request.amount})">
            ✅ Approve
          </button>
          <button class="action-btn reject-btn" onclick="confirmRejection('${request.id}', '${request.userId}')">
            ❌ Reject
          </button>
        </div>
      </div>
    `;
  }
  
  requestsContainer.innerHTML = requestsHTML;
}

// Function to confirm approval with detailed information
async function confirmApproval(requestId, userId, amount) {
  try {
    // Fetch user's current balance
    const userRef = doc(db, "users", userId);
    const userSnapshot = await getDoc(userRef);
    
    let balanceInfo = '';
    if (userSnapshot.exists()) {
      const currentBalance = userSnapshot.data().balance || 0;
      const afterBalance = currentBalance - amount;
      balanceInfo = `Current Balance: ₹${currentBalance.toLocaleString()}\n` +
                   `After Withdrawal: ₹${afterBalance.toLocaleString()}\n\n`;
      
      if (currentBalance < amount) {
        alert(`❌ INSUFFICIENT BALANCE!\n\nUser ${userId} has only ₹${currentBalance.toLocaleString()} but is trying to withdraw ₹${amount.toLocaleString()}.\n\nThis request cannot be approved.`);
        return;
      }
    } else {
      balanceInfo = `⚠️ User not found in database!\n\n`;
    }
    
    const message = `⚠️ CONFIRM WITHDRAWAL APPROVAL ⚠️\n\n` +
                    `User ID: ${userId}\n` +
                    `Withdrawal Amount: ₹${amount.toLocaleString()}\n` +
                    balanceInfo +
                    `This will:\n` +
                    `• Approve the withdrawal request\n` +
                    `• Deduct ₹${amount.toLocaleString()} from user's balance\n` +
                    `• Mark the request as "Approved"\n\n` +
                    `⚠️ IMPORTANT: Make sure you have processed the payment before approving!\n\n` +
                    `Are you sure you want to proceed?`;
    
    if (confirm(message)) {
      updateRequestStatus(requestId, 'Approved');
    }
  } catch (error) {
    console.error('Error fetching user balance for confirmation:', error);
    const message = `⚠️ CONFIRM WITHDRAWAL APPROVAL ⚠️\n\n` +
                    `User ID: ${userId}\n` +
                    `Amount: ₹${amount.toLocaleString()}\n\n` +
                    `⚠️ Could not fetch current balance!\n\n` +
                    `This will:\n` +
                    `• Approve the withdrawal request\n` +
                    `• Deduct ₹${amount.toLocaleString()} from user's balance\n` +
                    `• Mark the request as "Approved"\n\n` +
                    `⚠️ IMPORTANT: Make sure you have processed the payment before approving!\n\n` +
                    `Are you sure you want to proceed?`;
    
    if (confirm(message)) {
      updateRequestStatus(requestId, 'Approved');
    }
  }
}

// Function to confirm rejection
function confirmRejection(requestId, userId) {
  const message = `⚠️ CONFIRM REJECTION ⚠️\n\n` +
                  `User ID: ${userId}\n\n` +
                  `This will reject the withdrawal request.\n` +
                  `No balance will be deducted from the user.\n\n` +
                  `Are you sure you want to reject this request?`;
  
  if (confirm(message)) {
    updateRequestStatus(requestId, 'Rejected');
  }
}

// Function to update request status and deduct balance if approved
async function updateRequestStatus(requestId, newStatus) {
  try {
    // Disable buttons to prevent multiple clicks
    const buttons = document.querySelectorAll(`[onclick*="${requestId}"]`);
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    });

    // Find the request data from our local array
    const request = withdrawalRequests.find(req => req.id === requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // Prepare update data
    const updateData = {
      status: newStatus,
      updatedAt: new Date().getTime()
    };

    // Add approvedOn field and deduct balance if status is Approved
    if (newStatus === 'Approved') {
      const now = new Date();
      const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
        timeZoneName: 'short'
      };
      const formattedDate = now.toLocaleString('en-US', options).replace('IST', 'UTC+5:30');
      updateData.approvedOn = formattedDate;

      // Deduct balance from user account using Firestore transaction
      await deductBalanceFromUser(request.userId, request.amount, requestId);
    }

    // Update the document in Firestore
    const requestRef = doc(db, "withdrawal_requests", requestId);
    await updateDoc(requestRef, updateData);
    
    // Show success message
    const action = newStatus === 'Approved' ? 'approved and balance deducted' : newStatus.toLowerCase();
    alert(`Request ${action} successfully!`);
    
    // Refresh the list
    fetchWithdrawalRequests();
    
    console.log(`Request ${requestId} updated to ${newStatus}`);
  } catch (error) {
    console.error("Error updating request status:", error);
    alert(`Error updating request: ${error.message}. Please try again.`);
    
    // Re-enable buttons on error
    const buttons = document.querySelectorAll(`[onclick*="${requestId}"]`);
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

// Function to deduct balance from user account
async function deductBalanceFromUser(userId, amount, requestId) {
  try {
    console.log(`🔄 Starting balance deduction for user: ${userId}, amount: ₹${amount}`);
    
    const userRef = doc(db, "users", userId);
    
    await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      
      if (!userSnapshot.exists()) {
        console.error(`❌ User document not found: ${userId}`);
        throw new Error(`User with ID ${userId} not found in database`);
      }
      
      const userData = userSnapshot.data();
      const currentBalance = userData.balance || 0;
      
      // Check if user has sufficient balance
      if (currentBalance < amount) {
        throw new Error(`Insufficient balance. User has ₹${currentBalance.toLocaleString()}, but trying to withdraw ₹${amount.toLocaleString()}`);
      }
      
      const newBalance = currentBalance - amount;

      console.log(`💰 Balance deduction for user ${userId}:`);
      console.log(`   Current balance: ₹${currentBalance.toLocaleString()}`);
      console.log(`   Withdrawing amount: ₹${amount.toLocaleString()}`);
      console.log(`   New balance: ₹${newBalance.toLocaleString()}`);

      // Create update object with balance and timestamp
      const updateData = { 
        balance: newBalance,
        lastBalanceUpdate: new Date().toISOString(),
        lastBalanceUpdateFormatted: new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        })
      };

      // Update user balance
      transaction.update(userRef, updateData);
    });

    // Create transaction record for audit trail
    await createWithdrawalTransactionRecord(userId, amount, requestId);

    console.log(`✅ Balance successfully deducted for user ${userId}: -₹${amount.toLocaleString()}`);
    
  } catch (error) {
    console.error(`❌ Error deducting balance from user ${userId}:`, error);
    throw error; // Re-throw to handle in calling function
  }
}

// Function to create withdrawal transaction record for audit trail
async function createWithdrawalTransactionRecord(userId, amount, requestId) {
  try {
    const transactionData = {
      userId: userId,
      amount: -amount, // Negative amount to indicate deduction
      type: 'withdrawal_approved',
      requestId: requestId,
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      }),
      description: `Balance deducted via approved withdrawal request`
    };

    const transactionsRef = collection(db, "balance_transactions");
    await addDoc(transactionsRef, transactionData);
    
    console.log(`📝 Withdrawal transaction record created for user ${userId}: -₹${amount.toLocaleString()}`);
  } catch (error) {
    console.error("❌ Error creating withdrawal transaction record:", error);
    // Don't throw here - transaction record is optional
  }
}

// Function to update stats
function updateStats() {
  const pendingCount = withdrawalRequests.length;
  const totalAmount = withdrawalRequests.reduce((sum, request) => sum + request.amount, 0);
  
  document.getElementById('pendingCount').textContent = pendingCount;
  document.getElementById('totalAmount').textContent = `₹${totalAmount.toLocaleString()}`;
}

// Function to copy UPI ID to clipboard
async function copyUpiId(upiId, element) {
  try {
    await navigator.clipboard.writeText(upiId);
    
    // Add copied class for visual feedback
    element.classList.add('copied');
    
    // Show success message
    const originalTitle = element.title;
    element.title = 'Copied to clipboard!';
    
    // Remove copied class and restore title after animation
    setTimeout(() => {
      element.classList.remove('copied');
      element.title = originalTitle;
    }, 1500);
    
    console.log('UPI ID copied to clipboard:', upiId);
  } catch (error) {
    console.error('Failed to copy UPI ID:', error);
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = upiId;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    // Show feedback
    element.classList.add('copied');
    element.title = 'Copied to clipboard!';
    
    setTimeout(() => {
      element.classList.remove('copied');
      element.title = 'Click to copy UPI ID';
    }, 1500);
  }
}

// Hamburger menu functionality
function initializeHamburgerMenu() {
  const hamburgerMenu = document.getElementById('hamburgerMenu');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function toggleSidebar() {
    hamburgerMenu.classList.toggle('active');
    sidebar.classList.toggle('active');
    sidebarOverlay.classList.toggle('active');
  }

  function closeSidebar() {
    hamburgerMenu.classList.remove('active');
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }

  hamburgerMenu.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
}

// Make functions globally available
window.fetchWithdrawalRequests = fetchWithdrawalRequests;
window.updateRequestStatus = updateRequestStatus;
window.deductBalanceFromUser = deductBalanceFromUser;
window.createWithdrawalTransactionRecord = createWithdrawalTransactionRecord;
window.confirmApproval = confirmApproval;
window.confirmRejection = confirmRejection;
window.copyUpiId = copyUpiId;

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  initializeHamburgerMenu();
  fetchWithdrawalRequests();
  
  // Auto-refresh every 5 minutes
  setInterval(fetchWithdrawalRequests, 5 * 60 * 1000);
});
