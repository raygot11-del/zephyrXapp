import { Buffer } from 'buffer';
window.Buffer = Buffer;

/* ------------- CONFIG ------------- */
const RECEIVER_PUBLIC_KEY = "2dksmJMPCi75kdhpwqAnTiczsT9BXrG4k3VoQ26j9u3a";  // Receiver address
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com"; // Changed to mainnet-beta

// Mainnet USDC mint
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/* --------------------------------- */
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction, 
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram 
} from "@solana/web3.js";

let connection = null;
let publicKey = null;

const connectBtn = document.getElementById("connectBtn");
const authBtn = document.getElementById("authBtn");
const run401Btn = document.getElementById("run401Btn");
const run402Btn = document.getElementById("run402Btn");
const paymentTypeSelect = document.getElementById("paymentType"); // Your dropdown
const authStatus = document.getElementById("authStatus");
const paymentStatus = document.getElementById("paymentStatus");
const networkBadge = document.getElementById("network-badge");

function showAuth(msg, error = false) {
  authStatus.textContent = msg;
  authStatus.style.color = error ? "#ffb3c6" : "#bff3ff";
}
function showPayment(msg, error = false) {
  paymentStatus.innerHTML = msg;  // Changed to innerHTML to render HTML links
  paymentStatus.style.color = error ? "#ff9aa2" : "#bff3ff";
}
function showNetwork(msg) {
  networkBadge && (networkBadge.textContent = msg);
}

async function connectWallet() {
  try {
    if (!window.solana?.isPhantom) throw new Error("Install Phantom wallet");
    const resp = await window.solana.connect();
    publicKey = resp.publicKey;
    connection = new Connection(RPC_ENDPOINT, "confirmed");

    const networkName = RPC_ENDPOINT.includes('mainnet') ? 'Mainnet' : 'Devnet';  // Updated to detect mainnet
    showNetwork(`Network: Solana (${networkName})`);

    connectBtn.textContent = publicKey.toString().slice(0,6) + "..." + publicKey.toString().slice(-4);
    showAuth("Connected!");
    onWalletConnected(); // Enable buttons after connect
  } catch (e) {
    showAuth("Connect failed: " + e.message, true);
  }
}

async function run401() {
  if (!publicKey) return showAuth("Connect first", true);

  try {
    const message = new TextEncoder().encode(
      `Zephyr x401 — ${new Date().toISOString()}`
    );

    showAuth("Signing message...");
    const signature = await window.solana.signMessage(message, "utf8");

    // send signature + message + publicKey to backend later
    showAuth("Signed in successfully!");
  } catch (e) {
    showAuth("x401 failed: " + e.message, true);
  }
}

async function run402() {
  if (!publicKey || !connection) return showPayment("Connect first", true);
  try {
    const paymentType = paymentTypeSelect?.value || "sol";
    const amountInput = document.getElementById("amountInput");
    const amountHuman = amountInput ? amountInput.value : "0.01"; // Fallback to "0.08" for 0.08 SOL/USDC

    showPayment(`Preparing ${amountHuman} ${paymentType.toUpperCase()}...`);

    // Validate balance before sending
    if (paymentType === "sol") {
      const balance = await connection.getBalance(publicKey);
      const lamports = Math.floor(parseFloat(amountHuman) * 1_000_000_000);
      if (balance < lamports) {
        throw new Error("Insufficient SOL balance");
      }
    } else {
      const mintPk = new PublicKey(USDC_MINT_MAINNET);  // Updated to mainnet USDC
      const source = await getAssociatedTokenAddress(mintPk, publicKey);
      const tokenAcc = await connection.getParsedAccountInfo(source);
      if (tokenAcc.value) {
        const uiAmount = tokenAcc.value.data.parsed.info.tokenAmount.uiAmount;
        if (uiAmount < parseFloat(amountHuman)) {
          throw new Error("Insufficient USDC balance");
        }
      } else {
        throw new Error("USDC account not found");
      }
    }

    const tx = new Transaction();
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = publicKey;

    if (paymentType === "sol") {
      // Native SOL
      const lamports = Math.floor(parseFloat(amountHuman) * 1_000_000_000);
      tx.add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(RECEIVER_PUBLIC_KEY),
        lamports
      }));
    } else {
      // USDC
      const mintPk = new PublicKey(USDC_MINT_MAINNET);  // Updated to mainnet USDC
      const source = await getAssociatedTokenAddress(mintPk, publicKey);
      const dest = await getAssociatedTokenAddress(mintPk, new PublicKey(RECEIVER_PUBLIC_KEY));

      // Auto-create sender ATA if missing
      const sourceInfo = await connection.getAccountInfo(source);
      if (!sourceInfo) {
        showPayment("Creating sender USDC account...");
        tx.add(createAssociatedTokenAccountInstruction(
          publicKey, source, publicKey, mintPk
        ));
      }

      // Auto-create receiver ATA if missing
      const destInfo = await connection.getAccountInfo(dest);
      if (!destInfo) {
        showPayment("Creating receiver USDC account...");
        tx.add(createAssociatedTokenAccountInstruction(
          publicKey, // payer
          dest,      // ATA
          new PublicKey(RECEIVER_PUBLIC_KEY),
          mintPk
        ));
      }

      const amount = BigInt(Math.floor(parseFloat(amountHuman) * 1_000_000)); // 6 decimals
      tx.add(createTransferInstruction(source, dest, publicKey, amount));
    }

    // Original way: sign and send raw (reverted for compatibility)
    const signed = await window.solana.signTransaction(tx);
    const txId = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txId);
    showPayment(`Success! Sent ${amountHuman} ${paymentType.toUpperCase()} — <a href="https://explorer.solana.com/tx/${txId}?cluster=mainnet-beta" target="_blank" style="color: #FFD700;">View tx</a>`);  // Updated to mainnet explorer
  } catch (e) {
    showPayment("x402 failed: " + e.message, true);
  }
}

// Disable buttons initially
authBtn.disabled = true;
run401Btn.disabled = true;
run402Btn.disabled = true;

function onWalletConnected() {
  authBtn.disabled = false;
  run401Btn.disabled = false;
  run402Btn.disabled = false;
}

// Buttons
connectBtn?.addEventListener("click", connectWallet);
authBtn?.addEventListener("click", run401);
run401Btn?.addEventListener("click", run401);
run402Btn?.addEventListener("click", run402);

// Auto-connect
if (window.solana?.isConnected) connectWallet();

// Hamburger menu toggle (mobile)
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

hamburger?.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks?.classList.toggle('active');
});

// Close hamburger menu when a nav link is clicked (mobile)
navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger?.classList.remove('active');
    navLinks?.classList.remove('active');
  });
});

