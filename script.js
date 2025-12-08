import { Buffer } from 'buffer';
window.Buffer = Buffer;

/* ------------- CONFIG ------------- */
const RECEIVER_PUBLIC_KEY = "6UsJoobvwZKPgKWxRgjNuMNLYrYNvJxhWjMUcT6WHYy7";
const RPC_ENDPOINT = "https://api.devnet.solana.com"; // Change to mainnet-beta later

// Devnet USDC mint — works perfectly
const USDC_MINT_DEVNET = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2jfeH8P";

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
  paymentStatus.textContent = msg;
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

    const networkName = RPC_ENDPOINT.includes('devnet') ? 'Devnet' : 'Mainnet';
    showNetwork(`Network: Solana (${networkName})`);

    connectBtn.textContent = publicKey.toString().slice(0,6) + "..." + publicKey.toString().slice(-4);
    showAuth("Connected!");
  } catch (e) {
    showAuth("Connect failed: " + e.message, true);
  }
}

async function run401() {
  if (!publicKey) return showAuth("Connect first", true);
  try {
    showAuth("Signing in...");
    const msg = `Zephyr x401 — ${new Date().toISOString()}`;
    const ix = new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: new TextEncoder().encode(msg)
    });
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = publicKey;

    const signed = await window.solana.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig);
    showAuth("Signed in successfully!");
  } catch (e) {
    showAuth("x401 failed: " + e.message, true);
  }
}

async function run402() {
  if (!publicKey || !connection) return showPayment("Connect first", true);
  try {
    const paymentType = paymentTypeSelect?.value || "sol";
    const amountHuman = "2"; // You can change this anytime

    showPayment(`Preparing ${amountHuman} ${paymentType.toUpperCase()}...`);

    const tx = new Transaction();
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = publicKey;

    if (paymentType === "sol") {
      // Native SOL
      const lamports = BigInt(parseFloat(amountHuman) * 1_000_000_000);
      tx.add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(RECEIVER_PUBLIC_KEY),
        lamports
      }));
    } else {
      // USDC
      const mintPk = new PublicKey(USDC_MINT_DEVNET);
      const source = await getAssociatedTokenAddress(mintPk, publicKey);
      const dest = await getAssociatedTokenAddress(mintPk, new PublicKey(RECEIVER_PUBLIC_KEY));

      // Auto-create if missing
      const info = await connection.getAccountInfo(source);
      if (!info) {
        showPayment("Creating USDC account...");
        tx.add(createAssociatedTokenAccountInstruction(
          publicKey, source, publicKey, mintPk
        ));
      }

      const amount = BigInt(parseFloat(amountHuman) * 1_000_000); // 6 decimals
      tx.add(createTransferInstruction(source, dest, publicKey, amount));
    }

    const signed = await window.solana.signTransaction(tx);
    const txId = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txId);
    showPayment(`Success! Sent ${amountHuman} ${paymentType.toUpperCase()} — tx: ${txId}`);
  } catch (e) {
    showPayment("x402 failed: " + e.message, true);
  }
}

// Buttons
connectBtn?.addEventListener("click", connectWallet);
authBtn?.addEventListener("click", run401);
run401Btn?.addEventListener("click", run401);
run402Btn?.addEventListener("click", run402);

// Auto-connect
if (window.solana?.isConnected) connectWallet();
