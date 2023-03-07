const { trace } = require("console");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const feishu = require("../feishu.js");
require("dotenv").config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("addbeta")
		.setDescription("Give beta tester role to a user.")
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("The user to give role to.")
				.setRequired(true)
		),

	async execute(interaction, client) {
		await interaction.deferReply({ ephemeral: true });
		const target = await interaction.options.getUser("user");
		console.log(target);

		const member = await interaction.guild.members.fetch(target.user.id);
		await member.roles.add(process.env.BETA_ROLE);
		await interaction.editReply({
			content: `Added beta tester role to ${target}.`,
		});

		const embed = new EmbedBuilder()
			.setTitle("Beta Tester Role Added")
			.setDescription(
				`${interaction.user} added beta tester role to ${target}`
			);

		client.channels
			.fetch("951854256477077554")
			.then((channel) => channel.send({ embeds: [embed] }));
	},
};
