import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

async function getWalletBalance(walletAddress) {
  try {
    // Connect to the Solana devnet

    // const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
    // const connection = new Connection(clusterApiUrl("testnet"), "confirmed");
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Create a public key from the wallet address
    const publicKey = new PublicKey(walletAddress);

    // Fetch the balance of the wallet
    const balance = await connection.getBalance(publicKey);

    // Convert the balance from lamports to SOL (1 SOL = 1,000,000,000 lamports)
    const solBalance = balance / LAMPORTS_PER_SOL;

    console.log(`Wallet balance for ${walletAddress}: ${solBalance} SOL`);
    return solBalance;
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
  }
}

// Example wallet address
const walletAddress = "Gt8JFScEMANx1w6oguDcjE9f6DgcZfcB5V3iLK561Q9P";

// Call the function to check the wallet balance
getWalletBalance(walletAddress);
