const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { Client, GatewayIntentBits, Partials, SlashCommandBuilder } = require("discord.js");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require("express");
const { execSync } = require("child_process");
require("dotenv").config();

// Ensure public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fsSync.existsSync(publicDir)) {
  fsSync.mkdirSync(publicDir, { recursive: true });
}

// Set up the Express server
const app = express();
const PORT = process.env.PORT || 10000;

// Serve static files from public directory
app.use(express.static(publicDir));

// Serve the index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "main", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Add a new addon')
      .addStringOption(option =>
        option.setName('title')
          .setDescription('Title of the addon')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('redirect')
          .setDescription('Redirect URL')
          .setRequired(true))
      .addAttachmentOption(option =>
        option.setName('image')
          .setDescription('Addon image')
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Remove an addon by title')
      .addStringOption(option =>
        option.setName('title')
          .setDescription('Title of the addon to remove')
          .setRequired(true)),
  ];

  client.application.commands.set(commands);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;
  const authorizedUsers = ["585128050623250462"];

  if (!authorizedUsers.includes(interaction.user.id)) {
    try {
      return await interaction.reply({
        content: "You are not authorized to use this command.",
        flags: [1 << 6]
      });
    } catch (error) {
      console.error('Authorization error:', error);
      return;
    }
  }

  try {
    // Defer the reply immediately
    await interaction.deferReply({ flags: [1 << 6] });

    if (command === "add") {
      try {
        const title = interaction.options.getString("title");
        const redirect = interaction.options.getString("redirect");
        const attachment = interaction.options.getAttachment("image");

        // Validate inputs
        if (!title || !redirect || !attachment) {
          return await interaction.editReply({
            content: "Missing required fields. Please provide title, redirect URL, and image."
          });
        }

        console.log("Reading existing HTML...");
        const html = await fs.readFile(path.join(__dirname, "main", "index.html"), "utf8");
        const $ = cheerio.load(html);

        let exists = false;
        $(".card").each((i, elem) => {
          const cardTitle = $(elem).find(".glow-text").text().trim();
          if (cardTitle === title) {
            exists = true;
          }
        });

        if (exists) {
          return interaction.editReply({
            content: "Failed: Addon already exists!",
            flags: [1 << 6],
          });
        }

        console.log("Fetching image from URL:", attachment.url);

        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        console.log("Image buffer size:", buffer.length);
        const filename = attachment.name;
        const imagePath = path.join(publicDir, filename);
        await fs.writeFile(imagePath, buffer); // Save image in the public folder

        // Update addons.json first
        const addonsPath = path.join(__dirname, 'addons.json');
        let addonsData;
        try {
          addonsData = JSON.parse(await fs.readFile(addonsPath, 'utf8'));
        } catch (error) {
          // If file doesn't exist or is invalid, create new structure
          addonsData = { addons: [] };
        }

        // Add new addon to the data
        addonsData.addons.push({
          title,
          redirect,
          image: filename,
          added: new Date().toISOString()
        });

        // Save updated addons data
        await fs.writeFile(addonsPath, JSON.stringify(addonsData, null, 2));
        console.log("Updated addons.json");

        const newCard = `
        <div class="card">
          <h2 class="glow-text">${title}</h2>
          <a href="#" class="redirect-link" data-redirect="${redirect}">
            <img src="${filename}" alt="${title}">
          </a>
        </div>`;

        $(".grid").append(newCard);

        const formattedHtml = $.html().replace(/\n\s*\n/g, "\n").replace(/(<div class="grid">.*?>)\s*/s, "$1\n");

        console.log("Writing modified HTML to file...");
        await fs.writeFile(path.join(__dirname, "main", "index.html"), formattedHtml);

        // Configure git with environment variables
        const gitEmail = process.env.GIT_EMAIL || "snowsgift131@gmail.com";
        const gitName = process.env.GIT_NAME || "Arcticnime";
        execSync(`git config --global user.email "${gitEmail}"`);
        execSync(`git config --global user.name "${gitName}"`);

        // Setup git repository if needed
        try {
          execSync('git init');
          execSync(`git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/Arcticnime/arctics-marketplace.git`);
        } catch (e) {
          try {
            execSync(`git remote set-url origin https://${process.env.GITHUB_TOKEN}@github.com/Arcticnime/arctics-marketplace.git`);
          } catch (err) {
            console.error('Git remote setup error:', err);
          }
        }

        try {
          execSync("git checkout main");
        } catch (e) {
          execSync("git checkout -b main");
        }

        // Stage and commit any existing changes first
        try {
          execSync("git add .");
          execSync('git commit -m "Staging changes"', { stdio: 'pipe' });
        } catch (err) {
          // Ignore commit errors if nothing to commit
          if (!err.stdout?.includes('nothing to commit')) {
            console.error('Commit error:', err);
          }
        }

        // Add and commit new changes
        execSync("git add index.html");
        execSync(`git add "${filename}"`);
        execSync(`git add addons.json`);
        try {
          execSync(`git commit -m "Add addon: ${title}"`, { stdio: 'pipe' });
        } catch (err) {
          if (!err.stdout?.includes('nothing to commit')) {
            throw err;
          }
        }
        
        // Try to push changes
        try {
          execSync("git push -u origin main");
        } catch (e) {
          console.error('Git push error:', e);
          // Continue even if git push fails
        }

        console.log("Addon committed to GitHub.");

        // Send success message to user
        try {
          await interaction.editReply({
            content: 'Addon added successfully!'
          });

          // Send embed to channel separately
          const embed = {
            title: `New Addon Added: ${title}`,
            color: 0xa855f7,
            fields: [
              {
                name: 'Added by',
                value: `<@${interaction.user.id}>`,
                inline: true
              },
              {
                name: 'Redirect',
                value: redirect,
                inline: true
              }
            ],
            image: {
              url: attachment.url,
            },
            timestamp: new Date(),
            footer: {
              text: 'Arctics Marketplace'
            }
          };

          await interaction.channel.send({ embeds: [embed] }).catch(console.error);
        } catch (err) {
          console.error('Discord response error:', err);
        }
      } catch (error) {
        console.error("Error in adding addon:", error);
        try {
          await interaction.editReply({
            content: "Failed to add addon."
          });
        } catch (err) {
          console.error('Failed to send error response:', err);
        }
      }
    }

    if (command === "remove") {
      try {
        const title = interaction.options.getString("title");
        if (!title) {
          return await interaction.editReply({
            content: "Please provide the title of the addon to remove.",
            flags: [1 << 6]
          });
        }

        console.log("Reading existing HTML...");
        const html = await fs.readFile(path.join(__dirname, "main", "index.html"), "utf8");
        const $ = cheerio.load(html);

        let found = false;
        $(".card").each((i, elem) => {
          const cardTitle = $(elem).find(".glow-text").text().trim();
          if (cardTitle === title) {
            found = true;
            $(elem).remove(); // Remove the card from HTML
          }
        });

        if (!found) {
          return interaction.editReply({
            content: `Failed: Addon with title "${title}" not found.`,
            flags: [1 << 6],
          });
        }

        // Update addons.json
        const addonsPath = path.join(__dirname, 'addons.json');
        let addonsData;
        try {
          addonsData = JSON.parse(await fs.readFile(addonsPath, 'utf8'));
        } catch (error) {
          // If file doesn't exist or is invalid, create new structure
          addonsData = { addons: [] };
        }

        addonsData.addons = addonsData.addons.filter(addon => addon.title !== title);

        // Save updated addons data
        await fs.writeFile(addonsPath, JSON.stringify(addonsData, null, 2));
        console.log("Updated addons.json");

        // Remove the associated image if it exists
        const images = $(`img[alt="${title}"]`).map((i, el) => $(el).attr('src')).get();
        for (const image of images) {
          const imagePath = path.join(publicDir, image);
          if (fsSync.existsSync(imagePath)) {
            await fs.unlink(imagePath);
          }
        }

        const formattedHtml = $.html().replace(/\n\s*\n/g, "\n").replace(/(<div class="grid">.*?>)\s*/s, "$1\n");

        await fs.writeFile(path.join(__dirname, "main", "index.html"), formattedHtml);

        // Configure git with environment variables
        const gitEmail = process.env.GIT_EMAIL || "snowsgift131@gmail.com";
        const gitName = process.env.GIT_NAME || "Arcticnime";
        execSync(`git config --global user.email "${gitEmail}"`);
        execSync(`git config --global user.name "${gitName}"`);

        // Setup git repository if needed
        try {
          execSync('git init');
          execSync(`git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/Arcticnime/arctics-marketplace.git`);
        } catch (e) {
          try {
            execSync(`git remote set-url origin https://${process.env.GITHUB_TOKEN}@github.com/Arcticnime/arctics-marketplace.git`);
          } catch (err) {
            console.error('Git remote setup error:', err);
          }
        }

        try {
          execSync("git checkout main");
        } catch (e) {
          execSync("git checkout -b main");
        }

        // Stage and commit any existing changes first
        try {
          execSync("git add .");
          execSync('git commit -m "Staging changes"', { stdio: 'pipe' });
        } catch (err) {
          // Ignore commit errors if nothing to commit
          if (!err.stdout?.includes('nothing to commit')) {
            console.error('Commit error:', err);
          }
        }

        // Add and commit new changes
        execSync("git add index.html");
        execSync(`git add addons.json`);
        try {
          execSync(`git commit -m "Remove addon: ${title}"`, { stdio: 'pipe' });
        } catch (err) {
          if (!err.stdout?.includes('nothing to commit')) {
            throw err;
          }
        }
        
        // Try to push changes
        try {
          execSync("git push -u origin main");
        } catch (e) {
          console.error('Git push error:', e);
          // Continue even if git push fails
        }

        console.log(`Addon "${title}" removed from GitHub.`);

        // Send success message to user
        try {
          await interaction.editReply({
            content: `Successfully removed addon: "${title}".`,
            ephemeral: true
          });

          // Send embed to channel separately
          const embed = {
            title: `Addon Removed: ${title}`,
            color: 0xff4444,
            fields: [
              {
                name: 'Removed by',
                value: `<@${interaction.user.id}>`,
                inline: true
              }
            ],
            timestamp: new Date(),
            footer: {
              text: 'Arctics Marketplace'
            }
          };

          await interaction.channel.send({ embeds: [embed] }).catch(console.error);
        } catch (err) {
          console.error('Discord response error:', err);
        }
      } catch (error) {
        console.error("Error in removing addon:", error);
        try {
          await interaction.editReply({
            content: "Failed to remove addon.",
            ephemeral: true,
          });
        } catch (err) {
          console.error('Failed to send error response:', err);
        }
      }
    }
  } catch (error) {
    console.error('Failed to process command:', error);
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ 
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    } catch (e) {
      console.error('Failed to send error response:', e);
    }
  }
});

client.login(process.env.BOT_TOKEN);
