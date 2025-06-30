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

// === NEW: Cooldown for coin creation ===
let lastCoinCreationTime = 0;
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown per user

const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfo = document.getElementById('userInfo');
const walletDiv = document.getElementById('wallet');
const coinCreationDiv = document.getElementById('coinCreation');
const fakeMoneySpan = document.getElementById('fakeMoney');
const yourCoinsList = document.getElementById('yourCoins');
const coinsListDiv = document.getElementById('coinsList');

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

// === NEW: Variable to hold fluctuation leader UID ===
let fluctuationLeaderUID = null;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    console.log("Signed in as:", user.displayName || user.email);

    userInfo.textContent = `Signed in as: ${user.displayName}`;
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    walletDiv.style.display = 'block';
    coinCreationDiv.style.display = 'block';

    loadUserData();
    listenToCoinsRealtime();
    updateLeaderboard();
    updateTopMovers();
    testFirestoreConnection();

    // === NEW: Determine fluctuation leader user ===
    try {
      const usersSnapshot = await db.collection('users').get();
      const allUIDs = usersSnapshot.docs.map(doc => doc.id);
      allUIDs.sort();
      fluctuationLeaderUID = allUIDs[0];
      console.log('Fluctuation leader UID is:', fluctuationLeaderUID);

      if (currentUser.uid === fluctuationLeaderUID) {
        console.log('You are the fluctuation leader - will run fluctuations every 30s.');

        // Run fluctuations only for the leader user
        setInterval(() => {
          randomFluctuateCoins();
        }, 30000);
      }
    } catch (err) {
      console.error('Error determining fluctuation leader:', err);
    }

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

  const now = Date.now();
  if (now - lastCoinCreationTime < COOLDOWN_MS) {
    return alert('Please wait a minute between creating coins to prevent spam.');
  }

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

    lastCoinCreationTime = now;  // update last creation time

  } catch (error) {
    console.error('Error creating coin:', error);
    alert('Error creating coin: ' + error.message);
  }
});

// ... All your other functions (renderCoinList, renderGoodCoins, listenToCoinsRealtime, testFirestoreConnection, updateLeaderboard, updateTopMovers, buyCoin, sellCoin) remain unchanged ...

// Random fluctuation function (unchanged)
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

      const maxFluctuation = 0.05; 
      const randomPercent = (Math.random() * 2 - 1) * maxFluctuation;
      let newPrice = coin.price * (1 + randomPercent);

      newPrice = Math.max(0.01, Math.min(newPrice, 1000));

      const updatedHistory = [...(coin.priceHistory || []), newPrice];
      if (updatedHistory.length > 50) updatedHistory.shift();

      batch.update(coinRef, {
        previousPrice: coin.price,
        price: newPrice,
        lastUpdated: Date.now(),
        priceHistory: updatedHistory,
        demand: Math.max(0, (coin.demand || 0) * 0.98)
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

// === REMOVED global fluctuation interval to avoid multiple users updating simultaneously ===
// setInterval(() => {
//   if (currentUser) {
//     randomFluctuateCoins();
//   }
// }, 30000);

// Update intervals for leaderboard and top movers (unchanged)
setInterval(() => {
  if (currentUser) {
    updateLeaderboard();
    updateTopMovers();
  }
}, 10000);
