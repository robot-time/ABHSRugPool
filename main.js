// main.js

const firebaseConfig = {
  apiKey: "AIzaSyBOffR_iGGEstP4DiIawiLGqCQr9zmc7s8",
  authDomain: "fakestocksim.firebaseapp.com",
  projectId: "fakestocksim",
  storageBucket: "fakestocksim.appspot.com",
  messagingSenderId: "267888043302",
  appId: "1:267888043302:web:2cdeb80352c9c067900de7",
  measurementId: "G-Y0M6M0RH5G"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;

const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfo = document.getElementById('userInfo');
const walletDiv = document.getElementById('wallet');
const coinCreationDiv = document.getElementById('coinCreation');
const fakeMoneySpan = document.getElementById('fakeMoney');
const yourCoinsList = document.getElementById('yourCoins');
const coinsListDiv = document.getElementById('coinsList');

// Debug logging
console.log('Firebase initialized');
console.log('Elements found:', {
  coinsListDiv: !!coinsListDiv,
  yourCoinsList: !!yourCoinsList,
  signInBtn: !!signInBtn,
  signOutBtn: !!signOutBtn
});

signInBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => alert('Sign in failed: ' + err.message));
};

signOutBtn.onclick = () => auth.signOut();

async function getUser() {
  if (!currentUser) throw 'No user logged in';
  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  if (!doc.exists) {
    await userRef.set({ fakeMoney: 1000, coins: {}, name: currentUser.displayName });
    return { fakeMoney: 1000, coins: {} };
  } else {
    return doc.data();
  }
}

async function loadUserData() {
  try {
    const user = await getUser();
    fakeMoneySpan.textContent = user.fakeMoney.toFixed(2);
    yourCoinsList.innerHTML = '';
    if (!user.coins || Object.keys(user.coins).length === 0) {
      yourCoinsList.innerHTML = '<li>No coins yet</li>';
    } else {
      for (const [ticker, amount] of Object.entries(user.coins)) {
        yourCoinsList.innerHTML += `<li>${ticker}: ${amount.toFixed(4)}</li>`;
      }
    }
  } catch (e) {
    console.error('Error loading user data:', e);
    alert(e);
  }
}

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    console.log("Signed in as:", user.displayName || user.email);

    // Show user info
    userInfo.textContent = `Signed in as: ${user.displayName}`;
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    walletDiv.style.display = 'block';
    coinCreationDiv.style.display = 'block';

    // Load core functions
    loadUserData();
    listenToCoinsRealtime();
    updateLeaderboard();
    updateTopMovers();
    
    // Test Firestore connection
    testFirestoreConnection();
  } else {
    currentUser = null;
    console.log("User is signed out");

    userInfo.textContent = 'Not signed in';
    signInBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
    walletDiv.style.display = 'none';
    coinCreationDiv.style.display = 'none';
    coinsListDiv.innerHTML = '';
    yourCoinsList.innerHTML = '';
    document.getElementById('leaderboard').innerHTML = '';
    document.getElementById('topMovers').innerHTML = '';
  }
});

document.getElementById('createCoinBtn').addEventListener('click', async () => {
  if (!currentUser) return alert('You must be signed in to create coins');

  const name = document.getElementById('coinName').value.trim();
  const ticker = document.getElementById('coinTicker').value.trim().toUpperCase();
  const price = 1.00;

  if (!name || !ticker) return alert('Please enter valid coin details');

  try {
    const coinRef = db.collection('coins').doc(ticker);
    const doc = await coinRef.get();
    if (doc.exists) return alert('Coin ticker already exists.');

    await coinRef.set({
      name,
      price,
      previousPrice: price,
      priceHistory: [price],
      demand: 0,
      lastUpdated: Date.now(),
      createdBy: {
        uid: currentUser.uid,
        name: currentUser.displayName || 'Unknown',
        email: currentUser.email
      }
    });

    alert(`Coin ${name} (${ticker}) created!`);
    document.getElementById('coinName').value = '';
    document.getElementById('coinTicker').value = '';
  } catch (error) {
    console.error('Error creating coin:', error);
    alert('Error creating coin: ' + error.message);
  }
});

let allCoinsData = {};  // store all coins by ticker for filtering

function renderCoinList(coinsArray, container) {
  if (!container) {
    console.error('Container element not found for renderCoinList');
    return;
  }
  
  container.innerHTML = '';
  if (coinsArray.length === 0) {
    container.innerHTML = '<p>No coins found.</p>';
    return;
  }

  coinsArray.forEach(coinObj => {
    const coin = coinObj.data;
    const ticker = coinObj.ticker;

    // Calculate price change
    const priceChange = coin.price - coin.previousPrice;
    const priceChangePercent = coin.previousPrice ? (priceChange / coin.previousPrice) * 100 : 0;

    let changeClass = 'neutral';
    let changeIcon = '━';
    if (priceChange > 0) {
      changeClass = 'positive';
      changeIcon = '↗';
    } else if (priceChange < 0) {
      changeClass = 'negative';
      changeIcon = '↘';
    }

    const coinDiv = document.createElement('div');
    coinDiv.classList.add('coin');
    coinDiv.innerHTML = `
      <div class="coin-header">
        <strong>${coin.name} (${ticker})</strong>
        <span class="price-change ${changeClass}">
          ${changeIcon} ${priceChangePercent.toFixed(2)}%
        </span>
      </div>
      <div class="price-info">
        Price: $${coin.price.toFixed(4)}
        <span class="price-change-value ${changeClass}">
          (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(4)})
        </span>
      </div>
      <canvas id="chart_${ticker}" height="50"></canvas>
      <div class="actions">
        <input type="number" min="0" step="0.0001" placeholder="Amount to buy" id="buy_${ticker}" />
        <button onclick="buyCoin('${ticker}')">Buy</button>
      </div>
      <div class="actions">
        <input type="number" min="0" step="0.0001" placeholder="Amount to sell" id="sell_${ticker}" />
        <button onclick="sellCoin('${ticker}')">Sell</button>
      </div>
    `;
    container.appendChild(coinDiv);

    // Render chart
    if (coin.priceHistory && coin.priceHistory.length > 1) {
      const chartColor = priceChange >= 0 ? '#28a745' : '#dc3545';
      try {
        new Chart(document.getElementById(`chart_${ticker}`), {
          type: 'line',
          data: {
            labels: Array(coin.priceHistory.length).fill(''),
            datasets: [{
              label: ticker,
              data: coin.priceHistory,
              borderColor: chartColor,
              backgroundColor: chartColor + '20',
              tension: 0.3,
              fill: true
            }]
          },
          options: {
            scales: { x: { display: false }, y: { display: false } },
            plugins: { legend: { display: false } }
          }
        });
      } catch (chartError) {
        console.error('Error creating chart for', ticker, chartError);
      }
    }
  });
}

// Fixed function to render all coins
function renderGoodCoins() {
  console.log('Rendering coins...', Object.keys(allCoinsData).length);
  
  // Convert allCoinsData object to array format that renderCoinList expects
  const coinsArray = Object.entries(allCoinsData).map(([ticker, data]) => ({
    ticker: ticker,
    data: data
  }));
  
  // Render to the main coins list
  renderCoinList(coinsArray, coinsListDiv);
  
  // Also render to goodCoinsList if it exists
  const goodCoinsListElement = document.getElementById('goodCoinsList');
  if (goodCoinsListElement) {
    renderCoinList(coinsArray, goodCoinsListElement);
  }
}

function listenToCoinsRealtime() {
  console.log('Listening to coins realtime...');
  db.collection('coins').onSnapshot(snapshot => {
    console.log('Coins snapshot received:', snapshot.size);
    allCoinsData = {}; // reset

    if (snapshot.empty) {
      console.log('No coins found in database');
      coinsListDiv.innerHTML = '<p>No coins yet.</p>';
      const goodCoinsListElement = document.getElementById('goodCoinsList');
      if (goodCoinsListElement) {
        goodCoinsListElement.innerHTML = '<p>No coins yet.</p>';
      }
      return;
    }

    snapshot.forEach(doc => {
      allCoinsData[doc.id] = doc.data();
      console.log('Added coin to allCoinsData:', doc.id);
    });

    console.log('Total coins loaded:', Object.keys(allCoinsData).length);
    renderGoodCoins();
  }, error => {
    console.error('Error listening to coins:', error);
    coinsListDiv.innerHTML = '<p>Error loading coins. Please refresh the page.</p>';
  });
}

// Test Firestore connection
async function testFirestoreConnection() {
  try {
    console.log('Testing Firestore connection...');
    const snapshot = await db.collection('coins').limit(5).get();
    console.log('Firestore connection test:', {
      success: true,
      hasCoins: !snapshot.empty,
      coinCount: snapshot.size
    });
    
    if (!snapshot.empty) {
      console.log('Sample coins:');
      snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
      });
    }
  } catch (error) {
    console.error('Firestore connection test failed:', error);
  }
}

function updateLeaderboard() {
  db.collection('users').orderBy('fakeMoney', 'desc').limit(10).get().then(snapshot => {
    const list = document.getElementById('leaderboard');
    if (!list) return;
    
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const u = doc.data();
      list.innerHTML += `<li>${u.name || 'Unknown'}: $${u.fakeMoney.toFixed(2)}</li>`;
    });
  }).catch(error => {
    console.error('Error updating leaderboard:', error);
  });
}

function updateTopMovers() {
  db.collection('coins').get().then(snapshot => {
    const changes = [];
    snapshot.forEach(doc => {
      const coin = doc.data();
      if (!coin.previousPrice || coin.previousPrice === 0) return;
      const change = ((coin.price - coin.previousPrice) / coin.previousPrice) * 100;
      changes.push({
        name: coin.name,
        ticker: doc.id,
        price: coin.price.toFixed(4),
        change
      });
    });
    const topGainers = [...changes].sort((a, b) => b.change - a.change).slice(0, 3);
    const topLosers = [...changes].sort((a, b) => a.change - b.change).slice(0, 3);

    let html = `<strong>📈 Top Gainers:</strong><ul>`;
    topGainers.forEach(c => {
      html += `<li class="positive">${c.name} (${c.ticker}): $${c.price} (+${c.change.toFixed(2)}%)</li>`;
    });
    html += `</ul><strong>📉 Top Losers:</strong><ul>`;
    topLosers.forEach(c => {
      html += `<li class="negative">${c.name} (${c.ticker}): $${c.price} (${c.change.toFixed(2)}%)</li>`;
    });
    html += `</ul>`;
    
    const topMoversElement = document.getElementById('topMovers');
    if (topMoversElement) {
      topMoversElement.innerHTML = html;
    }
  }).catch(error => {
    console.error('Error updating top movers:', error);
  });
}

// Buy/sell functionality with transaction fees and price impact
globalThis.buyCoin = async function(ticker, inputId) {
  if (!currentUser) return alert('Sign in first');
  const inputElem = inputId ? document.getElementById(inputId) : document.getElementById(`buy_${ticker}`);
  if (!inputElem) {
    console.error('Input element not found for ticker:', ticker);
    return;
  }

  const amount = parseFloat(inputElem.value);
  if (!amount || amount <= 0) return alert('Enter valid amount');

  const coinRef = db.collection('coins').doc(ticker);
  const userRef = db.collection('users').doc(currentUser.uid);

  try {
    await db.runTransaction(async (tx) => {
      const coinDoc = await tx.get(coinRef);
      const userDoc = await tx.get(userRef);
      if (!coinDoc.exists || !userDoc.exists) throw 'Coin or user not found';

      const coin = coinDoc.data();
      const user = userDoc.data();
      const totalCost = coin.price * amount * 1.01; // 1% fee

      if (user.fakeMoney < totalCost) throw 'Not enough fake money';

      const newFakeMoney = user.fakeMoney - totalCost;
      const newCoinAmount = (user.coins?.[ticker] || 0) + amount;
      const priceImpact = 0.005 * amount;
      const newPrice = Math.max(coin.price + priceImpact, 0.01);

      tx.update(userRef, {
        fakeMoney: newFakeMoney,
        [`coins.${ticker}`]: newCoinAmount
      });

      const updatedHistory = [...(coin.priceHistory || []), newPrice];
      if (updatedHistory.length > 20) updatedHistory.shift();

      tx.update(coinRef, {
        price: newPrice,
        previousPrice: coin.price,
        demand: (coin.demand || 0) + amount,
        lastUpdated: Date.now(),
        priceHistory: updatedHistory
      });
    });

    alert(`Bought ${amount} ${ticker}`);
    inputElem.value = '';
    loadUserData();
  } catch (err) {
    console.error('Error buying coin:', err);
    alert(err);
  }
};

globalThis.sellCoin = async function(ticker) {
  if (!currentUser) return alert('Sign in first');
  const amountInput = document.getElementById(`sell_${ticker}`);
  if (!amountInput) {
    console.error('Sell input element not found for ticker:', ticker);
    return;
  }
  
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return alert('Enter valid amount');

  const coinRef = db.collection('coins').doc(ticker);
  const userRef = db.collection('users').doc(currentUser.uid);

  try {
    await db.runTransaction(async (tx) => {
      const coinDoc = await tx.get(coinRef);
      const userDoc = await tx.get(userRef);
      if (!coinDoc.exists || !userDoc.exists) throw 'Coin or user not found';

      const coin = coinDoc.data();
      const user = userDoc.data();
      const userCoins = user.coins?.[ticker] || 0;
      if (userCoins < amount) throw 'Not enough coins to sell';

      const proceeds = coin.price * amount * 0.99; // 1% fee
      let newPrice = Math.max(coin.price - 0.005 * amount, 0.01);
      const newFakeMoney = user.fakeMoney + proceeds;
      const newCoinAmount = userCoins - amount;

      const coinUpdate = newCoinAmount > 0
        ? { [`coins.${ticker}`]: newCoinAmount }
        : { [`coins.${ticker}`]: firebase.firestore.FieldValue.delete() };

      tx.update(userRef, {
        fakeMoney: newFakeMoney,
        ...coinUpdate
      });

      const updatedHistory = [...(coin.priceHistory || []), newPrice];
      if (updatedHistory.length > 20) updatedHistory.shift();

      tx.update(coinRef, {
        price: newPrice,
        previousPrice: coin.price,
        demand: Math.max(0, (coin.demand || 0) - amount),
        lastUpdated: Date.now(),
        priceHistory: updatedHistory
      });
    });

    alert(`Sold ${amount} ${ticker}`);
    amountInput.value = '';
    loadUserData();
  } catch (err) {
    console.error('Error selling coin:', err);
    alert(err);
  }
};

// Random fluctuation function
async function randomFluctuateCoins() {
  try {
    const snapshot = await db.collection('coins').get();
    if (snapshot.empty) {
      console.log('No coins to fluctuate');
      return;
    }

    const batch = db.batch();
    let updates = 0;

    snapshot.forEach(doc => {
      const coin = doc.data();
      const coinRef = db.collection('coins').doc(doc.id);

      // Random fluctuation amount (say ±5%)
      const maxFluctuation = 0.05; 
      const randomPercent = (Math.random() * 2 - 1) * maxFluctuation;
      let newPrice = coin.price * (1 + randomPercent);

      // Clamp to reasonable bounds
      newPrice = Math.max(0.01, Math.min(newPrice, 1000));

      const updatedHistory = [...(coin.priceHistory || []), newPrice];
      if (updatedHistory.length > 50) updatedHistory.shift();

      batch.update(coinRef, {
        previousPrice: coin.price,
        price: newPrice,
        lastUpdated: Date.now(),
        priceHistory: updatedHistory,
        demand: Math.max(0, (coin.demand || 0) * 0.98) // optional decay
      });

      updates++;
    });

    if (updates > 0) {
      await batch.commit();
      console.log(`Randomly updated ${updates} coins`);
    }

  } catch (err) {
    console.error('Error in random fluctuation:', err);
  }
}

// Update intervals
setInterval(() => {
  if (currentUser) {
    updateLeaderboard();
    updateTopMovers();
  }
}, 10000);

// Optional: Add random fluctuation every 30 seconds
setInterval(() => {
  if (currentUser) {
    randomFluctuateCoins();
  }
}, 30000);