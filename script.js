import { Buffer } from 'buffer';
window.Buffer = Buffer;


/* ------------- CONFIG - Replace these with real values ------------- */
/* For Solana/SPL tokens:
   - VELOCITY_TOKEN_MINT must be a real SPL token mint address (e.g., USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
   - RECEIVER_PUBLIC_KEY is the Solana account that will receive tokens
   - REQUIRED_HOLD is used for display only (100000 means 100000 tokens, adjust decimals below)
   - RPC_ENDPOINT: Use mainnet-beta for production, devnet for testing
*/
const VELOCITY_TOKEN_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Example: USDC mint (REPLACE)
const RECEIVER_PUBLIC_KEY = "4GuJSQQxpAJkQ4sRbU3y9Q9xrsQXYCJFtRHUmqxErcb7"; // Example: REPLACE with real public key
const REQUIRED_HOLD = "100000"; // used for display, not enforced client-side
const RPC_ENDPOINT = "https://api.devnet.solana.com";


/* --------------------------------------------------------------------- */
// Imports (replaces dynamic CDN loading)
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

// Initialize after libraries load (now instant with imports)
async function initLibraries() {
  try {
    let connection = null;
    let publicKey = null;

    /* UI elements */
    const connectBtn = document.getElementById("connectBtn");
    const authBtn = document.getElementById("authBtn");
    const run401Btn = document.getElementById("run401Btn");
    const run402Btn = document.getElementById("run402Btn");
    const authStatus = document.getElementById("authStatus");
    const paymentStatus = document.getElementById("paymentStatus");
    const networkBadge = document.getElementById("network-badge");

    /* Helpers: show statuses */
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

    /* Connect wallet & update UI */
    async function connectWallet() {
      try {
        if (!window.solana) throw new Error("Phantom wallet not found. Install Phantom.");
        if (!window.solana.isPhantom) throw new Error("Non-Phantom wallet detected.");

        const resp = await window.solana.connect();
        publicKey = resp.publicKey;
        connection = new Connection(RPC_ENDPOINT, 'confirmed');

        showNetwork(`Network: Solana (${RPC_ENDPOINT.includes('devnet') ? 'Devnet' : 'Mainnet'})`);

        connectBtn.textContent = publicKey.toString().slice(0,6) + "..." + publicKey.toString().slice(-4);
        showAuth("Wallet connected: " + publicKey.toString().slice(0,8));

        // Try to fetch token balance if token mint is set
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

    /* x401: sign a message via a dummy transaction and verify */
    async function run401() {
      try {
        if (!publicKey) return showAuth("Connect wallet first", true);

        const message = `Zephyr x401: Sign to link wallet — ${new Date().toISOString()}`;
        // Encode message as Uint8Array (browser-compatible, no Buffer needed)
        const messageBytes = new TextEncoder().encode(message); // Converts string to Uint8Array

        const memoIx = new TransactionInstruction({
          keys: [],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), // Memo program
          data: messageBytes, // Use Uint8Array directly
        });

        const transaction = new Transaction().add(memoIx);
        transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = publicKey;

        const signedTx = await window.solana.signTransaction(transaction);
        // Verify by checking if the signer matches (basic check; for full verification, send and confirm)
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

    /* x402: check token balance then transfer SPL tokens */
    async function run402() {
      try {
        if (!publicKey) return showPayment("Connect wallet first", true);
        if (!isTokenConfigured()) return showPayment("Token mint or receiver not configured in script.js", true);

        showPayment("Preparing payment...");

        // Get user's associated token account for the mint
        const userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          publicKey
        );

        // Fetch balance
        const accountInfo = await connection.getTokenAccountBalance(userTokenAccount);
        const decimals = accountInfo.value.decimals;
        const userBal = accountInfo.value.uiAmountString;

        showPayment(`Your token balance: ${userBal} (decimals: ${decimals})`);

        // Amount to send: small demo (0.01 tokens)
        const amountToSendHuman = "0.01";
        const amountToSend = Math.floor(parseFloat(amountToSendHuman) * Math.pow(10, decimals));

        if (parseFloat(userBal) < parseFloat(amountToSendHuman)) {
          showPayment(`Insufficient token balance. Need ${amountToSendHuman} tokens.`, true);
          return;
        }

        // Get receiver's associated token account
        const receiverTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          new PublicKey(RECEIVER_PUBLIC_KEY)
        );

        // Create transfer instruction (compatible with all versions)
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

        showPayment(`Sending ${amountToSendHuman} tokens to receiver...`);

        const signedTx = await window.solana.signTransaction(transaction);
        const txId = await connection.sendRawTransaction(signedTx.serialize());
        showPayment(`Tx sent: ${txId} — waiting for confirmation...`);

        await connection.confirmTransaction(txId);
        showPayment(`✅ x402 Payment Confirmed — tx: ${txId}`);
      } catch (err) {
        console.error(err);
        const msg = err && err.message ? err.message : String(err);
        const hint = msg.includes("insufficient") ? " (Check you have SOL for fees)" : "";
        showPayment("x402 failed: " + msg + hint, true);
      }
    }

    /* Utility: display balance */
    async function displayTokenBalance() {
      try {
        const userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(VELOCITY_TOKEN_MINT),
          publicKey
        );
        const accountInfo = await connection.getTokenAccountBalance(userTokenAccount);
        const bal = accountInfo.value.uiAmountString;
        showPayment(`Token balance: ${bal} • Need ${REQUIRED_HOLD} to access dashboard (UI check only).`);
      } catch (err) {
        console.warn("balance display failed:", err);
        showPayment("Could not read token balance — check token mint & network", true);
      }
    }

    /* Utility: check config */
    function isTokenConfigured() {
      const zero = "11111111111111111111111111111112"; // Solana zero pubkey
      return VELOCITY_TOKEN_MINT && RECEIVER_PUBLIC_KEY && VELOCITY_TOKEN_MINT !== zero && RECEIVER_PUBLIC_KEY !== zero;
    }

    /* Wire UI */
    connectBtn.addEventListener("click", connectWallet);
    authBtn.addEventListener("click", run401);
    run401Btn.addEventListener("click", run401);
    run402Btn.addEventListener("click", run402);

    /* Auto-connect if already connected */
    (async function tryAutoConnect() {
      if (window.solana && window.solana.isConnected) {
        await connectWallet().catch(() => {});
      }
    })();
    
  } catch (err) {
    console.error("Library loading failed:", err);
  }
}

// Call initLibraries when the page loads
initLibraries();
