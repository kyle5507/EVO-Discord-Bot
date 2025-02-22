const { SlashCommandBuilder, ChannelType } = require("discord.js");
const logger = require("../logging/logger.js");
require("dotenv").config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("update")
		.setDescription("Update a command.")
		.addStringOption((option) =>
			option
				.setName("command")
				.setDescription("The command to reload.")
				.setRequired(true)
		),

	async execute(interaction) {
		if (interaction.user.id != process.env.MY_ID) {
			return;
		}

		const commandName = interaction.options
			.getString("command", true)
			.toLowerCase();
		const command = interaction.client.commands.get(commandName);

		if (!command) {
			return interaction.reply({
				content: `There is no command with name \`${commandName}\`!`,
				ephemeral: true,
			});
		}

		delete require.cache[require.resolve(`./${command.data.name}.js`)];

		try {
			interaction.client.commands.delete(command.data.name);
			const newCommand = require(`./${command.data.name}.js`);
			interaction.client.commands.set(newCommand.data.name, newCommand);
			await interaction.reply({
				content: `Command \`${newCommand.data.name}\` was reloaded!`,
				ephemeral: true,
			});
		} catch (error) {
			console.error(error);
			await interaction.reply({
				content: `There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``,
				ephemeral: true,
			});
		}
	},
};
