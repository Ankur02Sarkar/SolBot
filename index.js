import TelegramBot from "node-telegram-bot-api";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// Replace 'YOUR_TELEGRAM_BOT_TOKEN' with the token you received from BotFather
const botToken = process.env.TELE_BOT_API;

// Initialize the Telegram bot
const bot = new TelegramBot(botToken, { polling: true });

// In-memory storage for users and their wallet addresses
const userWallets = new Map();

// In-memory storage for user states
const userStates = new Map();

// Function to monitor transactions on a specific network
async function monitorNetwork(networkName, userId, walletAddress) {
  try {
    // Connect to the specified Solana network
    const connection = new Connection(clusterApiUrl(networkName), "confirmed");

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

        const message = `
Transaction detected for your wallet on ${networkName}:
Transaction Type: ${transactionType}
Amount: ${Math.abs(difference)} SOL
New Balance: ${solBalance} SOL
Transaction Signature: ${signature}
Solscan Link: ${solscanLink}
Context Slot: ${context.slot}
        `;

        // Send a message to the user on Telegram
        bot.sendMessage(userId, message);

        console.log(message);

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

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Set user state to expect wallet address input
  userStates.set(chatId, "waiting_for_wallet_address");

  // Prompt the user to enter their Solana wallet address
  bot.sendMessage(
    chatId,
    "Welcome! Please enter your Solana wallet address to start monitoring."
  );
});

// Handle text messages (wallet address input)
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if the user is expected to provide a wallet address
  if (userStates.get(chatId) === "waiting_for_wallet_address") {
    try {
      if (!PublicKey.isOnCurve(text)) {
        bot.sendMessage(
          chatId,
          "Invalid wallet address. Please provide a valid Solana wallet address."
        );
        return;
      }

      // Store the user's wallet address
      userWallets.set(chatId, text);
      userStates.set(chatId, "monitoring");

      // Monitor the wallet on all networks
      monitorNetwork("mainnet-beta", chatId, text);
      monitorNetwork("devnet", chatId, text);
      monitorNetwork("testnet", chatId, text);

      bot.sendMessage(
        chatId,
        `Monitoring wallet: ${text} on mainnet-beta, devnet, and testnet.`
      );
    } catch (error) {
      bot.sendMessage(
        chatId,
        "Invalid wallet address format. Please provide a valid Solana wallet address."
      );
    }
  }
});

// Command to stop monitoring a wallet
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;

  if (userWallets.has(chatId)) {
    userWallets.delete(chatId);
    userStates.set(chatId, "stopped");
    bot.sendMessage(chatId, "Stopped monitoring your wallet.");
  } else {
    bot.sendMessage(chatId, "You are not currently monitoring any wallet.");
  }
});

// Command to get help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
Welcome to the Solana Wallet Monitor Bot!

Commands:
/start - Start monitoring your Solana wallet address.
/stop - Stop monitoring your wallet.
/help - Show this help message.

To start, send the /start command and then enter your Solana wallet address when prompted.
  `;

  bot.sendMessage(chatId, helpMessage);
});
