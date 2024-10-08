import TelegramBot from "node-telegram-bot-api";
import express from "express";
import bodyParser from "body-parser";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import nacl from "tweetnacl";
import "dotenv/config";

// Replace 'YOUR_TELEGRAM_BOT_TOKEN' with the token you received from BotFather
const botToken = process.env.TELE_BOT_API;

// Initialize the Telegram bot with no polling
const bot = new TelegramBot(botToken);

// Express app setup
const app = express();
app.use(bodyParser.json());

// Your server URL, replace with the actual URL
const serverUrl = process.env.SERVER_URL || "https://solbot-dev.onrender.com";

// Set the webhook
bot.setWebHook(`${serverUrl}/bot${botToken}`);

// In-memory storage for users and their wallet addresses and private key arrays
const userWallets = new Map();
const userPrivateKeys = new Map();
const userStates = new Map();
const transactionData = new Map();

// Handle incoming webhook updates
app.post(`/bot${botToken}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set up bot commands to appear in the Telegram menu
bot.setMyCommands([
  {
    command: "/start",
    description: "Start monitoring your Solana wallet address",
  },
  { command: "/send", description: "Send SOL to another address" },
  { command: "/stop", description: "Stop monitoring your wallet" },
  { command: "/view_wallets", description: "View currently monitored wallets" },
  { command: "/help", description: "Show help message" },
]);

// Express route to show welcome message
app.get("/", (req, res) => {
  res.send(
    "Welcome to the SolBot Server! Use the Telegram bot to interact with Solana blockchain."
  );
});

// Function to monitor transactions on a specific network
async function monitorNetwork(networkName, userId, walletAddress) {
  try {
    const connection = new Connection(clusterApiUrl(networkName), "confirmed");
    const publicKey = new PublicKey(walletAddress);
    let previousBalance = await connection.getBalance(publicKey);

    console.log(
      `Monitoring transactions for wallet: ${walletAddress} on ${networkName}`
    );

    connection.onLogs(publicKey, async (logs, context) => {
      const { signature } = logs;
      const transactionDetails = await connection.getTransaction(signature);
      if (!transactionDetails) return;
      const currentBalance = await connection.getBalance(publicKey);
      const solBalance = currentBalance / LAMPORTS_PER_SOL;
      const previousSolBalance = previousBalance / LAMPORTS_PER_SOL;
      if (currentBalance !== previousBalance) {
        const difference = solBalance - previousSolBalance;
        const transactionType = difference > 0 ? "Deposit" : "Withdrawal";
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
        bot.sendMessage(userId, message);
        console.log(message);
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
  userStates.set(chatId, "waiting_for_wallet_address");
  bot.sendMessage(
    chatId,
    "Welcome! Please enter your Solana wallet address to start monitoring."
  );
});

// Handle text messages (wallet address input and transaction prompts)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Avoid processing command messages
  if (text.startsWith("/")) return;

  switch (userStates.get(chatId)) {
    case "waiting_for_wallet_address":
      handleWalletAddressInput(chatId, text);
      break;

    case "waiting_for_recovery_phrase":
      await handleRecoveryPhraseInput(chatId, text);
      break;

    case "waiting_for_private_key":
      handlePrivateKeyInput(chatId, text);
      break;

    case "waiting_for_network_choice":
      handleNetworkChoiceInput(chatId, text);
      break;

    case "waiting_for_recipient_address":
      handleRecipientAddressInput(chatId, text);
      break;

    case "waiting_for_amount":
      handleAmountInput(chatId, text);
      break;

    default:
      // Handle any unexpected state
      bot.sendMessage(
        chatId,
        "Unexpected input. Please use /help for available commands."
      );
  }
});

// Function to handle wallet address input
function handleWalletAddressInput(chatId, text) {
  try {
    const publicKey = new PublicKey(text);
    userWallets.set(chatId, text);
    userStates.set(chatId, "monitoring");
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

// Function to handle recovery phrase input
async function handleRecoveryPhraseInput(chatId, text) {
  try {
    const privateKeyArray = await getPrivateKeyArrayFromRecoveryPhrase(text);
    if (!privateKeyArray) {
      throw new Error("Invalid recovery phrase.");
    }
    userPrivateKeys.set(chatId, privateKeyArray);
    userStates.set(chatId, "waiting_for_network_choice");
    bot.sendMessage(chatId, "Enter the network number to use:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Mainnet", callback_data: "1" },
            { text: "Devnet", callback_data: "2" },
            { text: "Testnet", callback_data: "3" },
          ],
        ],
      },
    });
  } catch (error) {
    bot.sendMessage(chatId, "Invalid recovery phrase. Please try again.");
  }
}

// Function to handle private key input
function handlePrivateKeyInput(chatId, text) {
  try {
    const privateKeyArray = text
      .split(",")
      .map((num) => parseInt(num.trim(), 10)); // Assuming user enters the private key as comma-separated values
    if (privateKeyArray.length !== 64) {
      throw new Error(
        "Invalid private key length. Please provide a valid private key."
      );
    }

    userPrivateKeys.set(chatId, privateKeyArray);
    userStates.set(chatId, "waiting_for_network_choice");
    bot.sendMessage(chatId, "Enter the network number to use:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Mainnet", callback_data: "1" },
            { text: "Devnet", callback_data: "2" },
            { text: "Testnet", callback_data: "3" },
          ],
        ],
      },
    });
  } catch (error) {
    bot.sendMessage(chatId, "Invalid private key. Please try again.");
  }
}

// Function to handle network choice input
function handleNetworkChoiceInput(chatId, text) {
  const networkMap = {
    1: "mainnet-beta",
    2: "devnet",
    3: "testnet",
  };

  const chosenNetwork = networkMap[text];
  if (!chosenNetwork) {
    bot.sendMessage(chatId, "Invalid choice. Please select a valid network.");
    return;
  }

  transactionData.set(chatId, { network: chosenNetwork });
  userStates.set(chatId, "waiting_for_recipient_address");
  bot.sendMessage(chatId, "Enter the recipient's Solana wallet address:");
}

// Function to handle recipient address input
function handleRecipientAddressInput(chatId, text) {
  try {
    const recipientPublicKey = new PublicKey(text);
    const data = transactionData.get(chatId) || {};
    transactionData.set(chatId, { ...data, recipientAddress: text });
    userStates.set(chatId, "waiting_for_amount");
    bot.sendMessage(chatId, "Enter the amount of SOL to send:");
  } catch (error) {
    bot.sendMessage(
      chatId,
      "Invalid recipient wallet address. Please provide a valid Solana wallet address."
    );
  }
}

// Function to handle amount input
async function handleAmountInput(chatId, text) {
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(
      chatId,
      "Invalid amount. Please enter a positive number for the amount of SOL to send."
    );
    return;
  }

  const transactionInfo = transactionData.get(chatId);
  transactionInfo.amount = amount;
  transactionData.set(chatId, transactionInfo);

  // Execute the transaction
  await sendSolTransaction(chatId, transactionInfo);
}

// Function to send SOL
async function sendSolTransaction(
  chatId,
  { recipientAddress, amount, network }
) {
  const senderAddress = userWallets.get(chatId);
  const privateKeyArray = userPrivateKeys.get(chatId);

  try {
    const senderKeypair = Keypair.fromSecretKey(
      Uint8Array.from(privateKeyArray)
    );
    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const recipientPublicKey = new PublicKey(recipientAddress);
    const lamportsToSend = amount * LAMPORTS_PER_SOL;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: recipientPublicKey,
        lamports: lamportsToSend,
      })
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [
      senderKeypair,
    ]);
    const solscanLink = `https://solscan.io/tx/${signature}?cluster=${network}`;

    const message = `
Transaction Successful!
Sent ${amount} SOL to ${recipientAddress}.
Transaction Signature: ${signature}
Solscan Link: ${solscanLink}
    `;
    bot.sendMessage(chatId, message);
    userStates.set(chatId, "monitoring");
  } catch (error) {
    console.error("Error sending SOL:", error);
    bot.sendMessage(
      chatId,
      "Failed to send SOL. Please ensure you have enough balance and the addresses are correct. Please enter your recovery phrase or private key again."
    );
    userPrivateKeys.delete(chatId);
    userStates.set(chatId, "waiting_for_key_choice");
  }
}

// Function to get private key array from recovery phrase
async function getPrivateKeyArrayFromRecoveryPhrase(secretRecoveryPhrase) {
  try {
    const isValidPhrase = bip39.validateMnemonic(secretRecoveryPhrase);
    if (!isValidPhrase) {
      throw new Error("Invalid secret recovery phrase.");
    }
    const seed = await bip39.mnemonicToSeed(secretRecoveryPhrase);
    const path = "m/44'/501'/0'/0'";
    const { key } = derivePath(path, seed.toString("hex"));
    const keyPair = nacl.sign.keyPair.fromSeed(key);
    return Array.from(keyPair.secretKey);
  } catch (error) {
    console.error("Error deriving private key:", error);
    return null;
  }
}

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

// Command to view currently monitored wallets
bot.onText(/\/view_wallets/, (msg) => {
  const chatId = msg.chat.id;
  if (userWallets.size === 0) {
    bot.sendMessage(chatId, "No wallets are currently being monitored.");
    return;
  }

  let walletsList = "Currently monitored wallets:\n";
  userWallets.forEach((walletAddress, userId) => {
    walletsList += `- User ID: ${userId}, Wallet Address: ${walletAddress}\n`;
  });

  bot.sendMessage(chatId, walletsList);
});

// Command to get help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
Welcome to the SolBot!

Commands:
/start - Start monitoring your Solana wallet address.
/send - Send SOL to another address.
/stop - Stop monitoring your wallet.
/view_wallets - View currently monitored wallets.
/help - Show this help message.

To start, send the /start command and then enter your Solana wallet address when prompted.
  `;
  bot.sendMessage(chatId, helpMessage);
});

// Handle the /send command
bot.onText(/\/send/, (msg) => {
  const chatId = msg.chat.id;
  if (!userWallets.has(chatId)) {
    bot.sendMessage(
      chatId,
      "Please provide your wallet address using the /start command before sending SOL."
    );
    return;
  }

  userStates.set(chatId, "waiting_for_key_choice");
  bot.sendMessage(
    chatId,
    "Choose how you would like to sign the transaction:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Secret Phrase", callback_data: "use_secret_phrase" },
            // { text: "Private Key", callback_data: "use_private_key" },
          ],
        ],
      },
    }
  );
});

// Handle callback queries for inline buttons
bot.on("callback_query", (callbackQuery) => {
  const { message, data } = callbackQuery;
  const chatId = message.chat.id;

  if (userStates.get(chatId) === "waiting_for_key_choice") {
    if (data === "use_secret_phrase") {
      userStates.set(chatId, "waiting_for_recovery_phrase");
      bot.sendMessage(chatId, "Enter your secret recovery phrase:");
    } else if (data === "use_private_key") {
      userStates.set(chatId, "waiting_for_private_key");
      bot.sendMessage(chatId, "Enter your private key:");
    }
    bot.answerCallbackQuery(callbackQuery.id);
  }

  if (userStates.get(chatId) === "waiting_for_network_choice") {
    handleNetworkChoiceInput(chatId, data);
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
