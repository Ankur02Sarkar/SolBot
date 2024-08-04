import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

async function monitorWalletTransactions(walletAddress) {
  try {
    // Connect to the Solana devnet
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Create a public key from the wallet address
    const publicKey = new PublicKey(walletAddress);

    // Fetch initial balance
    let previousBalance = await connection.getBalance(publicKey);

    console.log(`Monitoring transactions for wallet: ${walletAddress}`);

    // Subscribe to transaction signatures
    connection.onLogs(publicKey, async (logs, context) => {
      const { signature } = logs;

      // Fetch transaction details
      const transactionDetails = await connection.getTransaction(signature);

      if (!transactionDetails) return;

      // Extract balance change details
      const currentBalance = await connection.getBalance(publicKey);
      const solBalance = currentBalance / LAMPORTS_PER_SOL;
      const previousSolBalance = previousBalance / LAMPORTS_PER_SOL;

      if (currentBalance !== previousBalance) {
        const difference = solBalance - previousSolBalance;
        const transactionType = difference > 0 ? "Deposit" : "Withdrawal";

        // Generate Solscan link
        const solscanLink = `https://solscan.io/tx/${signature}?cluster=devnet`;

        console.log(`Transaction detected for ${walletAddress}`);
        console.log(`Transaction Type: ${transactionType}`);
        console.log(`Amount: ${Math.abs(difference)} SOL`);
        console.log(`New Balance: ${solBalance} SOL`);
        console.log(`Transaction Signature: ${signature}`);
        console.log(`Solscan Link: ${solscanLink}`);
        console.log(`Context Slot: ${context.slot}`);
        console.log("-----------------------------");

        // Update the previous balance
        previousBalance = currentBalance;
      }
    });
  } catch (error) {
    console.error("Error monitoring wallet transactions:", error);
  }
}

// Example wallet address
const walletAddress = "CxS7MctUkr4sBYKNQLMmQakvivZw6gjDxjqst2aAPnJ9";

// Start monitoring transactions
monitorWalletTransactions(walletAddress);
