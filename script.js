import { Buffer } from 'buffer';
window.Buffer = Buffer;

/* ------------- CONFIG - Replace these with real values ------------- */
const VELOCITY_TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RECEIVER_PUBLIC_KEY = "4GuJSQQxpAJkQ4sRbU3y9Q9xrsQXYCJFtRHUmqxErcb7";
const REQUIRED_HOLD = "100000";
const RPC_ENDPOINT = "https://api.devnet.solana.com";

/* --------------------------------------------------------------------- */
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

async function initLibraries() {
  try {
    let connection = null;
    let publicKey = null;

    /* UI */
    const connectBtn = document.getElementById("connectBtn");
    const authBtn = document.getElementById("authBtn");
    const run401Btn = document.getElementById("run401Btn");
    const run402Btn = document.getElementById("run402Btn");
    const authStatus = document.getElementById("authStatus");
    const paymentStatus = document.getElementById("paymentStatus");
    const networkBadge = document.getElementById("network-badge");

    function showAuth(msg, isError = false) {
      authStatus.textContent = msg;
      authStatus.style.color = isError ? "#ffb3c6" : "#bff3ff";
    }
    function showPayment(msg, isError = false) {
      paymentStatus.textContent = msg;
      paymentStatus.style.color = isError ? "#ff9aa2" : "#bff3ff";
    }
    function showNetwork(msg) {
      networkBadge.textContent = msg;
    }

    /* -------------------------------------------------------------
       ✔ FIXED: CONNECT WALLET (Mobile Phantom + Desktop Phantom)
    ------------------------------------------------------------- */
    async function connectWallet() {
      try {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // 🔥 Mobile fix — deep link into Phantom
        if (isMobile && (!window.solana || !window.solana.isPhantom)) {
          const deepLink = `https://phantom.app/ul/v1/connect?app_url=${encodeURIComponent(window.location.href)}`;
          window.location.href = deepLink;
          return;
        }

        if (!window.solana) throw new Error("Phantom wallet not found. Install Phantom.");
        if (!window.solana.isPhantom) throw new Error("Non-Phantom wallet detected.");

        // IMPORTANT: required for mobile + desktop
        const resp = await window.solana.connect({ onlyIfTrusted: false });

        publicKey = resp.publicKey;
        connection = new Connection(RPC_ENDPOINT, 'confirmed');

        showNetwork(`Network: Solana (${RPC_ENDPOINT.includes('devnet') ? 'Devnet' : 'Mainnet'})`);

        connectBtn.textContent =
          publicKey.toString().slice(0, 6) +
          "..." +
          publicKey.toString().slice(-4);

        showAuth("Wallet connected: " + publicKey.toString().slice(0, 8));

        if (isTokenConfigured()) {
          await displayTokenBalance();
        } else {
          showPayment("Set token mint in script.js to enable x402");
        }
      } catch (err) {
        console.error(err);
        showAuth("Wallet connect failed: " + (err.message || err), true);
      }
    }

    /* x401 — sign message */
    async function run401() {
      try {
        if (!publicKey) return showAuth("Connect wallet first", true);

        const message = `Zephyr x401: Sign to link wallet — ${new Date().toISOString()}`;
        const messageBytes = new TextEncoder().encode(message);

        const memoIx = new TransactionInstruction({
          keys: [],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: messageBytes,
        });

        const transaction = new Transaction().add(memoIx);
        transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = publicKey;

        const signedTx = await window.solana.signTransaction(transaction);

        if (signedTx.signatures.some(sig => sig.publicKey.equals(publicKey))) {
          showAuth("✅ x401 success. Wallet linked.");
        } else {
          showAuth("❌ x401 verification failed.", true);
        }
      } catch (err) {
        console.error(err);
        showAuth("x401 failed: " + (err.message || err), true);
      }
    }

    /* x402 — SPL token transfer */
    async function run402() {
      try {
        if (!publicKey) return showPayment("Connect wallet first", true);
        if (!isTokenConfigured()) return showPayment("Token mint or receiver not configured", true);

        showPayment("Preparing payment...");

        const userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          publicKey
        );

        const accountInfo = await connection.getTokenAccountBalance(userTokenAccount);
        const decimals = accountInfo.value.decimals;
        const userBal = accountInfo.value.uiAmountString;

        showPayment(`Your token balance: ${userBal}`);

        const amountToSendHuman = "0.01";
        const amountToSend = Math.floor(parseFloat(amountToSendHuman) * Math.pow(10, decimals));

        if (parseFloat(userBal) < parseFloat(amountToSendHuman)) {
          showPayment(`Insufficient balance. Need ${amountToSendHuman} tokens.`, true);
          return;
        }

        const receiverTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          new PublicKey(RECEIVER_PUBLIC_KEY)
        );

        const transferIx = createTransferInstruction(
          userTokenAccount,
          receiverTokenAccount,
          publicKey,
          amountToSend,
          [],
          TOKEN_PROGRAM_ID
        );

        const transaction = new Transaction().add(transferIx);
        transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = publicKey;

        showPayment(`Sending ${amountToSendHuman} tokens...`);

        const signedTx = await window.solana.signTransaction(transaction);
        const txId = await connection.sendRawTransaction(signedTx.serialize());

        showPayment(`Tx: ${txId} — pending confirmation...`);

        await connection.confirmTransaction(txId);
        showPayment(`✅ x402 Payment Confirmed — tx: ${txId}`);
      } catch (err) {
        console.error(err);
        showPayment("x402 failed: " + (err.message || err), true);
      }
    }

    /* Display balance */
    async function displayTokenBalance() {
      try {
        const userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          publicKey
        );
        const accountInfo = await connection.getTokenAccountBalance(userTokenAccount);
        const bal = accountInfo.value.uiAmountString;

        showPayment(`Token balance: ${bal}`);
      } catch (err) {
        showPayment("Could not read token balance", true);
      }
    }

    function isTokenConfigured() {
      const zero = "11111111111111111111111111111112";
      return VELOCITY_TOKEN_MINT && RECEIVER_PUBLIC_KEY &&
             VELOCITY_TOKEN_MINT !== zero &&
             RECEIVER_PUBLIC_KEY !== zero;
    }

    connectBtn.addEventListener("click", connectWallet);
    authBtn.addEventListener("click", run401);
    run401Btn.addEventListener("click", run401);
    run402Btn.addEventListener("click", run402);

    /* -------------------------------------------------------------
       ✔ IMPORTANT FIX — Auto-complete Phantom mobile connection
    ------------------------------------------------------------- */
    if (window.solana) {
      try {
        // If Phantom is already connected (rare)
        if (window.solana.isConnected) {
          await connectWallet().catch(() => {});
        } else {
          // Try to finish the handshake automatically after deep link return
          await window.solana.connect({ onlyIfTrusted: false }).catch(() => {});
          if (window.solana.isConnected) {
            await connectWallet().catch(() => {});
          }
        }
      } catch (e) {
        console.warn("Auto-connect failed:", e);
      }
    }

  } catch (err) {
    console.error("Library loading failed:", err);
  }
}

initLibraries();
