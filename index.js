import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

async function monitorWalletTransactions(walletAddress) {
  // Function to create a connection and monitor transactions on a specific network
  async function monitorNetwork(networkName) {
    try {
      // Connect to the specified Solana network
      const connection = new Connection(
        clusterApiUrl(networkName),
        "confirmed"
      );

      // Create a public key from the wallet address
      const publicKey = new PublicKey(walletAddress);

      // Fetch initial balance
      let previousBalance = await connection.getBalance(publicKey);

      console.log(
        `Monitoring transactions for wallet: ${walletAddress} on ${networkName}`
      );

      // Subscribe to transaction logs for the public key
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
          const solscanLink = `https://solscan.io/tx/${signature}?cluster=${networkName}`;

          console.log(
            `Transaction detected for ${walletAddress} on ${networkName}`
          );
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
      console.error(
        `Error monitoring wallet transactions on ${networkName}:`,
        error
      );
    }
  }

  // Monitor transactions on mainnet-beta, devnet, and testnet
  monitorNetwork("mainnet-beta");
  monitorNetwork("devnet");
  monitorNetwork("testnet");
}

// Example wallet address
const walletAddress = "CxS7MctUkr4sBYKNQLMmQakvivZw6gjDxjqst2aAPnJ9";

// Start monitoring transactions
monitorWalletTransactions(walletAddress);
