const {
	Client,
	Collection,
	GatewayIntentBits,
	Partials,
	ChannelType,
	ActionRowBuilder,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	ActivityType,
	ButtonBuilder,
	ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const request = require("request-promise");
const cron = require("node-cron");
const feishu = require("./feishu.js");
const logger = require("./logging/logger.js");
require("dotenv").config();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let files = fs.readdirSync("./"),
	file;

for (file of files) {
	if (file.startsWith("autoAdd")) {
		require("./" + file);
	}
}

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
	.readdirSync(commandsPath)
	.filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection
	// With the key as the command name and the value as the exported module
	client.commands.set(command.data.name, command);
}

let alreadyPressed = [];
let welcomeMessages;

client.on("ready", () => {
	logger.info(`Discord bot went online. Username: ${client.user.tag}`);
	client.user.setPresence({
		activities: [
			{
				name: `Project EVO`,
				type: ActivityType.Playing,
			},
		],
		status: `dnd`,
	});

	cron.schedule(
		"0 0 0,12 * * *",
		function () {
			logger.info(`Starting scheduled cronjob. (Every 12 hours)`);
			CCESDataCalculation();
			CECCheck();
			checkOldFiles();
		},
		{
			timezone: "Asia/Singapore",
		}
	);

	logger.info(`Deleting old bug reports.`);
	checkOldFiles();

	loadWelcomeMessages();

	// cron.schedule(
	// 	"0 */30 * * * *",
	// 	function () {
	// 		let newDate = new Date().toLocaleString("en-US", {
	// 			timeZone: "Asia/Singapore",
	// 		});
	// 		console.log(newDate + "\nChristmas event every 30 minutes...");
	// 		ChristmasEvent();
	// 	},
	// 	{
	// 		timezone: "Asia/Singapore",
	// 	}
	// );
});

client.on("interactionCreate", async (interaction) => {
	if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) return;

		try {
			await command.execute(interaction, client);
		} catch (error) {
			console.error(error);
			await interaction.editReply({
				content: "There was an error while executing this command!",
			});
		}
	} else if (interaction.isButton()) {
		if (interaction.customId === "creatorApply") {
			await interaction.deferReply({ ephemeral: true });
			const row = await platformMenu("platformSelectMenuApply");
			await interaction.editReply({
				content: `**In which social media do you publish content?**`,
				components: [row],
			});
		} else if (interaction.customId === "submitContent") {
			await interaction.deferReply({ ephemeral: true });
			const row = await platformMenu("platformSelectMenuSubmit");
			await interaction.editReply({
				content: `**Where do you publish the content?**`,
				components: [row],
			});
		} else if (interaction.customId === "suggestionSubmit") {
			await interaction.deferReply({ ephemeral: true });
			const suggestionSelectMenu = new StringSelectMenuBuilder()
				.setCustomId("suggestionSelectMenu")
				.setPlaceholder("Suggestion Category")
				.addOptions(
					{
						label: "Vehicle",
						value: "Vehicle",
					},
					{
						label: "Building",
						value: "Building",
					},
					{
						label: "Weather",
						value: "Weather",
					},
					{
						label: "Chat",
						value: "Chat",
					},
					{
						label: "Shooting",
						value: "Shooting",
					},
					{
						label: "Clan",
						value: "Clan",
					},
					{
						label: "Game Modes",
						value: "Game Modes",
					},
					{
						label: "Progression",
						value: "Progression",
					},
					{
						label: "Customization",
						value: "Customization",
					},
					{
						label: "Others",
						value: "Others",
					}
				);

			let row = new ActionRowBuilder().addComponents(suggestionSelectMenu);

			await interaction.editReply({
				content: `**Select Suggestion Category**`,
				components: [row],
			});
		} else if (interaction.customId === "betaAccess") {
			const betaModal = new ModalBuilder()
				.setCustomId("betaAccess")
				.setTitle("Beta Activation");

			const betaCode = new TextInputBuilder()
				.setCustomId("betaCode")
				.setLabel("Activation Code")
				.setPlaceholder("Please enter your Beta Activation Code here.")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			let firstQuestion = new ActionRowBuilder().addComponents(betaCode);

			betaModal.addComponents(firstQuestion);

			await interaction.showModal(betaModal).catch((error) => {
				console.error("Unknown Interaction: " + interaction.customId);
			});
		} else if (interaction.customId === "claimButton") {
			await interaction.deferReply();
			let dm;
			if (interaction.channel.type === ChannelType.DM) {
				dm = true;
			} else {
				dm = false;
			}
			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let records = await feishu.getRecords(
				tenantToken,
				process.env.REWARD_BASE,
				process.env.DELIVERY,
				`AND(CurrentValue.[Discord ID] = "${interaction.user.id}",(CurrentValue.[Status] = "Sent"))`
			);
			if (!parseInt(JSON.parse(records).data.total)) {
				return await interaction.message.edit({
					content: interaction.message.content,
					components: [],
				});
			}
			let record_id = JSON.parse(records).data.items[0].record_id;
			await feishu.updateRecord(
				tenantToken,
				process.env.REWARD_BASE,
				process.env.DELIVERY,
				record_id,
				{ fields: { Status: "Claimed" } }
			);

			await interaction.editReply({
				content: "Your reward has been marked as **Claimed**.",
			});

			await interaction.message.edit({
				content: interaction.message.content,
				components: [],
			});

			if (!dm) {
				const thread = interaction.channel;
				await thread.members.remove(interaction.user.id);
				await thread.setArchived(true);
				await client.channels
					.fetch(process.env.COLLECT_REWARDS_CHANNEL)
					.then((channel) => {
						channel.permissionOverwrites.delete(
							interaction.user,
							"Claimed Reward"
						);
					});
			}

			return;
		} else if (interaction.customId === "bpButton") {
			await interaction.deferReply({ ephemeral: true });
			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_BENEFIT,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			let benefit_level;

			if (response.data.total == 0) {
				benefit_level = "NA";
			} else benefit_level = response.data.items[0].fields["Benefit Level"];

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_DATA,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			let bp_amount = 0;
			let bp_costed = 0;

			if (response.data.total != 0) {
				bp_amount = parseInt(response.data.items[0].fields["Final BP Amount"]);
				bp_costed = parseInt(response.data.items[0].fields["BP Costed"]);
			}

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEP_SUBMISSION,
					`AND(CurrentValue.[Discord ID] = "${interaction.user.id}", CurrentValue.[Submission Date] >= DATE(2022,12,1))`
				)
			);
			let total_views = 0,
				total_videos = 0,
				total_invalid = 0;

			if (response.data.total) {
				total_videos = response.data.items.length;
				for (const records of response.data.items) {
					records.fields["Views"] == undefined
						? (total_views += 0)
						: (total_views += parseInt(records.fields["Views"]));
					if (records.fields["Validity"] != "VALID") total_invalid++;
				}
			}

			await interaction.editReply({
				content: `**Benefit Level** ${benefit_level}\n**Total Views** ${total_views}\n**Total Videos** ${total_videos}\n**Invalid Videos** ${total_invalid}\n**BP Amount** ${bp_amount}\n**BP Costed** ${bp_costed}`,
			});
		} else if (interaction.customId === "cecButton") {
			const cecModal = new ModalBuilder()
				.setCustomId("cecModal")
				.setTitle("CEC Application");

			const cecChannel = new TextInputBuilder()
				.setCustomId("cecChannel")
				.setLabel("YOUR YOUTUBE CHANNEL LINK")
				.setPlaceholder("http://youtube.com/c/PROJECTEVOGAME")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const cecSubscribers = new TextInputBuilder()
				.setCustomId("cecSubscribers")
				.setLabel("NUMBER OF SUBSCRIBERS")
				.setPlaceholder("Ex: 1000, 2000, 3000, etc.")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const cecQuanity = new TextInputBuilder()
				.setCustomId("cecQuanity")
				.setLabel("EVO VIDEOS YOU CAN MAKE PER WEEK")
				.setPlaceholder("Ex: 1, 2, 3, 4, 5, 6, 7...")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const cecReason = new TextInputBuilder()
				.setCustomId("cecReason")
				.setLabel("REASON TO JOIN THE CLUB")
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true);

			let firstQuestion = new ActionRowBuilder().addComponents(cecChannel);
			let secondQuestion = new ActionRowBuilder().addComponents(cecSubscribers);
			let thirdQuestion = new ActionRowBuilder().addComponents(cecQuanity);
			let fourthQuestion = new ActionRowBuilder().addComponents(cecReason);

			cecModal.addComponents(
				firstQuestion,
				secondQuestion,
				thirdQuestion,
				fourthQuestion
			);
			await interaction.showModal(cecModal);
		} else if (interaction.customId.startsWith("lfg")) {
			await interaction.deferReply({ ephemeral: true });
			let lfgNARole = "1034446183143321680";
			let lfgEURole = "1047746665152516167";
			let lfgSEARole = "1047745982307258399";

			let lfgRole;

			switch (interaction.customId) {
				case "lfgNAButton":
					lfgRole = lfgNARole;
					break;
				case "lfgEUButton":
					lfgRole = lfgEURole;
					break;
				case "lfgSEAButton":
					lfgRole = lfgSEARole;
					break;
				default:
					lfgRole = lfgNARole;
					break;
			}

			let haslfgNARole = await checkMemberRole(
				client,
				process.env.EVO_SERVER,
				interaction.user.id,
				lfgNARole
			);

			let haslfgEURole = await checkMemberRole(
				client,
				process.env.EVO_SERVER,
				interaction.user.id,
				lfgEURole
			);

			let haslfgSEARole = await checkMemberRole(
				client,
				process.env.EVO_SERVER,
				interaction.user.id,
				lfgSEARole
			);

			if (haslfgNARole || haslfgEURole || haslfgSEARole) {
				await interaction.member.roles.remove(
					lfgNARole,
					"User requested different LFG role."
				);
				await interaction.member.roles.remove(
					lfgEURole,
					"User requested different LFG role."
				);
				await interaction.member.roles.remove(
					lfgSEARole,
					"User requested different LFG role."
				);
			}

			await interaction.member.roles.add(lfgRole, "User requested LFG role.");

			await interaction.editReply({
				content: "You have unlocked your region's LFG channel!",
			});
		} else if (interaction.customId === "clubButton") {
			await interaction.deferReply({ ephemeral: true });
			await interaction.member.roles.add(process.env.VERIFIED_ROLE).then(() => {
				interaction.editReply({
					content: `Your club membership is granted! Please read <#${process.env.BENEFIT_CHANNEL}> to learn about what benefits you can get access to. Don't forget to say hi in <#${process.env.CHAT_CHANNEL}> and meet other creators!`,
				});
			});
		} else if (interaction.customId === "linkButton") {
			await interaction.deferReply({ ephemeral: true });
			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_LINK,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			if (parseInt(response.data.total)) {
				return await interaction.editReply({
					content: `Your unique link is:\n\`${response.data.items[0].fields.Link}\``,
				});
			} else {
				response = JSON.parse(
					await feishu.getRecords(
						tenantToken,
						process.env.CEP_BASE,
						process.env.CEC_LINK,
						`NOT(CurrentValue.[Status] = "Claimed")`
					)
				);

				if (parseInt(response.data.total)) {
					await feishu.updateRecord(
						tenantToken,
						process.env.CEP_BASE,
						process.env.CEC_LINK,
						response.data.items[0].record_id,
						{
							fields: {
								"Discord ID": interaction.user.id,
								"Discord Name": interaction.user.tag,
								Status: "Claimed",
							},
						}
					);
					await interaction.editReply({
						content: `Your unique link is:\n\`${response.data.items[0].fields.Link}\``,
					});
				} else {
					await interaction.editReply({
						content: `No link found. Please contact **Simon#0988**.`,
					});
				}
			}
		} else if (interaction.customId === "afcButton") {
			await interaction.deferReply({ ephemeral: true });

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_CODE,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			if (response.data.total) {
				let submissionDate =
					parseInt(
						response.data.items[response.data.items.length - 1].fields[
							"Submission Date"
						]
					) / 1000;

				if (Date.now() / 1000 - submissionDate < 2592000) {
					return await interaction.editReply({
						content: "You can only apply once every 30 days.",
					});
				}
			}

			let finalData = {
				"Discord ID": interaction.user.id,
				"Discord Name": interaction.user.tag,
				"YouTube Channel": {
					text: "NA",
					link: "NA",
				},
				Subscribers: 0,
				"Benefit Level": "NA",
				"Valid Views": 0,
				"Valid Videos": 0,
			};

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_BENEFIT,
					`CurrentValue.[Discord ID] = "${finalData["Discord ID"]}"`
				)
			);
			if (parseInt(response.data.total)) {
				if (response.data.items[0].fields["Benefit Level"] != undefined)
					finalData["Benefit Level"] =
						response.data.items[0].fields["Benefit Level"];
			}

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CCES_DATA,
					`CurrentValue.[Discord ID] = "${finalData["Discord ID"]}"`
				)
			);
			if (parseInt(response.data.total)) {
				finalData["Valid Views"] = parseInt(
					response.data.items[0].fields["Valid Views"]
				);
				finalData["Valid Videos"] = parseInt(
					response.data.items[0].fields["Valid Videos"]
				);
			}

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_APP,
					`CurrentValue.[Discord ID] = "${finalData["Discord ID"]}"`
				)
			);
			if (parseInt(response.data.total)) {
				finalData["YouTube Channel"].text =
					response.data.items[0].fields["Youtube Channel"].text;
				finalData["YouTube Channel"].link =
					response.data.items[0].fields["Youtube Channel"].link;
				finalData["Subscribers"] = parseInt(
					response.data.items[0].fields["Subscribers"]
				);
			}

			let success = await feishu.createRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEC_CODE,
				{ fields: finalData }
			);
			if (success)
				await interaction.editReply({
					content: "You have successfully applied for codes.",
				});
			else
				await interaction.editReply({
					content: "An error has occured. Please contact **Simon#0988**.",
				});
		} else if (interaction.customId === "sdButton") {
			const sdModal = new ModalBuilder()
				.setCustomId("sdModal")
				.setTitle("7 Day Survival Challenge");

			const sdTOS1 = new TextInputBuilder()
				.setCustomId("sdTOS1")
				.setLabel("Have you read the requirements carefully?")
				.setPlaceholder("Yes/No")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdTOS2 = new TextInputBuilder()
				.setCustomId("sdTOS2")
				.setLabel("Do you fully understand the requirement?")
				.setPlaceholder("Yes/No")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdJob = new TextInputBuilder()
				.setCustomId("sdJob")
				.setLabel("Do you want to stream or make videos?")
				.setPlaceholder("Stream/Videos/Both")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdChannel = new TextInputBuilder()
				.setCustomId("sdChannel")
				.setLabel("YOUR YOUTUBE CHANNEL LINK")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdSubscribers = new TextInputBuilder()
				.setCustomId("sdSubscribers")
				.setLabel("THE AMOUNT OF SUBSCRIBERS")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			let firstQuestion = new ActionRowBuilder().addComponents(sdTOS1);
			let secondQuestion = new ActionRowBuilder().addComponents(sdTOS2);
			let thirdQuestion = new ActionRowBuilder().addComponents(sdJob);
			let fourthQuestion = new ActionRowBuilder().addComponents(sdChannel);
			let fifthQuestion = new ActionRowBuilder().addComponents(sdSubscribers);

			sdModal.addComponents(
				firstQuestion,
				secondQuestion,
				thirdQuestion,
				fourthQuestion,
				fifthQuestion
			);
			await interaction.showModal(sdModal);
		} else if (interaction.customId === "sdButton2") {
			const sdModal2 = new ModalBuilder()
				.setCustomId("sdModal2")
				.setTitle("7 Day Survival Challenge");

			const sdRegion = new TextInputBuilder()
				.setCustomId("sdRegion")
				.setLabel("Region")
				.setPlaceholder("Enter your region")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdRoleName = new TextInputBuilder()
				.setCustomId("sdRoleName")
				.setLabel("Role Name")
				.setPlaceholder("Enter your role name")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdRoldId = new TextInputBuilder()
				.setCustomId("sdRoleId")
				.setLabel("Role ID")
				.setPlaceholder("Open you profile and you can find your Role ID")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			const sdSessionId = new TextInputBuilder()
				.setCustomId("sdSessionId")
				.setLabel("Session ID")
				.setPlaceholder("The new session you start for the challenge")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			let firstQuestion = new ActionRowBuilder().addComponents(sdRegion);
			let secondQuestion = new ActionRowBuilder().addComponents(sdRoleName);
			let thirdQuestion = new ActionRowBuilder().addComponents(sdRoldId);
			let fourthQuestion = new ActionRowBuilder().addComponents(sdSessionId);

			sdModal2.addComponents(
				firstQuestion,
				secondQuestion,
				thirdQuestion,
				fourthQuestion
			);
			await interaction.showModal(sdModal2);
		} else if (interaction.customId === "christmasButton") {
			await interaction.reply({
				content: "Checking if you are on Santa's list...",
				ephemeral: true,
			});
			let messageId = interaction.message.id;
			let discordId = interaction.user.id;

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.INVENTORY_BASE,
					process.env.PLAYER_INVENTORIES,
					`AND(CurrentValue.[Discord ID] = "${discordId}", CurrentValue.[Valid] = 1)`
				)
			);
			if (parseInt(response.data.total) >= 5)
				return await interaction.editReply(
					"You have already claimed 5 gifts today!\nYou can use </inventory:1054617458679496764> to check your inventory."
				);

			await interaction.editReply({
				content: "Receiving your gift from Santa...",
			});

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.INVENTORY_BASE,
					process.env.PLAYER_INVENTORIES,
					`AND(CurrentValue.[Discord ID] = "${discordId}", CurrentValue.[Interaction ID] = "${messageId}")`
				)
			);
			if (
				parseInt(response.data.total) >= 1 ||
				alreadyPressed.includes(discordId)
			)
				return await interaction.editReply(
					"You have already claimed this gift!\nYou can use </inventory:1054617458679496764> to check your inventory."
				);

			alreadyPressed.push(discordId);

			await interaction.editReply({
				content: "Baking some cookies for Santa...",
			});

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.INVENTORY_BASE,
					process.env.PLAYER_INVENTORIES,
					`AND(CurrentValue.[Discord ID] = "${discordId}", CurrentValue.[Event] = "Christmas 2022", CurrentValue.[Valid] = 1, CurrentValue.[Item] = "⭐")`
				)
			);
			if (parseInt(response.data.total) >= 1)
				return await interaction.editReply(
					"**❄️ Merry Christmas ❄️**\n*You have received the maximum number of rewards from this event. Thank you for taking part! You will be messaged soon with your prize. Please keep your DMs open.\nYou can use </inventory:1054617458679496764> to check your inventory.*"
				);

			await interaction.editReply({
				content: "Baking some cookies for Santa...",
			});

			response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.INVENTORY_BASE,
					process.env.REWARD_POOL,
					'AND(CurrentValue.[Event] = "Christmas 2022", CurrentValue.[Valid] = 1)'
				)
			);

			await interaction.editReply({ content: "Opening your gift..." });

			let items = response.data.items[0].fields["Items"];
			let randomItem = items[Math.floor(Math.random() * items.length)];

			let success = await feishu.createRecord(
				tenantToken,
				process.env.INVENTORY_BASE,
				process.env.PLAYER_INVENTORIES,
				{
					fields: {
						"Discord ID": interaction.user.id,
						"Discord Name": interaction.user.tag,
						Item: randomItem,
						Event: "Christmas 2022",
						Valid: true,
						"Interaction ID": messageId,
					},
				}
			);

			if (success)
				await interaction.editReply({
					content:
						"You opened the gift and received...\n\n" +
						randomItem +
						"\n\nYou can use </inventory:1054617458679496764> to check your inventory.",
				});
			else
				await interaction.editReply({
					content: "An error has occured. Please contact **Simon#0988**.",
				});
		} else if (interaction.customId.startsWith("ecc")) {
			await interaction.deferReply({ ephemeral: true });
			const type = interaction.customId.substring(3);
			switch (type) {
				case "Join":
					const checkECCRole = await checkMemberRole(
						client,
						process.env.EVO_SERVER,
						interaction.user.id,
						process.env.ECC_ROLE
					);
					if (!checkECCRole) {
						await interaction.member.roles
							.add(process.env.ECC_ROLE)
							.then(() => {
								interaction.editReply({
									content: `**Hi, welcome to join EVO Creator Competition! **\n\n**Here is what to do next:**\n1. Choose the content direction and decide the topic.\n2. Before you get started, ask advice for your topic on <#${process.env.ECC_CHANNEL}>.\n3. Make videos.\n4. Submit videos via <#${process.env.SUBMIT_CONTENT_CHANNEL}>, and choose the relevant topic.\n\n**We provide support!**\n1. We have released the latest <#${process.env.VIDEO_GUIDE_CHANNEL}>.\n2. Access to high-quality art material via <#${process.env.MEDIA_KIT_CHANNEL}>.\n3. Ask for advice from <@${process.env.VOID_ID}>.`,
								});
							});
					} else
						await interaction.editReply({
							content: `**Hi, you are already a part of EVO Creator Competition! **\n\n**Here is what to do next:**\n1. Choose the content direction and decide the topic.\n2. Before you get started, ask advice for your topic on <#${process.env.ECC_CHANNEL}>.\n3. Make videos.\n4. Submit videos via <#${process.env.SUBMIT_CONTENT_CHANNEL}>, and choose the relevant topic.\n\n**We provide support!**\n1. We have released the latest <#${process.env.VIDEO_GUIDE_CHANNEL}>.\n2. Access to high-quality art material via <#${process.env.MEDIA_KIT_CHANNEL}>.\n3. Ask for advice from <@${process.env.VOID_ID}>.`,
						});
					break;
				case "Apply":
					const discordId = interaction.user.id;
					const userName = interaction.user.tag;
					const tenantToken = await feishu.authorize(
						process.env.FEISHU_ID,
						process.env.FEISHU_SECRET
					);

					const response = JSON.parse(
						await feishu.getRecords(
							tenantToken,
							process.env.CEP_BASE,
							process.env.ECC_JUDGE,
							`CurrentValue.[Discord ID] = "${discordId}"`
						)
					);

					if (response.data.total) {
						await interaction.editReply({
							content: "You can only apply once.",
						});
						break;
					}

					const rolesToCheck = [
						process.env.MOD_ROLE,
						process.env.CC_ROLE,
						process.env.LVL_FIVE_ROLE,
						process.env.LVL_TEN_ROLE,
						process.env.LVL_TWENTY_ROLE,
						process.env.LVL_THIRTY_ROLE,
						process.env.LVL_FIFTY_ROLE,
						process.env.LION_HERO_ROLE,
					];

					const userRoles = await checkRoles(
						interaction,
						discordId,
						rolesToCheck
					);

					let roleString = [];

					for (const roleId of userRoles) {
						let role = interaction.guild.roles.cache.get(roleId);
						roleString.push(role.name);
					}

					const success = await feishu.createRecord(
						tenantToken,
						process.env.CEP_BASE,
						process.env.ECC_JUDGE,
						{
							fields: {
								"Discord ID": discordId,
								"Discord Name": userName,
								Roles: roleString,
							},
						}
					);

					if (success) await interaction.editReply({ content: "Applied!" });
					else
						await interaction.editReply({
							content: "An error has occured. Please contact **Simon#0988**.",
						});
				// Send feishu notification
			}
		}
	} else if (interaction.isModalSubmit()) {
		if (interaction.customId === "betaAccess") {
			await interaction
				.reply({
					content:
						"Checking for Beta Access on " + interaction.user.tag + "...",
					ephemeral: true,
				})
				.catch(console.error);
			const activationCode = interaction.fields.getTextInputValue("betaCode");
			const tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let records = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_ONE,
					`AND(CurrentValue.[Codes] = "${activationCode}",NOT(CurrentValue.[Status] = "Binded"))`
				)
			);

			let records2 = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_TWO,
					`AND(CurrentValue.[Codes] = "${activationCode}",NOT(CurrentValue.[Status] = "Binded"))`
				)
			);

			let records3 = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_THREE,
					`AND(CurrentValue.[Codes] = "${activationCode}",NOT(CurrentValue.[Status] = "Binded"))`
				)
			);

			let records4 = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_FOUR,
					`AND(CurrentValue.[Codes] = "${activationCode}",NOT(CurrentValue.[Status] = "Binded"))`
				)
			);

			let records5 = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_FIVE,
					`AND(CurrentValue.[Codes] = "${activationCode}",NOT(CurrentValue.[Status] = "Binded"))`
				)
			);

			if (parseInt(records.data.total)) {
				let recordId = records.data.items[0].record_id;
				await feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_ONE,
					recordId,
					{
						fields: {
							"Discord ID": interaction.user.id,
							Status: "Binded",
						},
					}
				);

				await interaction.member.roles.add("1032238398829768735").then(() => {
					interaction.editReply({
						content: "Congrats! <#1018243733373866004> channels are unlocked!",
					});
				});
			} else if (parseInt(records2.data.total)) {
				let recordId = records2.data.items[0].record_id;
				await feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_TWO,
					recordId,
					{
						fields: {
							"Discord ID": interaction.user.id,
							Status: "Binded",
						},
					}
				);

				await interaction.member.roles.add("1032238398829768735").then(() => {
					interaction.editReply({
						content: "Congrats! <#1018243733373866004> channels are unlocked!",
					});
				});
			} else if (parseInt(records3.data.total)) {
				let recordId = records3.data.items[0].record_id;
				await feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_THREE,
					recordId,
					{
						fields: {
							"Discord ID": interaction.user.id,
							Status: "Binded",
						},
					}
				);

				await interaction.member.roles.add("1032238398829768735").then(() => {
					interaction.editReply({
						content: "Congrats! <#1018243733373866004> channels are unlocked!",
					});
				});
			} else if (parseInt(records4.data.total)) {
				let recordId = records4.data.items[0].record_id;
				await feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_FOUR,
					recordId,
					{
						fields: {
							"Discord ID": interaction.user.id,
							Status: "Binded",
						},
					}
				);

				await interaction.member.roles.add("1032238398829768735").then(() => {
					interaction.editReply({
						content: "Congrats! <#1018243733373866004> channels are unlocked!",
					});
				});
			} else if (parseInt(records5.data.total)) {
				let recordId = records5.data.items[0].record_id;
				await feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.BETA_TESTER_FIVE,
					recordId,
					{
						fields: {
							"Discord ID": interaction.user.id,
							Status: "Binded",
						},
					}
				);

				await interaction.member.roles.add("1032238398829768735").then(() => {
					interaction.editReply({
						content: "Congrats! <#1018243733373866004> channels are unlocked!",
					});
				});
			} else
				await interaction.editReply({
					content:
						"Invalid activation code. You haven't applied for the beta, click [here]( https://survey.isnssdk.com/q/51928/2lo2I2z9/d971) to sign-up!\nWe will draw 3300+ extra lucky players to get Beta access codes every Tuesday from 29th Nov 2022 by email.",
				});
		} else if (interaction.customId.startsWith("ca")) {
			await interaction.deferReply({ ephemeral: true });

			const channel = interaction.fields.getTextInputValue(
				"creatorModalChannel"
			);
			const subs = interaction.fields.getTextInputValue("creatorModalSubs");
			const subCount = parseInt(onlyDigits(subs));
			const platform = checkPlatform(interaction.customId.substring(2, 4));
			const region = checkRegion(interaction.customId.substring(4));

			if (!checkURL(channel)) {
				return await interaction.editReply({
					content: `\`${channel}\`\nPlease enter a **valid ${platform}** link.`,
				});
			}

			/*if (c2.length < 4 || subCount < 1000 || isNaN(subCount)) {
				return await interaction.editReply({
					content: `\`${c2}\`\nPlease read the **Requirements** in <#1018239078094880908> for the number of subscribers needed.`,
				});
			}*/

			let creators = {
				fields: {
					"Discord ID": interaction.user.id,
					"Discord Name": interaction.user.tag,
					Platform: platform,
					Region: region,
					Channel: {
						text: channel,
						link: channel,
					},
					Subscribers: subCount,
				},
			};

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = await feishu.getRecords(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEP_APP,
				`CurrentValue.[Discord ID] = "${interaction.user.id}"`
			);
			response = JSON.parse(response);

			if (response.data.total) {
				let submissionDate =
					parseInt(
						response.data.items[response.data.items.length - 1].fields[
							"Submission Date"
						]
					) / 1000;

				if (Date.now() / 1000 - submissionDate < 2592000) {
					return await interaction.editReply({
						content: "You can only submit once every 30 days.",
					});
				}
			}

			let success = await feishu.createRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEP_APP,
				creators
			);

			if (success) {
				await interaction.editReply({
					content: "Your application has been submitted successfully.",
				});
			} else {
				await interaction.editReply({
					content:
						"An error occurred. Please try again later or contact **Simon#0988**.",
				});
			}
		} else if (interaction.customId.startsWith("sc")) {
			await interaction.deferReply({ ephemeral: true });

			let videoURL = interaction.fields.getTextInputValue("submitVideo");
			const theme = interaction.fields.getTextInputValue("submitTheme");
			const platform = checkPlatform(interaction.customId.substring(2, 4));
			const topic = interaction.customId.substring(4);

			if (!checkURL(videoURL)) {
				return await interaction.editReply({
					content: `\`${videoURL}\`\nPlease enter a valid link. If you have \`www\` in your link, please remove it.`,
				});
			} else if (videoURL.includes("youtube")) {
				let url = new URL(videoURL);
				let videoId = url.searchParams.get("v");
				let modifiedUrl = `https://www.youtube.com/watch?v=${videoId}`;
				videoURL = modifiedUrl;
			} else if (videoURL.includes("youtu.be")) {
				let videoId = videoURL.split("/").pop().split("?")[0];
				let modifiedUrl = `https://youtu.be/${videoId}`;
				videoURL = modifiedUrl;
			}

			let content = {
				fields: {
					"Discord ID": interaction.user.id,
					"Discord Name": interaction.user.tag,
					Video: {
						text: videoURL,
						link: videoURL,
					},
					"Video Platform": platform,
					Theme: theme,
					Topic: topic,
					"Submission Date": Date.now(),
				},
			};

			let hasCECRole = await checkMemberRole(
				client,
				process.env.EVO_SERVER,
				interaction.user.id,
				process.env.CEC_MEMBER_ROLE
			);

			if (interaction.guild.id == "1042081538784903278" || hasCECRole) {
				content.fields["CEC Member"] = "CEC Member";
			} else {
				content.fields["CEC Member"] = "NO";
			}

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let submissions = await feishu.getRecords(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEP_SUBMISSION,
				`CurrentValue.[Video] = "${videoURL}"`
			);
			submissions = JSON.parse(submissions);
			if (submissions.data.total)
				return await interaction.editReply({
					content:
						"This video has already been submitted by a user. Duplicate video submissions are not allowed.",
				});

			let success = await feishu.createRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEP_SUBMISSION,
				content
			);

			if (success) {
				await interaction.editReply({
					content: "Your application has been submitted successfully.",
				});
			} else {
				await interaction.editReply({
					content:
						"An error occurred. Please try again later or contact **Simon#0988**.",
				});
			}
		} else if (interaction.customId.startsWith("bug_")) {
			await interaction.deferReply({ ephemeral: true });

			let bUsername = interaction.fields.getTextInputValue("bugUsername");
			let bPhone = interaction.fields.getTextInputValue("bugPhone");
			let bDetails = interaction.fields.getTextInputValue("bugDetails");
			let bUserId = interaction.user.id;
			let bSession = interaction.fields.getTextInputValue("bugSession");
			//let bRegion = interactionRegionRole(interaction);
			let bCategory = interaction.customId.substring(4);

			let file = `${interaction.user.id}-bug.jpg`;
			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let response = await feishu.uploadToDrive(
				tenantToken,
				process.env.EA1_BASE,
				file,
				"bitable_image"
			);
			let file_token = JSON.parse(response).data.file_token;

			let bugs = {
				fields: {
					//Username: bUsername,
					//Region: bRegion,
					"Discord ID": bUserId,
					"Discord Name": interaction.user.tag,
					Nickname: bUsername,
					"Session ID": bSession,
					"Bug Details": bDetails,
					Channel: "Discord",
					"Phone Model": bPhone,
					"Bug Type": bCategory,
					Screenshot: [{ file_token: file_token }],
				},
			};

			await feishu.createRecord(
				tenantToken,
				process.env.EA1_BASE,
				process.env.BUGS,
				bugs
			);
			response = await feishu.getFileToken(tenantToken, file);
			let image_key = JSON.parse(response).data.image_key;
			fs.unlinkSync(file);

			let body = {
				msg_type: "interactive",
				card: {
					config: {
						wide_screen_mode: true,
					},
					elements: [
						{
							fields: [
								{
									is_short: true,
									text: {
										content: `**Discord ID**\n${bugs.fields["Discord ID"]}`,
										tag: "lark_md",
									},
								},
								{
									is_short: true,
									text: {
										content: `**Discord Name**\n${interaction.user.tag}`,
										tag: "lark_md",
									},
								},
								// {
								//     is_short: true,
								//     text: {
								//         content: `**Region**\n${bugs.fields["Region"]}`,
								//         tag: "lark_md",
								//     },
								// },
								{
									is_short: false,
									text: {
										content: ``,
										tag: "lark_md",
									},
								},
								{
									is_short: true,
									text: {
										content: `**Nickname**\n${bugs.fields.Nickname}`,
										tag: "lark_md",
									},
								},
								{
									is_short: true,
									text: {
										content: `**Phone**\n${bugs.fields["Phone Model"]}`,
										tag: "lark_md",
									},
								},
								{
									is_short: true,
									text: {
										content: `**Session ID**\n${bugs.fields["Session ID"]}`,
										tag: "lark_md",
									},
								},
								{
									is_short: false,
									text: {
										content: ``,
										tag: "lark_md",
									},
								},
								{
									is_short: true,
									text: {
										content: `**Bug Details**\n${bugs.fields["Bug Details"]}`,
										tag: "lark_md",
									},
								},
							],
							tag: "div",
						},
						{
							tag: "hr",
						},
						{
							alt: {
								content: "",
								tag: "plaint_text",
							},
							img_key: image_key,
							tag: "img",
						},
					],
					header: {
						template: "red",
						title: {
							content: `${bugs.fields["Bug Type"]}`,
							tag: "plain_text",
						},
					},
				},
			};

			await feishu.sendGroupMessage(
				"https://open.larksuite.com/open-apis/bot/v2/hook/bf335c2b-2b3d-46e7-a181-8badecf95c56",
				body
			);
			await interaction.editReply({
				content: "Your submission was received successfully!",
			});
		} else if (
			interaction.customId === "Vehicle" ||
			interaction.customId === "Building" ||
			interaction.customId === "Weather" ||
			interaction.customId === "Chat" ||
			interaction.customId === "Shooting" ||
			interaction.customId === "Clan" ||
			interaction.customId === "Game Modes" ||
			interaction.customId === "Progression" ||
			interaction.customId === "Customization" ||
			interaction.customId === "Others"
		) {
			await interaction.deferReply({ ephemeral: true });

			let suggestionCategory = interaction.customId;
			let suggestionDetails =
				interaction.fields.getTextInputValue("suggestionDetails");

			await interaction.editReply({
				content: "Your submission was received successfully!",
			});

			const suggestionEmbed = new EmbedBuilder()
				.setTitle(suggestionCategory)
				.setDescription(interaction.user.id)
				.setAuthor({ name: `Suggestion by ${interaction.user.tag}` })
				.addFields(
					{ name: "Feedback details", value: suggestionDetails },
					{
						name: "Players Region",
						value: interactionRegionRole(interaction),
					}
				)
				.setTimestamp();

			await client.channels
				.fetch("1039229404892647545")
				.then((channel) => channel.send({ embeds: [suggestionEmbed] }))
				.then((sentMessage) => {
					sentMessage.react("✅").then(() => sentMessage.react("❌"));
				});
		} else if (interaction.customId === "cecModal") {
			await interaction.deferReply({ ephemeral: true });

			let youtubeChannel = interaction.fields.getTextInputValue("cecChannel");
			let subscribers = interaction.fields.getTextInputValue("cecSubscribers");
			let quantity = interaction.fields.getTextInputValue("cecQuanity");
			let reason = interaction.fields.getTextInputValue("cecReason");

			let videoCount = parseInt(onlyDigits(quantity));
			let subscriberCount = parseInt(onlyDigits(subscribers));

			if (!checkURL(youtubeChannel)) {
				return await interaction.editReply({
					content: `\`${youtubeChannel}\`\nPlease enter a **valid YouTube** link.`,
				});
			}

			if (isNaN(videoCount)) {
				return await interaction.editReply({
					content: `\`${videoCount}\`\nPlease enter a number and try again.`,
				});
			}
			if (isNaN(subscriberCount)) {
				return await interaction.editReply({
					content: `\`${subscriberCount}\`\nPlease enter a number and try again.`,
				});
			}

			let record = {
				fields: {
					"Discord ID": interaction.user.id,
					"Discord Name": interaction.user.tag,
					"Youtube Channel": {
						text: youtubeChannel,
						link: youtubeChannel,
					},
					Subscribers: subscriberCount,
					"Videos per Week": videoCount,
					Motivation: reason,
				},
			};

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.CEC_APP,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			if (response.data.total) {
				let submissionDate =
					parseInt(
						response.data.items[response.data.items.length - 1].fields[
							"Submission Date"
						]
					) / 1000;

				if (Date.now() / 1000 - submissionDate < 2592000) {
					return await interaction.editReply({
						content: "You can only submit once every 30 days.",
					});
				}
			}

			/*let response = await feishu.getRecords(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CCES_DATA,
				`CurrentValue.[Discord ID] = "${interaction.user.id}"`
			);
			response = JSON.parse(response);
			if (!response.data.total) {
				return await interaction.editReply({
					content: `Sorry, you didn't meet the requirement, the application failed. If you have submitted the required amount of videos and the total views have reached 10,000. Please ask for help in <#1036471894016278619> channel.`,
				});
			} else {
				let views = parseInt(response.data.items[0].fields["Valid Views"]);
				let videos = parseInt(response.data.items[0].fields["Valid Videos"]);

				if (views < 10000 || videos < 3) {
					return await interaction.editReply({
						content: `Sorry, you didn't meet the requirement, the application failed. If you have submitted the required amount of videos and the total views have reached 10,000. Please ask for help in <#1036471894016278619> channel.`,
					});
				}
			}*/

			let success = await feishu.createRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEC_APP,
				record
			);

			if (success) {
				await interaction.editReply({
					content: "Your application has been submitted successfully.",
				});
			} else {
				await interaction.editReply({
					content:
						"An error occurred. Please try again later or contact **Simon#0988**.",
				});
			}
		} else if (interaction.customId === "sdModal") {
			await interaction.deferReply({ ephemeral: true });

			let tos1 = interaction.fields.getTextInputValue("sdTOS1");
			let tos2 = interaction.fields.getTextInputValue("sdTOS2");
			let job = interaction.fields.getTextInputValue("sdJob");
			let youtubeChannel = interaction.fields.getTextInputValue("sdChannel");
			let subscribers = parseInt(
				onlyDigits(interaction.fields.getTextInputValue("sdSubscribers"))
			);

			if (tos1.toLowerCase() != "yes" || tos2.toLowerCase() != "yes") {
				return await interaction.editReply({
					content: "You must agree to the requirements before proceeding.",
				});
			}

			if (!checkURL(youtubeChannel)) {
				return await interaction.editReply({
					content: `\`${youtubeChannel}\`\nPlease enter a **valid YouTube** link.`,
				});
			}

			if (isNaN(subscribers)) {
				return await interaction.editReply({
					content: `\`${subscribers}\`\nPlease enter a number and try again.`,
				});
			}

			let record = {
				fields: {
					"Discord ID": interaction.user.id,
					"Discord Name": interaction.user.tag,
					"YouTube Channel": {
						text: youtubeChannel,
						link: youtubeChannel,
					},
					Subscribers: subscribers,
					Job: job,
				},
			};

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.SEVEN_DAY,
					`CurrentValue.[Discord ID] = "${interaction.user.id}"`
				)
			);

			if (response.data.total) {
				return await interaction.editReply({
					content: "You can only sign up once.",
				});
			}

			let success = await feishu.createRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.SEVEN_DAY,
				record
			);

			if (success) {
				await interaction.editReply({
					content:
						"You have signed up successfully. The staff will contact you within 48 hours if your application is approved. There might not be a response if it fails.",
				});
			} else {
				await interaction.editReply({
					content:
						"An error occurred. Please try again later or contact **Simon#0988**.",
				});
			}
		} else if (interaction.customId === "sdModal2") {
			await interaction.deferReply({ ephemeral: true });

			let region = interaction.fields.getTextInputValue("sdRegion");
			let roleName = interaction.fields.getTextInputValue("sdRoleName");
			let roleId = interaction.fields.getTextInputValue("sdRoleId");
			let sessionId = interaction.fields.getTextInputValue("sdSessionId");
			let discordId = interaction.user.id;

			let record = {
				fields: {
					Region: region,
					"Role Name": roleName,
					"Role ID": roleId,
					"Session ID": sessionId,
				},
			};

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			let response = JSON.parse(
				await feishu.getRecords(
					tenantToken,
					process.env.CEP_BASE,
					process.env.SEVEN_DAY,
					`CurrentValue.[Discord ID] = "${discordId}"`
				)
			);

			if (!response.data.total) {
				return await interaction.editReply({
					content: "You are not signed up.",
				});
			}

			let recordId = response.data.items[0].record_id;

			await feishu.updateRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.SEVEN_DAY,
				recordId,
				record
			);

			await interaction.editReply({
				content: "You have successfully submitted your information.",
			});
		}
	} else if (interaction.isStringSelectMenu()) {
		if (interaction.customId.startsWith("suggestionSelectMenu")) {
			let selection = interaction.values[0];
			const suggestionModal = new ModalBuilder().setCustomId(selection);
			suggestionModal.setTitle(selection);
			const suggestionDetails = new TextInputBuilder()
				.setCustomId("suggestionDetails")
				.setLabel("Suggestion Details")
				.setPlaceholder("Explain the suggestion here.")
				.setStyle(TextInputStyle.Paragraph);

			let firstQuestion = new ActionRowBuilder().addComponents(
				suggestionDetails
			);

			suggestionModal.addComponents(firstQuestion);

			await interaction.showModal(suggestionModal);
			await interaction.followUp({
				content: `Selected **${selection}**.`,
				components: [],
				ephemeral: true,
			});
		} else if (interaction.customId === "submitContentSelectMenu") {
			const selection = interaction.values[0];
			const platform = checkPlatform(selection.substring(2, 4));
			const topic = selection.substring(4);

			const submitModal = new ModalBuilder()
				.setCustomId(selection)
				.setTitle("Submit Content: " + platform);
			const submitVideo = new TextInputBuilder()
				.setCustomId("submitVideo")
				.setLabel("Your " + platform + " Link")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);
			const submitTheme = new TextInputBuilder()
				.setCustomId("submitTheme")
				.setLabel("Video Theme")
				.setPlaceholder("What does the video talk about?")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			let firstQuestion = new ActionRowBuilder().addComponents(submitVideo);
			let secondQuestion = new ActionRowBuilder().addComponents(submitTheme);

			submitModal.addComponents(firstQuestion, secondQuestion);

			await interaction
				.showModal(submitModal)
				.catch((error) => {
					console.log(error);
				})
				.then(() => {
					interaction.followUp({
						content: `**Platform** ${platform}\n**Topic** ${topic}`,
						components: [],
						ephemeral: true,
					});
				});
		} else if (interaction.customId.startsWith("askRegionSelectMenu")) {
			await interaction.deferUpdate({ ephemeral: true });

			const selection = interaction.values[0];
			const recordId = interaction.customId.substring(19);

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			const row = new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId("askRewardSelectMenu" + recordId)
					.setPlaceholder("Select your reward type")
			);

			switch (selection) {
				case "Brazil":
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Razer Gold", value: "Razer Gold" },
						{ label: "Netflix Gift Card", value: "Netflix Gift Card" }
					);
					break;
				case "Mexico":
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" },
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" }
					);
					break;
				case "United States":
					row.components[0].addOptions(
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" },
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" },
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" }
					);
					break;
				case "Canada":
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" },
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" }
					);
					break;
				case "Australia":
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" },
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" }
					);
					break;
				case "India":
					row.components[0].addOptions({
						label: "Google Play Gift Card",
						value: "Google Play Gift Card",
					});
					break;
				case "Thailand":
					row.components[0].addOptions(
						{ label: "Razer Gold", value: "Razer Gold" },
						{
							label: "PlayStation Netword Card",
							value: "PlayStation Netword Card",
						},
						{ label: "Netflix Gift Card", value: "Netflix Gift Card" }
					);
					break;
				case "Philippines":
					row.components[0].addOptions({
						label: "Razer Gold",
						value: "Razer Gold",
					});
					break;
				case "Turkey":
					row.components[0].addOptions({
						label: "Google Play Gift Card",
						value: "Google Play Gift Card",
					});
					break;
				case "Russia":
					row.components[0].addOptions(
						{ label: "OZON Gift Card", value: "OZON Gift Card" },
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" },
						{
							label: "PlayStation Netword Card",
							value: "PlayStation Netword Card",
						},
						{ label: "Steam Wallet Code", value: "Steam Wallet Code" }
					);
					break;
				case "Ukraine":
					row.components[0].addOptions({
						label: "Steam Wallet Code",
						value: "Steam Wallet Code",
					});
					break;
				case "Indonesia":
					row.components[0].addOptions({
						label: "Google Play Gift Card",
						value: "Google Play Gift Card",
					});
					break;
				case "EU":
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" }
					);
					break;
				case "United Arab Emirates":
					row.components[0].addOptions({
						label: "PlayStation Netword Card",
						value: "PlayStation Netword Card",
					});
					break;
				default:
					row.components[0].addOptions(
						{ label: "Google Play Gift Card", value: "Google Play Gift Card" },
						{ label: "Amazon Gift Card", value: "Amazon Gift Card" },
						{ label: "Razer Gold", value: "Razer Gold" },
						{ label: "Garena Shells", value: "Garena Shells" },
						{ label: "OZON Gift Card", value: "OZON Gift Card" },
						{ label: "Steam Wallet Code", value: "Steam Wallet Code" },
						{ label: "Apple Gift Card", value: "Apple Gift Card" },
						{
							label: "PlayStation Netword Card",
							value: "PlayStation Netword Card",
						},
						{ label: "iTunes Gift Card", value: "iTunes Gift Card" },
						{ label: "Netflix Gift Card", value: "Netflix Gift Card" }
					);
					break;
			}

			await interaction
				.editReply({
					content: `${interaction.message}\nRegion selected: **${selection}**`,
					components: [row],
				})
				.then(() => {
					feishu.updateRecord(
						tenantToken,
						process.env.REWARD_BASE,
						process.env.DELIVERY,
						recordId,
						{ fields: { Region: [selection], NOTE2: "Asked Reward" } }
					);
				});
		} else if (interaction.customId.startsWith("askRewardSelectMenu")) {
			await interaction.deferUpdate({ ephemeral: true });

			let dm;
			if (interaction.channel.type === ChannelType.DM) {
				dm = true;
			} else {
				dm = false;
			}

			const selection = interaction.values[0];
			const recordId = interaction.customId.substring(19);

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);

			await interaction
				.editReply({
					content: `${interaction.message}\nReward selected: **${selection}**`,
					components: [],
				})
				.then(() => {
					feishu.updateRecord(
						tenantToken,
						process.env.REWARD_BASE,
						process.env.DELIVERY,
						recordId,
						{
							fields: {
								"Reward Type": selection,
								Status: "To Be Purchased",
								NOTE2: "Asked Region & Reward",
							},
						}
					);
				});

			if (!dm) {
				const thread = interaction.channel;
				await thread.members.remove(interaction.user.id);
				await thread.setArchived(true);
				await client.channels
					.fetch(process.env.COLLECT_REWARDS_CHANNEL)
					.then((channel) => {
						channel.permissionOverwrites.delete(
							interaction.user,
							"Chose Region and Reward"
						);
					});
			}
		} else if (interaction.customId.startsWith("platformSelectMenu")) {
			const type = interaction.customId.substring(18);
			switch (type) {
				case "Apply":
					const selection = interaction.values[0];
					const platform = checkPlatform(selection);
					const formatSelection = "ca" + selection;
					await interaction.deferReply({ ephemeral: true });
					const row = await showRegionMenu(formatSelection);
					await interaction.editReply({
						content: `**Platform** ${platform}\n`,
						components: [row],
					});
					break;
				case "Submit":
					await showSubmitModal(interaction);
					break;
				default:
					await interaction.reply({
						content: `Something went wrong. Please contact **Simon#0988** for further assistance.`,
						components: [],
					});
					break;
			}
		} else if (interaction.customId.startsWith("ca")) {
			await showApplyModal(interaction);
		}
	}
});

client.on("messageCreate", async (message) => {
	if (message.channel.type === ChannelType.DM && message.author.bot === false) {
		let msg = message.content;
		let msgAuthor = message.author.username;

		let hasLionRole = await checkMemberRole(
			client,
			process.env.EVO_SERVER,
			message.author.id,
			"990812565892386867"
		);

		if (!hasLionRole) return;

		let body = {
			msg_type: "interactive",
			card: {
				config: {
					wide_screen_mode: true,
				},
				elements: [
					{
						fields: [
							{
								is_short: false,
								text: {
									content: msg,
									tag: "lark_md",
								},
							},
						],
						tag: "div",
					},
					{
						tag: "hr",
					},
				],
				header: {
					template: "red",
					title: {
						content: msgAuthor,
						tag: "plain_text",
					},
				},
			},
		};

		if (message.attachments.size > 0) {
			let attachment = message.attachments.first();
			let file = `${msgAuthor}-dm.jpg`;

			await request.head(attachment.url, function (err, res, body) {
				request(attachment.url).pipe(fs.createWriteStream(file));
			});

			let tenantToken = await feishu.authorize(
				process.env.FEISHU_ID,
				process.env.FEISHU_SECRET
			);
			let response = await feishu.getFileToken(tenantToken, file);
			let image_key = JSON.parse(response).data.image_key;

			body = {
				msg_type: "interactive",
				card: {
					config: {
						wide_screen_mode: true,
					},
					elements: [
						{
							fields: [
								{
									is_short: false,
									text: {
										content: msg,
										tag: "lark_md",
									},
								},
							],
							tag: "div",
						},
						{
							tag: "hr",
						},
						{
							alt: {
								content: "",
								tag: "plaint_text",
							},
							img_key: image_key,
							tag: "img",
						},
					],
					header: {
						template: "red",
						title: {
							content: msgAuthor,
							tag: "plain_text",
						},
					},
				},
			};

			fs.unlinkSync(file);
		}

		await feishu.sendGroupMessage(
			"https://open.larksuite.com/open-apis/bot/v2/hook/f710206e-f9e1-4c7f-9e47-d2c3c6dbd21a",
			body
		);
	}
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
	let rolesToCheck = [
		process.env.CIS_ROLE,
		process.env.PT_ROLE,
		process.env.ES_ROLE,
		process.env.TH_ROLE,
		"972375574406385705",
		"973040050063417376",
		"973040245119524915",
		"973042080823783464",
		"976940106961272994",
		"976940260200169502",
		"984111719292993628",
		"989240355071348746",
		"996876611926364250",
		"996882291945111602",
		"972350125844336680",
		"1017922224776286269",
	];
	let messages = {
		"973278649698648135": "У нас всё готово! 🎉 Сервер открыт.",
		"972350401863122974": "ESTÁS PRONTO!  🎉 O servidor está desbloqueado!",
		"972350282455453756": "¡ESTAS LISTO! 🎉 ¡El servidor está desbloqueado!",
		"972375372660346910": "คุณพร้อมแล้ว! 🎉 เซิร์ฟเวอร์ถูกล็อก",
		"972375574406385705": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"973040050063417376": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"973040245119524915": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"973042080823783464": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"976940106961272994": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"976940260200169502": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"984111719292993628": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"989240355071348746": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"996876611926364250": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"996882291945111602": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"972350125844336680": "YOU ARE ALL SET! 🎉 The server is unlocked!",
		"1017922224776286269": "YOU ARE ALL SET! 🎉 The server is unlocked!",
	};

	const guild = client.guilds.cache.get(process.env.EVO_SERVER);
	const member = await guild.members.fetch(newMember.user.id);

	if (
		!oldMember.roles.cache.has(process.env.CC_ROLE) &&
		newMember.roles.cache.has(process.env.CC_ROLE)
	) {
		const creator = {
			fields: {
				"Discord ID": newMember.user.id,
				"Discord Name": newMember.user.tag,
			},
		};

		const tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		let response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CEP_CREATOR,
				`CurrentValue.[Discord ID] = "${newMember.user.id}"`
			)
		);

		if (response.data.total) {
			logger.debug("Creator already exists.");
			return;
		}

		await feishu.createRecord(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CEP_CREATOR,
			creator
		);

		response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.CODE_BASE,
				process.env.CODE_DATABASE,
				`NOT(CurrentValue.[Status] = "Used")`
			)
		);

		const recordId = response.data.items[0].record_id;
		const code = response.data.items[0].fields["Beta Codes"];
		logger.info(
			`Codes available: ${response.data.total}.\nCodes needed: 1.\nCode: ${code}`
		);

		const embed = new EmbedBuilder()
			.setTitle("Congrats! Now You Are An EVO Creator!")
			.setDescription(
				`Congratulations! Thanks for joining CEP. Together with the official team, we make the EVO community bigger and better!\n\n**Here is your Beta Code. Feel free to try the game and introduce it to your friends & fans!**\n\`${code}\`\n\n**Feel free to enjoy our exclusive benefits! Your benefit level is {benefit level}, which decides how many benefits you can get access to. Please join our official [Creator Evolution Club](https://discord.gg/bexu5aVyrY) to learn about details!**\n- Sneak Peeks into the latest version!\n- Beta codes for you & your fans per month!\n- Chances to win mobile phones or more devices!\n- Chances to become sponsored channels and more!\n- Chances to get access to collaboration opportunities!\n\n*Note:*\n*1. you can only get access to the benefits by joining our club!*n*2. We have the right to ban your code if we find out fraudulent behaviors or code trading.*\n\nGood luck. Have fun!`
			)
			.setColor(`C04946`);

		await member
			.send({ embeds: [embed] })
			.then(() => {
				logger.info(
					`Sent code to ${newMember.user.tag} (${newMember.user.id})`
				);
				feishu.updateRecord(
					tenantToken,
					process.env.CODE_BASE,
					process.env.CODE_DATABASE,
					recordId,
					{
						fields: {
							Status: "Used",
							"Discord ID": newMember.user.id,
						},
					}
				);
			})
			.catch((error) => console.error(error));

		return;
	}

	for (let roleID of rolesToCheck) {
		const role = member.guild.roles.cache.get(roleID);

		if (
			role &&
			!oldMember.roles.cache.has(role.id) &&
			newMember.roles.cache.has(role.id)
		) {
			let userID = newMember.user.id;
			if (!welcomeMessages.has(userID)) {
				let reactEmbed = new EmbedBuilder()
					.setImage(
						"https://media.discordapp.net/attachments/360776228199727105/1024621626970615818/20220928-152953.jpg"
					)
					.setTitle(messages[roleID]);
				await newMember
					.send({
						content: `${newMember.user}`,
						embeds: [reactEmbed],
					})
					.then(() => {
						// logger.debug(
						// 	`Sent welcome embed to ${newMember.user.tag} (${newMember.user.id})`
						// );
					})
					.catch(() => {
						client.channels.fetch("1017550771052617860").then((channel) => {
							channel
								.send({
									content: `${newMember.user}`,
									embeds: [reactEmbed],
								})
								.then((msg) => {
									setTimeout(() => msg.delete(), 5000);
								})
								.catch(console.error);
						});
					});
				welcomeMessages.set(userID, true);
				fs.writeFileSync(
					"welcomeMessages.json",
					JSON.stringify([...welcomeMessages])
				);
			}
			break;
		}
	}
});

client.on("guildMemberAdd", async (member) => {
	if (member.guild.id == process.env.EVO_CEC_SERVER) {
		let hasCCRole = await checkMemberRole(
			client,
			process.env.EVO_SERVER,
			member.user.id,
			process.env.CC_ROLE
		);
		setTimeout(() => {
			if (hasCCRole) {
				member.roles
					.add([process.env.CEC_MEMBER_ROLE])
					.catch((error) => console.error(error));
			} else {
				member
					.send({
						content:
							"You have been kicked from the server because you don't have access to **Creator Evolution Club**.",
					})
					.then(() => {
						member.kick("No CC Role").catch((error) => console.error(error));
					})
					.catch((error) => {
						console.error(error);
						member.kick("No CC Role").catch((error) => console.error(error));
					});
			}
		}, 5000);
	}
});

client.on("messageReactionAdd", async (reaction, user) => {
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (error) {
			console.error("Something went wrong when fetching the message:", error);
			return;
		}
	}

	let message = reaction.message;
	let channel = reaction.message.channelId;

	if (user == client.user) return;
	if (
		reaction.emoji.name === "✅" &&
		channel == process.env.SUGGESTION_DECISION_CHANNEL
	) {
		let discord_id = message.embeds[0].description;
		let category = message.embeds[0].title;
		let username = message.embeds[0].author.name.slice(14);
		let details = message.embeds[0].fields[0].value;
		let region = message.embeds[0].fields[1].value;

		let sugs = {
			fields: {
				"Discord ID": discord_id,
				"Feedback details": details,
				"Feedback Type": category,
				"Players Region": region,
			},
		};

		let tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		await feishu.createRecord(
			tenantToken,
			process.env.FEEDBACK_BASE,
			process.env.FEEDBACK,
			sugs
		);

		await message
			.edit({ content: `✅✅ **ACCEPTED BY ${user}** ✅✅` })
			.then(message.reactions.removeAll());

		const suggestionEmbed = new EmbedBuilder()
			.setTitle(category)
			.setAuthor({ name: `Suggestion by ${username}` })
			.addFields({ name: "Feedback details", value: details })
			.setTimestamp();

		await client.channels
			.fetch("973699891186532433")
			.then((channel) => channel.send({ embeds: [suggestionEmbed] }))
			.then((sentMessage) => {
				sentMessage.react("🔼").then(() => sentMessage.react("🔽"));
			});
	} else if (
		reaction.emoji.name === "❌" &&
		channel == process.env.SUGGESTION_DECISION_CHANNEL
	) {
		await message
			.edit({ content: `❌❌ **REJECTED BY ${user}** ❌❌` })
			.then(message.reactions.removeAll());
	} else if (
		reaction.emoji.name === "🔼" &&
		channel == process.env.VOTE_SUGGESTION_CHANNEL
	) {
		const tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		const details = message.embeds[0].fields[0].value;
		details = details.replace(/"/g, '\\"');

		const count = message.reactions.cache.get("🔼").count;

		let response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.FEEDBACK_BASE,
				process.env.FEEDBACK,
				`CurrentValue.[Feedback details] = "${details}"`
			)
		);

		if (response.data == undefined) {
			response = JSON.stringify(response);
			return logger.warn(
				`Could not add 🔼\n${details}\nUNDEFINED RESPONSE\n${response}`
			);
		} else if (!response.data.total) {
			return logger.warn(`Could not add 🔼\n${details}`);
		}

		await feishu.updateRecord(
			tenantToken,
			process.env.FEEDBACK_BASE,
			process.env.FEEDBACK,
			response.data.items[0].record_id,
			{ fields: { "🔼": count } }
		);
	} else if (
		reaction.emoji.name === "🔽" &&
		channel == process.env.VOTE_SUGGESTION_CHANNEL
	) {
		const tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		const details = message.embeds[0].fields[0].value;
		details = details.replace(/"/g, '\\"');

		const count = message.reactions.cache.get("🔽").count;

		let response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.FEEDBACK_BASE,
				process.env.FEEDBACK,
				`CurrentValue.[Feedback details] = "${details}"`
			)
		);

		if (response.data == undefined) {
			response = JSON.stringify(response);
			return logger.warn(
				`Could not add 🔽\n${details}\nUNDEFINED RESPONSE\n${response}`
			);
		} else if (!response.data.total) {
			return logger.warn(`Could not add 🔽\n${details}`);
		}

		await feishu.updateRecord(
			tenantToken,
			process.env.FEEDBACK_BASE,
			process.env.FEEDBACK,
			response.data.items[0].record_id,
			{ fields: { "🔽": count } }
		);
	}
});

client.on("messageReactionRemove", async (reaction, user) => {
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (error) {
			console.error("Something went wrong when fetching the message:", error);
			return;
		}
	}

	let message = reaction.message;
	let channel = reaction.message.channelId;

	if (user == client.user) return;
	if (
		reaction.emoji.name === "🔼" &&
		channel == process.env.VOTE_SUGGESTION_CHANNEL
	) {
		let tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		let details = message.embeds[0].fields[0].value;
		details = details.replace(/"/g, '\\"');

		let count = message.reactions.cache.get("🔼").count;

		let response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.FEEDBACK_BASE,
				process.env.FEEDBACK,
				`CurrentValue.[Feedback details] = "${details}"`
			)
		);

		if (response.data == undefined) {
			return logger.warn(
				`Could not remove 🔼\n${details}\nUNDEFINED RESPONSE\n${response}`
			);
		} else if (!response.data.total) {
			return logger.warn(`Could not remove 🔼\n${details}`);
		}

		await feishu.updateRecord(
			tenantToken,
			process.env.FEEDBACK_BASE,
			process.env.FEEDBACK,
			response.data.items[0].record_id,
			{ fields: { "🔼": count } }
		);
	} else if (
		reaction.emoji.name === "🔽" &&
		channel == process.env.VOTE_SUGGESTION_CHANNEL
	) {
		let tenantToken = await feishu.authorize(
			process.env.FEISHU_ID,
			process.env.FEISHU_SECRET
		);

		let details = message.embeds[0].fields[0].value;
		details = details.replace(/"/g, '\\"');

		let count = message.reactions.cache.get("🔽").count;

		let response = JSON.parse(
			await feishu.getRecords(
				tenantToken,
				process.env.FEEDBACK_BASE,
				process.env.FEEDBACK,
				`CurrentValue.[Feedback details] = "${details}"`
			)
		);

		if (response.data == undefined) {
			response = JSON.stringify(response);
			return logger.warn(
				`Could not remove 🔽\n${details}\nUNDEFINED RESPONSE\n${response}`
			);
		} else if (!response.data.total) {
			return logger.warn(`Could not remove 🔽\n${details}`);
		}

		await feishu.updateRecord(
			tenantToken,
			process.env.FEEDBACK_BASE,
			process.env.FEEDBACK,
			response.data.items[0].record_id,
			{ fields: { "🔽": count } }
		);
	}
});

client.login(process.env.DISCORD_TOKEN);

// async function ChristmasEvent() {
// 	let christmasEmbed = new EmbedBuilder()
// 		.setTitle("❄️ **Christmas Event** ❄️")
// 		.setColor(`C04946`)
// 		.setImage(
// 			"https://cdn.dribbble.com/users/707812/screenshots/4488314/gift-box-dribbble.gif"
// 		)
// 		.setTimestamp();

// 	let christmasButton = new ButtonBuilder()
// 		.setCustomId("christmasButton")
// 		.setLabel("Open!")
// 		.setStyle(ButtonStyle.Primary)
// 		.setEmoji("🎁");

// 	let christmasButtonDisabled = new ButtonBuilder()
// 		.setCustomId("christmasButton")
// 		.setLabel("Open!")
// 		.setStyle(ButtonStyle.Secondary)
// 		.setEmoji("🎁")
// 		.setDisabled(true);

// 	let christmasRow = new ActionRowBuilder().addComponents(christmasButton);
// 	let christmasRowDisabled = new ActionRowBuilder().addComponents(
// 		christmasButtonDisabled
// 	);

// 	await client.channels.fetch("1054640415342592001").then((channel) => {
// 		channel.messages
// 			.fetch({ limit: 1 })
// 			.then((messages) => {
// 				let lastMessage = messages.first();
// 				lastMessage
// 					.edit({
// 						embeds: [christmasEmbed],
// 						components: [christmasRowDisabled],
// 					})
// 					.then(() => {
// 						channel
// 							.send({
// 								embeds: [christmasEmbed],
// 								components: [christmasRow],
// 							})
// 							.catch(console.error);
// 					})
// 					.catch(console.error);
// 			})
// 			.catch(console.error);
// 	});

// 	alreadyPressed = [];
// }

async function CCESDataCalculation() {
	let tenantToken = await feishu.authorize(
		process.env.FEISHU_ID,
		process.env.FEISHU_SECRET
	);
	let response = JSON.parse(
		await feishu.getRecords(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CEP_SUBMISSION,
			'AND(CurrentValue.[Validity] = "VALID")'
		)
	);

	if (!response.data.total) {
		console.log("No VALID entries found.");
		await CCESRewardCalculation(tenantToken);
		return;
	}
	let records = response.data.items;

	let recordsSimplified = [];
	records.forEach(function (record) {
		recordsSimplified.push({
			"Discord ID": record.fields["Discord ID"],
			"Discord Name": record.fields["Discord Name"],
			"CEC Member": record.fields["CEC Member"],
			"Valid Views": parseInt(record.fields.Views),
			"Valid Videos": 1,
		});
	});

	let uniqueRecords = Object.values(
		recordsSimplified.reduce((acc, item) => {
			acc[item["Discord ID"]] = acc[item["Discord ID"]]
				? {
						...item,
						"Valid Views":
							item["Valid Views"] + acc[item["Discord ID"]]["Valid Views"],
						"Valid Videos":
							item["Valid Videos"] + acc[item["Discord ID"]]["Valid Videos"],
				  }
				: item;
			return acc;
		}, {})
	);

	let finalData = {
		records: [],
	};

	for (const record of uniqueRecords) {
		let response = await feishu.getRecords(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CCES_DATA,
			`CurrentValue.[Discord ID] = "${record["Discord ID"]}"`
		);
		response = JSON.parse(response);
		if (response.data.total) {
			await feishu.updateRecord(
				tenantToken,
				process.env.CEP_BASE,
				process.env.CCES_DATA,
				response.data.items[0].record_id,
				{
					fields: {
						"Discord ID": record["Discord ID"],
						"CEC Member": record["CEC Member"],
						"Valid Views": record["Valid Views"],
						"Valid Videos": record["Valid Videos"],
					},
				}
			);
			record.updated = true;
		} else record.updated = false;
	}

	if (uniqueRecords.length > 0) {
		uniqueRecords.forEach(function (record) {
			if (!record.updated) {
				delete record.updated;
				let tempObject = {
					fields: record,
				};
				finalData.records.push(tempObject);
			}
		});
	} else {
		console.log(
			"Successfully entered CCES Data. Now calculating CCES Rewards..."
		);
		await CCESRewardCalculation(tenantToken);
		return;
	}

	if (finalData.records.length == 0) {
		console.log(
			"Successfully entered CCES Data. Now calculating CCES Rewards..."
		);
		await CCESRewardCalculation(tenantToken);
		return;
	}

	for (let i = 0; i < finalData.records.length; i++) {
		let userId = finalData.records[i].fields["Discord ID"];

		let hasCCRole = await checkMemberRole(
			client,
			process.env.EVO_SERVER,
			userId,
			process.env.CC_ROLE
		);

		let hasCECRole = await checkMemberRole(
			client,
			process.env.EVO_SERVER,
			userId,
			process.env.CEC_MEMBER_ROLE
		);

		if (hasCCRole) {
			finalData.records[i].fields["Content Creators"] = "Content Creators";
		} else {
			finalData.records[i].fields["Content Creators"] = "NO";
		}

		if (hasCECRole) {
			finalData.records[i].fields["CEC Member"] = "CEC Member";
		} else {
			finalData.records[i].fields["CEC Member"] = "NO";
		}
	}

	let success = await feishu.createRecords(
		tenantToken,
		process.env.CEP_BASE,
		process.env.CCES_DATA,
		finalData
	);
	success
		? console.log(
				"Successfully entered CCES Data. Now calculating CCES Rewards..."
		  )
		: console.log("Failed to enter CCES Data. Now calculation CCES Rewards...");

	await CCESRewardCalculation(tenantToken);
}

async function CCESRewardCalculation(tenantToken) {
	let response = await feishu.getRecords(
		tenantToken,
		process.env.CEP_BASE,
		process.env.CCES_DATA
	);
	response = JSON.parse(response);

	if (!response.data.total)
		return console.log("No entries found in CCES Data Calculation bitable.");
	let records = response.data.items;

	let recordsSimplified = [];

	for (const record of records) {
		let discordId = record.fields["Discord ID"];
		let views = parseInt(record.fields["Valid Views"]);
		let videos = parseInt(record.fields["Valid Videos"]);
		let recordId = record.record_id;
		let proReward = 0;
		let newbieReward = [];

		if (views >= 1000 && views < 3000) {
			proReward = 10;
		} else if (views >= 3000 && views < 5000) {
			proReward = 25;
		} else if (views >= 5000 && views < 10000) {
			proReward = 50;
		} else if (views >= 10000 && views < 30000) {
			proReward = 75;
		} else if (views >= 30000) {
			proReward = 200;
		}

		if (videos >= 1 && views >= 500) {
			newbieReward.push("Beginners");
		}

		recordsSimplified.push({
			recordId: recordId,
			"Discord ID": discordId,
			"Pro Reward Value": proReward,
			"Title Reward": newbieReward,
			"Other Reward Value": 0,
			views: views,
			videos: videos,
		});
	}

	recordsSimplified.sort((a, b) => {
		return b.views - a.views;
	});

	if (recordsSimplified[0]) {
		recordsSimplified[0]["Title Reward"].push("Outstanding Creator TOP1");
		recordsSimplified[0]["Other Reward Value"] += 100;
	}
	if (recordsSimplified[1]) {
		recordsSimplified[1]["Title Reward"].push("Outstanding Creator TOP2");
		recordsSimplified[1]["Other Reward Value"] += 50;
	}
	if (recordsSimplified[2]) {
		recordsSimplified[2]["Title Reward"].push("Outstanding Creator TOP3");
		recordsSimplified[2]["Other Reward Value"] += 25;
	}

	recordsSimplified.sort((a, b) => {
		return b.videos - a.videos;
	});

	if (recordsSimplified[0]) {
		recordsSimplified[0]["Title Reward"].push("Amazing Productivity TOP1");
		recordsSimplified[0]["Other Reward Value"] += 100;
	}
	if (recordsSimplified[1]) {
		recordsSimplified[1]["Title Reward"].push("Amazing Productivity TOP2");
		recordsSimplified[1]["Other Reward Value"] += 50;
	}
	if (recordsSimplified[2]) {
		recordsSimplified[2]["Title Reward"].push("Amazing Productivity TOP3");
		recordsSimplified[2]["Other Reward Value"] += 25;
	}

	for (const record of recordsSimplified) {
		let recordId = record.recordId;
		delete record.recordId;
		delete record.views;
		delete record.videos;
		await feishu.updateRecord(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CCES_DATA,
			recordId,
			{ fields: record }
		);
	}

	console.log("Successfully entered CCES Reward Data.");
}

async function CECCheck() {
	let tenantToken = await feishu.authorize(
		process.env.FEISHU_ID,
		process.env.FEISHU_SECRET
	);
	let response = await feishu.getRecords(
		tenantToken,
		process.env.CEP_BASE,
		process.env.CEC_APP,
		`CurrentValue.[Data Review] = "CHECK"`
	);
	response = JSON.parse(response);

	if (!response.data.total) {
		console.log('No entries set to "CHECK" for review.');
		//await CECQualifyCheck(tenantToken);
		return;
	}

	let records = response.data.items;
	let recordsSimplified = [];
	records.forEach(function (record) {
		recordsSimplified.push({
			recordId: record.record_id,
			"Discord ID": record.fields["Discord ID"],
			"Total Views": 0,
			"Total Videos": 0,
		});
	});

	for (const record of recordsSimplified) {
		let res = await feishu.getRecords(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CCES_DATA,
			`CurrentValue.[Discord ID] = "${record["Discord ID"]}"`
		);
		res = JSON.parse(res);
		if (res.data.total) {
			record["Total Views"] = parseInt(res.data.items[0].fields["Valid Views"]);
			record["Total Videos"] = parseInt(
				res.data.items[0].fields["Valid Videos"]
			);
		}
		let recordId = record.recordId;
		delete record.recordId;
		delete record["Discord ID"];
		record["Data Review"] = "DONE";
		console.log(record);
		await feishu.updateRecord(
			tenantToken,
			process.env.CEP_BASE,
			process.env.CEC_APP,
			recordId,
			{ fields: record }
		);
	}
	console.log("Completed CEC Check.");
	//await CECQualifyCheck(tenantToken);
}

// async function CECQualifyCheck(tenantToken) {
// 	let response = await feishu.getRecords(
// 		tenantToken,
// 		process.env.CEP_BASE,
// 		process.env.CEC_APP,
// 		`CurrentValue.[Qualification] = "Accepted"`
// 	);
// 	response = JSON.parse(response);

// 	if (!response.data.total) {
// 		console.log('No entries set to "Accepted" for qualification.');
// 		return;
// 	}

// 	let records = response.data.items;
// 	for (const record of records) {
// 		let guild = client.guilds.cache.get(process.env.EVO_SERVER);
// 		let member = guild.members.cache.get(record.fields["Discord ID"]);
// 		let cecEmbed = new EmbedBuilder()
// 			.setTitle("Congrats! You become members of Creator Evolution Club!")
// 			.setDescription(
// 				"Now the following exclusive benefits are waiting for you to win!\n- Beta codes for your fans (up to 200 codes/month)\n- Creator foundation (including high-end phones worth $800+)\n- Official support from dev team\n\nStaff from dev team will contact you in private very soon!"
// 			);

// 		await member.roles
// 			.add(process.env.CEC_MEMBER_ROLE)
// 			.then(() => {
// 				console.log(`Added role to ${member.user.tag}`);
// 				let qualification = "DONE";
// 				member
// 					.send({ embeds: [cecEmbed] })
// 					.then(() => {
// 						console.log(`Sent message to ${member.user.tag}`);
// 						qualification = "DONE";
// 					})
// 					.catch((error) => {
// 						console.log(error);
// 						qualification = "DONE (NO DM)";
// 					});
// 				feishu.updateRecord(
// 					tenantToken,
// 					process.env.CEP_BASE,
// 					process.env.CEC_APP,
// 					record.record_id,
// 					{ fields: { Qualification: qualification } }
// 				);
// 			})
// 			.catch((error) => {
// 				console.log(error);
// 				feishu.updateRecord(
// 					tenantToken,
// 					process.env.CEP_BASE,
// 					process.env.CEC_APP,
// 					record.record_id,
// 					{ fields: { Qualification: "Left Server" } }
// 				);
// 			});
// 	}
// 	console.log("Successfully checked qualification data.");
// }

function interactionRegionRole(interaction) {
	let roles = [],
		regions = "";
	if (interaction.member.roles.cache.has(process.env.CIS_ROLE))
		roles.push("CIS");
	if (interaction.member.roles.cache.has(process.env.PT_ROLE)) roles.push("PT");
	if (interaction.member.roles.cache.has(process.env.ES_ROLE)) roles.push("ES");
	if (interaction.member.roles.cache.has(process.env.TH_ROLE)) roles.push("TH");
	if (interaction.member.roles.cache.has("972375574406385705"))
		roles.push("FR");
	if (interaction.member.roles.cache.has("973040050063417376"))
		roles.push("TR");
	if (interaction.member.roles.cache.has("973040245119524915"))
		roles.push("DE");
	if (interaction.member.roles.cache.has("973042080823783464"))
		roles.push("VN");
	if (interaction.member.roles.cache.has("976940106961272994"))
		roles.push("AR");
	if (interaction.member.roles.cache.has("976940260200169502"))
		roles.push("PH");
	if (interaction.member.roles.cache.has("984111719292993628"))
		roles.push("HI");
	if (interaction.member.roles.cache.has("989240355071348746"))
		roles.push("PL");
	if (interaction.member.roles.cache.has("996876611926364250"))
		roles.push("FA");
	if (interaction.member.roles.cache.has("996882291945111602"))
		roles.push("IN");
	if (interaction.member.roles.cache.has("972350125844336680"))
		roles.push("EN");
	if (interaction.member.roles.cache.has("1017922224776286269"))
		roles.push("Global");

	roles.forEach(function (items) {
		regions = regions.concat(items, " ");
	});

	return regions;
}

async function checkMemberRole(client, guildId, userId, roleId) {
	// logger.debug(`Checking if user ${userId} has role ${roleId} in guild ${guildId}`);
	const guild = client.guilds.cache.get(guildId);
	const member = await guild.members.fetch(userId);
	if (member == undefined) {
		// logger.debug(`User ${userId} not found in guild ${guildId}`);
		return false;
	}
	if (member.roles.cache.has(roleId)) {
		// logger.debug(`User ${userId} has role ${roleId} in guild ${guildId}`);
		return true;
	} else {
		// logger.debug(`User ${userId} does not have role ${roleId} in guild ${guildId}`);
		return false;
	}
}

async function checkRoles(interaction, userId, rolesToCheck) {
	const member = await interaction.guild.members.fetch(userId);
	let roles = [];

	for (const role of rolesToCheck) {
		if (member.roles.cache.has(role)) {
			roles.push(role);
		}
	}

	return roles;
}

function checkURL(text) {
	if (text.includes("www.")) {
		text = text.replace("www.", "");
	}
	const expression =
		/^(https?\:\/\/)?((www\.)?youtube\.com|youtu\.be|tiktok.com|taptap.io|twitter.com|instagram.com|twitch.com)\/.+$/;
	const regex = new RegExp(expression);

	if (text.match(regex)) {
		return true;
	} else return false;
}

function onlyDigits(string) {
	return string.replace(/\D/g, "");
}

async function checkOldFiles() {
	// Use __dirname to get the absolute path of the directory that the script is in
	const rootDir = __dirname;

	// Read all files in the root directory
	fs.readdir(rootDir, (err, files) => {
		if (err) {
			console.error(err);
			return;
		}

		// Iterate through each file
		for (const file of files) {
			// Get the full path of the file
			const filePath = path.join(rootDir, file);

			if (!file.endsWith("-bug.jpg")) {
				continue;
			}

			// Get the timestamp of when the file was last modified
			fs.stat(filePath, (err, stats) => {
				if (err) {
					console.error(err);
					return;
				}

				// Check if the file is older than 1 hour
				const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60);
				if (stats.mtime < oneHourAgo) {
					console.log(`${file} is older than 1 hour.`);
					fs.unlinkSync(file);
				}
			});
		}
	});
}

async function loadWelcomeMessages() {
	try {
		welcomeMessages = new Map(
			JSON.parse(fs.readFileSync("welcomeMessages.json"))
		);
	} catch (err) {
		welcomeMessages = new Map();
	}
}

function checkPlatform(code) {
	let platform = "";
	switch (code) {
		case "YT":
			platform = "YouTube";
			break;
		case "SH":
			platform = "YouTube Shorts";
			break;
		case "TK":
			platform = "TikTok";
			break;
		case "TP":
			platform = "TapTap";
			break;
		case "TW":
			platform = "Twitch";
			break;
		case "TT":
			platform = "Twitter";
			break;
		case "IG":
			platform = "Instagram";
			break;
		default:
			platform = "YouTube";
			break;
	}
	return platform;
}

function checkRegion(code) {
	let region = "";
	switch (code) {
		case "BR":
			region = "Brazil";
			break;
		case "MX":
			region = "Mexico";
			break;
		case "US":
			region = "United States";
			break;
		case "CN":
			region = "Canada";
			break;
		case "PH":
			region = "Philippines";
			break;
		case "TH":
			region = "Thailand";
			break;
		case "SG":
			region = "Singapore";
			break;
		case "RU":
			region = "Russia";
			break;
		case "IN":
			region = "India";
			break;
		case "IQ":
			region = "Iraq";
			break;
		case "IL":
			region = "Israel";
			break;
		case "SA":
			region = "Saudi Arabia";
			break;
		case "AE":
			region = "United Arab Emirates";
			break;
		case "TR":
			region = "Turkey";
			break;
		case "GB":
			region = "United Kingdom";
			break;
		case "UA":
			region = "Ukraine";
			break;
		case "DO":
			region = "Dominican Republic";
			break;
		case "OT":
			region = "Other";
			break;
		default:
			region = "Other";
			break;
	}
	return region;
}

async function showApplyModal(interaction) {
	const selection = interaction.values[0];
	const platform = checkPlatform(interaction.customId.substring(2));
	const formatSelection = interaction.customId + selection;

	const creatorModal = new ModalBuilder()
		.setCustomId(formatSelection)
		.setTitle(`${platform} Creator Application`);
	const creatorModalChannel = new TextInputBuilder()
		.setCustomId("creatorModalChannel")
		.setLabel(`Your ${platform} Channel Link`)
		.setPlaceholder("http://youtube.com/c/PROJECTEVOGAME")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);
	const creatorModalSubs = new TextInputBuilder()
		.setCustomId("creatorModalSubs")
		.setLabel("How many subscribers do you have?")
		.setPlaceholder("1000+")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	let firstQuestion = new ActionRowBuilder().addComponents(creatorModalChannel);
	let secondQuestion = new ActionRowBuilder().addComponents(creatorModalSubs);

	creatorModal.addComponents(firstQuestion, secondQuestion);

	await interaction.showModal(creatorModal);
}

async function showSubmitModal(interaction) {
	await interaction.deferUpdate({ ephemeral: true });
	const selection = interaction.values[0];
	const platform = checkPlatform(selection);
	const formatSelection = "sc" + selection;

	const submitContentSelectMenu = new StringSelectMenuBuilder()
		.setCustomId("submitContentSelectMenu")
		.setPlaceholder("Select a topic")
		.addOptions(
			{
				label: "ECC - Gameplay Guide",
				value: formatSelection + "ECC - Gameplay Guide",
			},
			{
				label: "ECC - Storytelling",
				value: formatSelection + "ECC - Storytelling",
			},
			{
				label: "ECC - Entertaining Montages",
				value: formatSelection + "ECC - Entertaining Montages",
			},
			{
				label: "Beta 1.3 Update",
				value: formatSelection + "Beta 1.3 Update",
			},
			{
				label: "God of Guns",
				value: formatSelection + "God of Guns",
			},
			{
				label: "Building Expert",
				value: formatSelection + "Building Expert",
			},
			{
				label: "Become The Richest",
				value: formatSelection + "Become The Richest",
			},
			{
				label: "Conquer Kane",
				value: formatSelection + "Conquer Kane",
			},
			{
				label: "Highlight / Funny Moment",
				value: formatSelection + "Highlight / Funny Moment",
			},
			{
				label: "Emberland Raider Challenge",
				value: formatSelection + "Emberland Raider Challenge",
			},
			{
				label: "Other Topics",
				value: formatSelection + "Other Topics",
			}
		);

	let row = new ActionRowBuilder().addComponents(submitContentSelectMenu);

	await interaction.editReply({
		content: `**What topic your content is about?**\n\n**Platform** ${platform}`,
		components: [row],
	});
}

async function platformMenu(customId) {
	const platformSelectMenu = new StringSelectMenuBuilder()
		.setCustomId(customId)
		.setPlaceholder("Select your platform")
		.addOptions(
			{
				label: "YouTube",
				value: "YT",
			},
			{
				label: "YouTube Shorts",
				value: "SH",
			},
			{
				label: "TikTok",
				value: "TK",
			},
			{
				label: "TapTap",
				value: "TP",
			},
			{
				label: "Twitch",
				value: "TW",
			},
			{
				label: "Twitter",
				value: "TT",
			},
			{
				label: "Instagram",
				value: "IG",
			}
		);

	const row = new ActionRowBuilder().addComponents(platformSelectMenu);
	return row;
}

async function showRegionMenu(customId) {
	const regionSelectMenu = new StringSelectMenuBuilder()
		.setCustomId(customId)
		.setPlaceholder("Select your region")
		.addOptions(
			{
				label: "Brazil",
				value: "BR",
			},
			{
				label: "Mexico",
				value: "MX",
			},
			{
				label: "United States",
				value: "US",
			},
			{
				label: "Canada",
				value: "CN",
			},
			{
				label: "Philippines",
				value: "PH",
			},
			{
				label: "Thailand",
				value: "TH",
			},
			{
				label: "Singapore",
				value: "SG",
			},
			{
				label: "Russia",
				value: "RU",
			},
			{
				label: "India",
				value: "IN",
			},
			{
				label: "Iraq",
				value: "IQ",
			},
			{
				label: "Israel",
				value: "IL",
			},
			{
				label: "Saudi Arabia",
				value: "SA",
			},
			{
				label: "United Arab Emirates",
				value: "AE",
			},
			{
				label: "Turkey",
				value: "TR",
			},
			{
				label: "United Kingdom",
				value: "GB",
			},
			{
				label: "Ukraine",
				value: "UA",
			},
			{
				label: "Dominican Republic",
				value: "DO",
			},
			{
				label: "Other Regions",
				value: "OT",
			}
		);

	const row = new ActionRowBuilder().addComponents(regionSelectMenu);
	return row;
}
